from rest_framework.permissions import BasePermission
from django.db.models import Q
from .models import Attendance, Event, Post


def visible_events(user):
    access = Q(privacy=Event.Privacy.PUBLIC)
    if user.is_authenticated:
        access |= Q(host=user) | Q(attendances__user=user, attendances__status=Attendance.Status.ACCEPTED)
    return Event.objects.filter(access).distinct()


def visible_posts(user):
    return Post.objects.filter(Q(event__isnull=True) | Q(event__in=visible_events(user)))


class IsHostOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.method in ("GET", "HEAD", "OPTIONS") or obj.host == request.user
