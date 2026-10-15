"""Shared blocking rules for discovery, conversations, relay access and delivery."""
from django.db.models import Case, F, Q, When
from rest_framework.exceptions import PermissionDenied

from .models import Conversation, Message, UserBlock


def blocked_user_ids(user):
    if not user.is_authenticated:
        return UserBlock.objects.none().values_list("blocked_user_id", flat=True)
    return UserBlock.objects.filter(Q(blocker=user) | Q(blocked_user=user)).annotate(
        other_user_id=Case(When(blocker=user, then=F("blocked_user_id")), default=F("blocker_id")),
    ).values_list("other_user_id", flat=True)


def users_are_blocked(first_id, second_id):
    return UserBlock.objects.filter(
        Q(blocker_id=first_id, blocked_user_id=second_id) | Q(blocker_id=second_id, blocked_user_id=first_id)
    ).exists()


def visible_conversations(user):
    return Conversation.objects.filter(participants=user).exclude(hidden_for=user).exclude(
        is_group=False, participants__id__in=blocked_user_ids(user),
    )


def visible_messages(user, queryset=None):
    if queryset is None:
        queryset = Message.objects.all()
    return queryset.filter(conversation__in=visible_conversations(user)).exclude(
        hidden_for=user,
    ).exclude(sender_id__in=blocked_user_ids(user))


def check_message_access(conversation, user):
    if not conversation.participants.filter(pk=user.pk).exists():
        raise PermissionDenied("You are not part of this conversation.")
    # Groups can continue talking to other participants; the blocked pair's
    # messages, attachments, unread counts and pushes are hidden from each other.
    if not conversation.is_group and conversation.participants.filter(pk__in=blocked_user_ids(user)).exists():
        raise PermissionDenied("Messaging is unavailable between these accounts.")
