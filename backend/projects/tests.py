import pytest
from rest_framework.test import APIClient
from users.models import User
from projects.models import Project, Membership, Task


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email='meera@taskboard.dev', name='Meera Iyer', password='password123')


@pytest.fixture
def auth_client(client, user):
    response = client.post('/api/auth/login', {
        'email': 'meera@taskboard.dev',
        'password': 'password123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")
    return client


@pytest.mark.django_db
class TestProjects:
    def test_create_project(self, auth_client, user):
        response = auth_client.post('/api/projects', {'name': 'My Project'}, format='json')
        assert response.status_code == 201
        assert response.data['project']['name'] == 'My Project'

    def test_list_only_returns_member_projects(self, auth_client, user):
        p1 = Project.objects.create(name='Mine', owner=user)
        Membership.objects.create(user=user, project=p1, role='admin')
        other = User.objects.create_user(email='other@example.com', name='Other', password='password123')
        p2 = Project.objects.create(name='Not Mine', owner=other)
        Membership.objects.create(user=other, project=p2, role='admin')

        response = auth_client.get('/api/projects')
        assert response.status_code == 200
        names = [p['name'] for p in response.data['projects']]
        assert 'Mine' in names
        assert 'Not Mine' not in names

    def test_get_project_detail(self, auth_client, user):
        project = Project.objects.create(name='My Project', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.get(f'/api/projects/{project.id}')
        assert response.status_code == 200
        assert response.data['project']['name'] == 'My Project'

    def test_non_member_cannot_view_project(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='Private', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/projects/{project.id}')
        assert response.status_code == 403


@pytest.mark.django_db
class TestTasks:
    def test_create_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.post(f'/api/projects/{project.id}/tasks', {'title': 'Do a thing'}, format='json')
        assert response.status_code == 201
        assert response.data['task']['title'] == 'Do a thing'

    def test_viewers_cannot_create_tasks(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/projects/{project.id}/tasks', {'title': 'A task'}, format='json')
        assert response.status_code == 403

    def test_delete_task_requires_membership(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.delete(f'/api/tasks/{task.id}')
        assert response.status_code == 403
    def test_search_tasks_by_query(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='Write report', description='Quarterly metrics', created_by=user)
        Task.objects.create(project=project, title='Deploy release', description='Production release', created_by=user)

        response = auth_client.get(f'/api/projects/{project.id}/tasks?q=report')
        assert response.status_code == 200
        titles = [t['title'] for t in response.data['tasks']]
        assert titles == ['Write report']

        response_desc = auth_client.get(f'/api/projects/{project.id}/tasks?q=production')
        assert response_desc.status_code == 200
        titles_desc = [t['title'] for t in response_desc.data['tasks']]
        assert titles_desc == ['Deploy release']

    def test_search_tasks_sql_injection_sanitized(self, auth_client, user):
        p1 = Project.objects.create(name='P1', owner=user)
        Membership.objects.create(user=user, project=p1, role='admin')
        Task.objects.create(project=p1, title='Confidential P1 Task', created_by=user)

        other = User.objects.create_user(email='other@example.com', name='Other', password='password123')
        p2 = Project.objects.create(name='P2', owner=other)
        Membership.objects.create(user=other, project=p2, role='admin')
        Task.objects.create(project=p2, title='Secret P2 Task', created_by=other)

        sqli_payload = "') OR 1=1 --"
        response = auth_client.get(f'/api/projects/{p1.id}/tasks?q={sqli_payload}')
        assert response.status_code == 200
        titles = [t['title'] for t in response.data['tasks']]
        assert 'Secret P2 Task' not in titles
        assert len(titles) == 0

        union_payload = "') UNION SELECT id, NULL, email, password, 'todo', NULL, NULL, 0, now(), now() FROM users --"
        response_union = auth_client.get(f'/api/projects/{p1.id}/tasks?q={union_payload}')
        assert response_union.status_code == 200
        assert len(response_union.data['tasks']) == 0

