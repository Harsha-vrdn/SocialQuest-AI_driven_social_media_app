from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def baseline_existing_chats(apps, schema_editor):
    Conversation = apps.get_model("core", "Conversation")
    ReadState = apps.get_model("core", "ConversationReadState")
    alias = schema_editor.connection.alias
    # Earlier releases had no chat read tracking. Do not label old history new.
    for chat in Conversation.objects.using(alias).annotate(latest_id=models.Max("messages__id")).iterator():
        if chat.latest_id:
            ReadState.objects.using(alias).bulk_create([
                ReadState(conversation_id=chat.pk, user_id=user_id, last_read_message_id=chat.latest_id)
                for user_id in chat.participants.using(alias).values_list("id", flat=True)
            ], ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [("core", "0016_event_group_chat"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="ConversationReadState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_read_message_id", models.PositiveBigIntegerField(default=0)),
                ("conversation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="read_states", to="core.conversation")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chat_read_states", to=settings.AUTH_USER_MODEL)),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("conversation", "user"), name="unique_conversation_reader")]},
        ),
        migrations.RunPython(baseline_existing_chats, migrations.RunPython.noop),
    ]
