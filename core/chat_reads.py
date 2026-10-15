from django.db.models import BigIntegerField, Count, Exists, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from .models import Conversation, ConversationReadState, Message, UserBlock
from .moderation import blocked_user_ids


def with_message_receipts(messages):
    """Read means every current recipient has advanced past this message.

    Correlated subqueries avoid a per-message/per-participant query loop. The
    sender's cursor, online presence, and attachment downloads are not receipts.
    """
    recipients = Conversation.participants.through.objects.filter(
        conversation_id=OuterRef("conversation_id"),
    ).exclude(user_id=OuterRef("sender_id"))
    blocked = UserBlock.objects.filter(
        Q(blocker_id=OuterRef("user_id"), blocked_user_id=OuterRef(OuterRef("sender_id")))
        | Q(blocked_user_id=OuterRef("user_id"), blocker_id=OuterRef(OuterRef("sender_id"))),
    )
    recipients = recipients.annotate(is_blocked=Exists(blocked)).filter(is_blocked=False)
    read = ConversationReadState.objects.filter(
        conversation_id=OuterRef("conversation_id"), user_id=OuterRef("user_id"),
        last_read_message_id__gte=OuterRef(OuterRef("pk")),
    )
    unread = recipients.annotate(has_read=Exists(read)).filter(has_read=False)
    return messages.annotate(has_recipients=Exists(recipients), has_unread_recipients=Exists(unread))


def with_unread_counts(conversations, user):
    cursor = ConversationReadState.objects.filter(conversation_id=OuterRef("pk"), user=user).values("last_read_message_id")[:1]
    conversations = conversations.annotate(read_through_message_id=Coalesce(Subquery(cursor, output_field=BigIntegerField()), Value(0)))
    unread = Message.objects.filter(
        conversation_id=OuterRef("pk"), id__gt=OuterRef("read_through_message_id"), deleted_for_everyone=False,
    ).exclude(sender=user).exclude(hidden_for=user).exclude(sender_id__in=blocked_user_ids(user)).order_by().values("conversation_id").annotate(total=Count("id")).values("total")
    return conversations.annotate(unread_count=Coalesce(Subquery(unread, output_field=IntegerField()), Value(0)))
