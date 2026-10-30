from rest_framework import serializers
from users.serializers import UserSerializer
from .models import Project, Membership, Task, Activity, Comment


class TaskSerializer(serializers.ModelSerializer):
    assignee = UserSerializer(read_only=True)
    assignee_id = serializers.SerializerMethodField()
    assigneeId = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    projectId = serializers.SerializerMethodField()
    created_by_id = serializers.SerializerMethodField()
    createdById = serializers.SerializerMethodField()

    def get_assignee_id(self, obj):
        return str(obj.assignee_id) if obj.assignee_id else None

    def get_assigneeId(self, obj):
        return str(obj.assignee_id) if obj.assignee_id else None

    def get_project_id(self, obj):
        return str(obj.project_id)

    def get_projectId(self, obj):
        return str(obj.project_id)

    def get_created_by_id(self, obj):
        return str(obj.created_by_id)

    def get_createdById(self, obj):
        return str(obj.created_by_id)

    class Meta:
        model = Task
        fields = [
            'id', 'project_id', 'projectId', 'title', 'description', 'status',
            'assignee_id', 'assigneeId', 'created_by_id', 'createdById', 'position',
            'created_at', 'updated_at', 'assignee',
        ]


class MembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ['id', 'role', 'user']


class ActivitySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    createdAt = serializers.SerializerMethodField()

    def get_createdAt(self, obj):
        return obj.created_at.isoformat()

    class Meta:
        model = Activity
        fields = ['id', 'action', 'details', 'user', 'created_at', 'createdAt']


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    createdAt = serializers.SerializerMethodField()

    def get_createdAt(self, obj):
        return obj.created_at.isoformat()

    class Meta:
        model = Comment
        fields = ['id', 'body', 'author', 'created_at', 'createdAt']


class ProjectDetailSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    owner_id = serializers.SerializerMethodField()
    memberships = MembershipSerializer(many=True, read_only=True)
    tasks = TaskSerializer(many=True, read_only=True)
    activities = serializers.SerializerMethodField()

    def get_owner_id(self, obj):
        return str(obj.owner_id)

    def get_activities(self, obj):
        recent = obj.activities.select_related('user').order_by('-created_at')[:50]
        return ActivitySerializer(recent, many=True).data

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'owner_id', 'owner', 'memberships', 'tasks', 'activities', 'created_at', 'updated_at']
