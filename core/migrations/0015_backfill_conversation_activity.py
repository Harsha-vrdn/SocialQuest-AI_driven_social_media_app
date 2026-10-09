from django.db import migrations
from django.db.models import Max


def backfill_conversation_activity(apps, schema_editor):
    Conversation = apps.get_model("core", "Conversation")
    for conversation in Conversation.objects.annotate(latest_message_at=Max("messages__created_at")).iterator():
        Conversation.objects.filter(pk=conversation.pk).update(
            updated_at=conversation.latest_message_at or conversation.created_at,
        )


class Migration(migrations.Migration):
    dependencies = [("core", "0014_sessions_invites_privacy_and_activity")]

    operations = [
        migrations.RunPython(backfill_conversation_activity, migrations.RunPython.noop),
    ]
