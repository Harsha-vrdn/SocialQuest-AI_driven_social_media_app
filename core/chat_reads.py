from django.db.models import BigIntegerField, Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce

from .models import ConversationReadState, Message


def with_unread_counts(conversations, user):
    cursor = ConversationReadState.objects.filter(conversation_id=OuterRef("pk"), user=user).values("last_read_message_id")[:1]
    conversations = conversations.annotate(read_through_message_id=Coalesce(Subquery(cursor, output_field=BigIntegerField()), Value(0)))
    unread = Message.objects.filter(
        conversation_id=OuterRef("pk"), id__gt=OuterRef("read_through_message_id"), deleted_for_everyone=False,
    ).exclude(sender=user).exclude(hidden_for=user).order_by().values("conversation_id").annotate(total=Count("id")).values("total")
    return conversations.annotate(unread_count=Coalesce(Subquery(unread, output_field=IntegerField()), Value(0)))
