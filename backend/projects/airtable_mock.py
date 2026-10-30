from unittest.mock import Mock
from requests.exceptions import HTTPError


class MockAirtableTable:
    """Test double for pyairtable.Table supporting batch_upsert, all, and error simulation."""
    def __init__(self, should_fail=False, fail_times=0, error_status=500, fail_for_titles=None):
        self.records = {}
        self.should_fail = should_fail
        self.fail_times = fail_times
        self.attempts = 0
        self.error_status = error_status
        self.fail_for_titles = fail_for_titles or []

    def batch_upsert(self, records, key_fields=['Task ID']):
        self.attempts += 1
        if self.should_fail:
            response = Mock(status_code=self.error_status)
            raise HTTPError(f"Airtable {self.error_status} error", response=response)

        if self.fail_times > 0 and self.attempts <= self.fail_times:
            response = Mock(status_code=self.error_status)
            raise HTTPError(f"Airtable transient {self.error_status} error", response=response)

        for r in records:
            if r['fields'].get('Title') in self.fail_for_titles:
                response = Mock(status_code=422)
                raise HTTPError(f"Airtable 422 unprocessable entity: invalid title '{r['fields'].get('Title')}'", response=response)

        created = []
        updated = []
        for r in records:
            key = r['fields'].get('Task ID')
            if key in self.records:
                self.records[key] = r['fields']
                updated.append(f"rec_{key}")
            else:
                self.records[key] = r['fields']
                created.append(f"rec_{key}")
        return {
            'createdRecords': created,
            'updatedRecords': updated,
            'records': list(self.records.values())
        }

    def all(self):
        return [{'fields': v} for v in self.records.values()]
