import os
import time
import logging
from requests.exceptions import HTTPError, ConnectionError, Timeout
from pyairtable import Api

logger = logging.getLogger(__name__)

STATUS_MAPPING = {
    'todo': 'Todo',
    'in_progress': 'In progress',
    'review': 'Review',
    'done': 'Done',
}


def is_transient_error(error: Exception) -> bool:
    if isinstance(error, (ConnectionError, Timeout)):
        return True
    if isinstance(error, HTTPError) and error.response is not None:
        status_code = error.response.status_code
        return status_code == 429 or 500 <= status_code < 600
    return False


def export_tasks_to_airtable(tasks, api_key=None, base_id=None, table_name=None, max_retries=3, custom_table=None, sleep_fn=time.sleep):
    if custom_table is not None:
        table = custom_table
    else:
        api_key = api_key or os.environ.get('AIRTABLE_API_KEY')
        base_id = base_id or os.environ.get('AIRTABLE_BASE_ID')
        table_name = table_name or os.environ.get('AIRTABLE_TABLE_NAME', 'Tasks')

        if not api_key or not base_id:
            raise ValueError("Airtable credentials (AIRTABLE_API_KEY, AIRTABLE_BASE_ID) are missing.")

        api = Api(api_key)
        table = api.table(base_id, table_name)

    exported_count = 0
    created_count = 0
    updated_count = 0
    failed_count = 0
    errors = []

    records_to_export = []
    for task in tasks:
        assignee_name = task.assignee.name if task.assignee else ""
        fields = {
            'Task ID': str(task.id),
            'Title': task.title,
            'Description': task.description or "",
            'Status': STATUS_MAPPING.get(task.status, 'Todo'),
            'Assignee': assignee_name,
            'Project ID': str(task.project_id),
        }
        records_to_export.append({'fields': fields, 'task_id': str(task.id), 'title': task.title})

    # Process in chunks of 10 (Airtable's limit for batch operations)
    batch_size = 10
    for i in range(0, len(records_to_export), batch_size):
        chunk = records_to_export[i:i + batch_size]
        batch_records = [{'fields': item['fields']} for item in chunk]

        success = False
        last_error = None
        for attempt in range(max_retries):
            try:
                result = table.batch_upsert(batch_records, key_fields=['Task ID'])
                created = len(result.get('createdRecords', []))
                updated = len(result.get('updatedRecords', []))
                created_count += created
                updated_count += updated
                exported_count += (created + updated)
                success = True
                break
            except Exception as e:
                last_error = e
                if is_transient_error(e) and attempt < max_retries - 1:
                    sleep_time = (2 ** attempt) * 0.5
                    sleep_fn(sleep_time)
                    continue
                else:
                    break

        if not success:
            # Fall back to single record upserting so one invalid record doesn't block the rest
            for item in chunk:
                single_success = False
                single_err = None
                for attempt in range(max_retries):
                    try:
                        res = table.batch_upsert([{'fields': item['fields']}], key_fields=['Task ID'])
                        created = len(res.get('createdRecords', []))
                        updated = len(res.get('updatedRecords', []))
                        created_count += created
                        updated_count += updated
                        exported_count += (created + updated)
                        single_success = True
                        break
                    except Exception as e:
                        single_err = e
                        if is_transient_error(e) and attempt < max_retries - 1:
                            sleep_fn((2 ** attempt) * 0.5)
                            continue
                        else:
                            break
                if not single_success:
                    failed_count += 1
                    err_msg = str(single_err or last_error)
                    errors.append(f"Task '{item['title']}' ({item['task_id']}): {err_msg}")

    return {
        'exported': exported_count,
        'created': created_count,
        'updated': updated_count,
        'failed': failed_count,
        'errors': errors,
    }
