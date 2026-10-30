# Code Review: TaskBoard Application

## Executive Summary

A comprehensive code review of the TaskBoard application was conducted across backend (`Django 5` / `Django REST Framework` / `PostgreSQL`) and frontend (`React 18` / `TypeScript` / `TanStack Query`) codebases. 

The review identified critical vulnerabilities and architectural flaws that directly affect application security, data integrity, and system scalability. Below are the **top 4 issues prioritized by business impact**, followed by proof-of-concept demonstrations and actionable remediation steps.

---

## Summary of Top 4 Issues

| Priority | Issue | Category | Severity | File Reference |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | [Raw SQL Injection in Task Search Parameter](#issue-1-raw-sql-injection-in-task-search-parameter) | **Security** | **Critical** (CVSS 9.8) | `backend/projects/views.py:110-123` |
| **#2** | [Broken Object-Level Authorization (BOLA/IDOR) on Task Updates](#issue-2-broken-object-level-authorization-bolaidor-on-task-updates) | **Security** | **High** (CVSS 8.5) | `backend/projects/views.py:165-185` |
| **#3** | [Frontend-Backend Schema Naming Mismatch Causing Silent Assignee Deletion](#issue-3-frontend-backend-schema-naming-mismatch-causing-silent-assignee-deletion) | **Data Integrity** | **High** | `backend/projects/serializers.py:23-26`<br>`frontend/src/components/TaskDetail.tsx:19, 46-53` |
| **#4** | [N+1 Query Multiplier and Redundant Prefetching in Project Listing](#issue-4-n1-query-multiplier-and-redundant-prefetching-in-project-listing) | **Performance** | **Medium** | `backend/projects/views.py:23-42` |

---

## Detailed Issue Analysis

### Issue 1: Raw SQL Injection in Task Search Parameter

- **File & Line Reference:** [`backend/projects/views.py:110-123`](file:///e:/ajackus/q-taskboard/backend/projects/views.py#L110-L123)
- **Category:** `Security`
- **Severity:** **Critical** (CVSS 9.8)
- **Description:**  
  In `TaskListCreateView.get`, when a search filter `?q=` is supplied, the endpoint bypasses Django ORM and concatenates user input directly into a raw SQL query using Python f-strings. This introduces a textbook SQL injection vulnerability where an attacker can escape the search pattern and `project_id` clause. A malicious user can bypass tenant/project boundaries to read confidential tasks across all projects or perform UNION-based attacks to exfiltrate database tables, including user credentials and password hashes.
- **Recommended Fix:**  
  Eliminate the raw SQL string formatting completely and utilize Django ORM’s parameterized querying with `Q` objects. This guarantees proper input sanitization, enforces the project filter, and ensures consistent serializer output:
  ```python
  from django.db.models import Q

  class TaskListCreateView(APIView):
      def get(self, request, project_id):
          membership = _get_membership(request.user, project_id)
          if not membership:
              return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)

          q = request.query_params.get('q')
          tasks = Task.objects.filter(project_id=project_id).select_related('assignee')
          if q:
              tasks = tasks.filter(Q(title__icontains=q) | Q(description__icontains=q))

          tasks = tasks.order_by('position')
          return Response({'tasks': TaskSerializer(tasks, many=True).data})
  ```

#### Proof of Vulnerability (PoC Demonstration)

##### 1. Bypassing Project Boundaries (Cross-Project Data Leak)

> [!NOTE]
> Database seeds generate fresh random UUIDs each run. Always resolve the active `$PROJECT_ID` dynamically:

```bash
# 1. Obtain JWT access token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}' \
  | python -c "import sys, json; print(json.load(sys.stdin)['token'])")

# 2. Dynamically retrieve the current project ID for 'Q3 Launch'
PROJECT_ID=$(curl -s http://localhost:8000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys, json; print(next(p['id'] for p in json.load(sys.stdin)['projects'] if p['name'] == 'Q3 Launch'))")

echo "Target Project ID: $PROJECT_ID"

# 3. Execute SQL injection payload via ?q=
curl -s -X GET "http://localhost:8000/api/projects/$PROJECT_ID/tasks?q=%27)%20OR%201=1%20--" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (Truncated excerpt showing cross-tenant tasks leaked):**
```json
{
  "tasks": [
    {
      "id": "5faaab6d-e3ef-40b6-8e05-2caaa3750a14",
      "project_id": "d3e6af12-3b03-4fe6-9c25-ae413289659b",
      "title": "Finalize launch date with marketing",
      "status": "done"
    },
    {
      "id": "e4dd27d0-fc5c-4fb3-84ca-8567a75094b6",
      "project_id": "5df76289-1960-4805-8ea6-f7c6991f9548",
      "title": "Map current onboarding funnel",
      "status": "done"
    }
  ]
}
```
*Result: Tasks from project `5df76289-1960-4805-8ea6-f7c6991f9548` (`Customer Onboarding Revamp`) are returned despite querying `Q3 Launch`.*

##### 2. UNION-Based Account & Password Hash Exfiltration
Injecting `') UNION SELECT id, NULL, email, password, 'todo', NULL, NULL, -1, now(), now() FROM users --`:

```bash
curl -s -X GET "http://localhost:8000/api/projects/$PROJECT_ID/tasks?q=%27)%20UNION%20SELECT%20id%2C%20NULL%2C%20email%2C%20password%2C%20%27todo%27%2C%20NULL%2C%20NULL%2C%20-1%2C%20now()%2C%20now()%20FROM%20users%20--" \
  -H "Authorization: Bearer $TOKEN"
```

**Response Excerpt:**
```json
{
  "tasks": [
    {
      "id": "4280d5e1-cc60-4335-825b-17c6e06ac14b",
      "title": "meera@taskboard.dev",
      "description": "pbkdf2_sha256$1000000$HlsRWKDo6LPWl7RmozREV1$LXERcJg1JNNXybgY7FaA6e0WYKtHuKnilncrblEDSAE="
    },
    {
      "id": "862744cc-55ee-4bd8-9c2b-d2fed0f51a7d",
      "title": "arjun@taskboard.dev",
      "description": "pbkdf2_sha256$1000000$XzCynBD99B2DZ2sImHr3Uq$HQPToEKXo941MHJJr6Or4w2Qk30SFzwZ3UEub0/w3yI="
    }
  ]
}
```
*Result: The application dumped all system user accounts and PBKDF2 password hashes.*

---

### Issue 2: Broken Object-Level Authorization (BOLA/IDOR) on Task Updates

- **File & Line Reference:** [`backend/projects/views.py#L165-L185`](file:///e:/ajackus/q-taskboard/backend/projects/views.py#L165-L185)
- **Category:** `Security`
- **Severity:** **High** (CVSS 8.5)
- **Description:**  
  `TaskDetailView.patch` permits any authenticated user to modify task attributes (title, description, status, assignee) without checking whether the user is a member of the task's parent project or possesses edit privileges. While task creation and task deletion explicitly enforce `_get_membership()` and `_can_edit_tasks()`, `patch` performs no authorization checks. As a result, non-members can tamper with private projects and users with the read-only `viewer` role can alter project states.
- **Recommended Fix:**  
  Validate that the requesting user belongs to the task’s project and has an `admin` or `member` role before processing changes:
  ```python
  class TaskDetailView(APIView):
      def patch(self, request, task_id):
          try:
              task = Task.objects.select_related('project').get(id=task_id)
          except Task.DoesNotExist:
              return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)

          membership = _get_membership(request.user, str(task.project_id))
          if not membership:
              return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)
          if not _can_edit_tasks(membership.role):
              return Response({'error': 'viewers cannot edit tasks'}, status=status.HTTP_403_FORBIDDEN)

          if 'title' in request.data:
              title = request.data['title'].strip()
              if not title:
                  return Response({'error': 'title cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
              task.title = title
          if 'description' in request.data:
              task.description = request.data['description'] or None
          if 'status' in request.data:
              new_status = request.data['status']
              if new_status not in ('todo', 'in_progress', 'review', 'done'):
                  return Response({'error': 'invalid status'}, status=status.HTTP_400_BAD_REQUEST)
              task.status = new_status
          if 'assigneeId' in request.data:
              task.assignee_id = request.data['assigneeId'] or None
          task.save()

          task_data = TaskSerializer(Task.objects.select_related('assignee').get(id=task_id)).data
          return Response({'task': task_data})
  ```

#### Proof of Vulnerability (PoC Demonstration)
A user assigned the `viewer` role (`dev@example.com` on `Q3 Launch`) or an uninvited third-party user (`lina@example.com`) can successfully mutate tasks:

```bash
# Login as Dev Sharma (Viewer role)
DEV_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r .token)

# Modify a task in Q3 Launch
curl -s -X PATCH "http://localhost:8000/api/tasks/5faaab6d-e3ef-40b6-8e05-2caaa3750a14" \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Unauthorized update by read-only viewer"}'
```

**Response:**
```json
{
  "task": {
    "id": "5faaab6d-e3ef-40b6-8e05-2caaa3750a14",
    "project_id": "9924524a-27af-4875-b428-789250860db8",
    "title": "Unauthorized update by read-only viewer",
    "status": "done"
  }
}
```
*Result: Status 200 OK — The viewer successfully modified a task despite having read-only permissions.*

---

### Issue 3: Frontend-Backend Schema Naming Mismatch Causing Silent Assignee Deletion

- **File & Line Reference:** [`backend/projects/serializers.py:23-26`](file:///e:/ajackus/q-taskboard/backend/projects/serializers.py#L23-L26), [`frontend/src/types/index.ts:16`](file:///e:/ajackus/q-taskboard/frontend/src/types/index.ts#L16), [`frontend/src/components/TaskDetail.tsx:19, 46-53`](file:///e:/ajackus/q-taskboard/frontend/src/components/TaskDetail.tsx#L19)
- **Category:** `Data Integrity`
- **Severity:** **High**
- **Description:**  
  The Django REST Framework `TaskSerializer` outputs snake_case keys (`assignee_id`, `project_id`, `created_at`), while the frontend TypeScript interface `ApiTask` expects camelCase keys (`assigneeId`, `projectId`, `createdAt`). When a user opens an assigned task in `TaskDetail.tsx`, `task.assigneeId` evaluates to `undefined`, defaulting the component state to `""` ("unassigned"). When the user clicks "Save" (even if only editing the title or status), the modal transmits `assigneeId: null`, which overwrites and permanently strips the task's assignee in PostgreSQL.
- **Recommended Fix:**  
  1. Standardize serialization keys in `backend/projects/serializers.py` by exposing `assigneeId` alongside `assignee_id`:
     ```python
     class TaskSerializer(serializers.ModelSerializer):
         assignee_id = serializers.SerializerMethodField()
         assigneeId = serializers.SerializerMethodField()
         projectId = serializers.SerializerMethodField()
         createdAt = serializers.SerializerMethodField()

         def get_assigneeId(self, obj):
             return str(obj.assignee_id) if obj.assignee_id else None

         def get_projectId(self, obj):
             return str(obj.project_id)

         def get_createdAt(self, obj):
             return obj.created_at.isoformat()
     ```
  2. Defensively parse the assignee identifier in `frontend/src/components/TaskDetail.tsx`:
     ```typescript
     const [assigneeId, setAssigneeId] = useState<string>(
       task.assigneeId ?? (task as any).assignee_id ?? ""
     );
     ```

---

### Issue 4: N+1 Query Multiplier and Redundant Prefetching in Project Listing

- **File & Line Reference:** [`backend/projects/views.py:23-42`](file:///e:/ajackus/q-taskboard/backend/projects/views.py#L23-L42)
- **Category:** `Performance`
- **Severity:** **Medium**
- **Description:**  
  `ProjectListCreateView.get` retrieves memberships using `.prefetch_related('project__tasks')` and then iterates through each membership calling `p.tasks.count()`. In Django ORM, invoking `.count()` on a related manager bypasses the prefetched cache and executes an independent `SELECT COUNT(*)` query for every single project ($N+1$ queries). Concurrently, `prefetch_related` instantiates every task record in memory without ever reading their attributes in the view, degrading throughput and causing excessive memory allocation as projects scale.
- **Recommended Fix:**  
  Remove the wasteful `prefetch_related('project__tasks')` call and use database-level aggregation via `Count('project__tasks')` in a single SQL query:
  ```python
  from django.db.models import Count

  class ProjectListCreateView(APIView):
      def get(self, request):
          memberships = (
              Membership.objects
              .filter(user=request.user)
              .select_related('project__owner')
              .annotate(task_count=Count('project__tasks'))
              .order_by('-project__created_at')
          )
          projects = []
          for m in memberships:
              p = m.project
              projects.append({
                  'id': str(p.id),
                  'name': p.name,
                  'description': p.description,
                  'role': m.role,
                  'owner': UserSerializer(p.owner).data,
                  'taskCount': m.task_count,
                  'createdAt': p.created_at.isoformat(),
              })
          return Response({'projects': projects})
  ```

---

## Additional Findings & Architectural Observations

In addition to the top 4 priority issues, the following secondary areas should be addressed prior to enterprise production deployment:

1. **Weak JWT Secret & Insecure Settings Defaults (`backend/taskboard/settings.py`):**
   - Fallback `SECRET_KEY` is a 20-byte string triggering `InsecureKeyLengthWarning` (RFC 7518 requires $\ge$ 32 bytes for HMAC-SHA256).
   - `DEBUG` defaults to `True` in production if unspecified; `ALLOWED_HOSTS = ['*']` and `CORS_ALLOW_ALL_ORIGINS = True` expose the API to unauthorized cross-origin abuse.
   - JWT tokens have a fixed 30-day lifespan without refresh token rotation or a token blocklist/revocation endpoint.
2. **Missing Concurrency Protection on Task Position (`backend/projects/views.py:148-159`):**
   - Task positioning queries `last = Task.objects.filter(...).order_by('-position').first()` and computes `last.position + 1` outside of a transaction lock (`select_for_update()`), leading to duplicate ordering values under concurrent writes.
3. **Automated Test Coverage Gaps (`backend/projects/tests.py`, `frontend/src/tests/`):**
   - The test suite lacks unit and integration tests for `PATCH /api/tasks/:id`, task search filtering (`?q=`), member management (`POST /api/projects/:id/members`), and project export operations.

