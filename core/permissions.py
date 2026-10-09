from rest_framework.permissions import BasePermission
from django.db.models import Q
from .models import Attendance, Event, Post


def visible_events(user):
    access = Q(privacy=Event.Privacy.PUBLIC)
    if user.is_authenticated:
        access |= Q(host=user) | Q(
            attendances__user=user,
            attendances__status__in=[Attendance.Status.INVITED, Attendance.Status.ACCEPTED],
        )
    return Event.objects.filter(access).distinct()


def visible_posts(user):
    access = Q(event__isnull=True, restricted_to_event=False) | Q(event__in=visible_events(user))
    if user.is_authenticated:
        # The author can still manage a private moment after its event is gone,
        # but deleting that event must never publish the moment to everyone.
        access |= Q(event__isnull=True, restricted_to_event=True, author=user)
    return Post.objects.filter(access)


class IsHostOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.method in ("GET", "HEAD", "OPTIONS") or obj.host == request.user
