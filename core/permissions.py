from rest_framework.permissions import BasePermission
from django.db.models import Q
from .models import Attendance, Event, Post
from .moderation import blocked_user_ids


def visible_events(user, *, include_pending=False):
    access = Q(privacy=Event.Privacy.PUBLIC)
    if user.is_authenticated:
        statuses = [Attendance.Status.INVITED, Attendance.Status.ACCEPTED]
        if include_pending:
            statuses.append(Attendance.Status.PENDING)
        access |= Q(host=user) | Q(
            attendances__user=user,
            attendances__status__in=statuses,
        )
    return Event.objects.filter(access, host__is_active=True).exclude(host_id__in=blocked_user_ids(user)).distinct()


def visible_posts(user):
    access = Q(event__isnull=True, restricted_to_event=False) | Q(event__in=visible_events(user))
    if user.is_authenticated:
        # The author can still manage a private moment after its event is gone,
        # but deleting that event must never publish the moment to everyone.
        access |= Q(event__isnull=True, restricted_to_event=True, author=user)
    return Post.objects.filter(access, author__is_active=True).exclude(author_id__in=blocked_user_ids(user))


class IsHostOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.method in ("GET", "HEAD", "OPTIONS") or obj.host == request.user
