"""An event's chat membership follows the host and accepted attendance."""
from django.db import transaction
from .models import Attendance, Conversation, Event


@transaction.atomic
def sync_event_conversation(event_id, *, create=True):
    # The same event lock serializes RSVP changes and chat reconciliation.
    event = Event.objects.select_for_update().filter(pk=event_id).first()
    if not event:
        return None
    conversation = Conversation.objects.filter(event=event).first()
    if conversation is None:
        if not create:
            return None
        conversation = Conversation.objects.create(event=event, is_group=True, title=event.name[:100])
    elif conversation.title != event.name[:100] or not conversation.is_group:
        conversation.title = event.name[:100]
        conversation.is_group = True
        conversation.save(update_fields=["title", "is_group"])
    wanted = {event.host_id, *event.attendances.filter(status=Attendance.Status.ACCEPTED).values_list("user_id", flat=True)}
    existing = set(conversation.participants.values_list("id", flat=True))
    if wanted != existing:
        conversation.participants.set(wanted)
        conversation.hidden_for.remove(*(wanted - existing))
    return conversation
