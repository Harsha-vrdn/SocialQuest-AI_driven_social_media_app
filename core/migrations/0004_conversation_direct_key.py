from django.db import migrations, models


def consolidate_direct_conversations(apps, schema_editor):
    Conversation = apps.get_model("core", "Conversation")

    for conversation in Conversation.objects.filter(is_group=False).order_by("created_at", "id"):
        participant_ids = sorted(conversation.participants.values_list("id", flat=True))
        if len(participant_ids) != 2:
            continue

        direct_key = f"direct:{participant_ids[0]}:{participant_ids[1]}"
        canonical = Conversation.objects.filter(direct_key=direct_key).first()
        if canonical and canonical.pk != conversation.pk:
            conversation.messages.update(conversation=canonical)
            conversation.notifications.update(conversation=canonical)
            conversation.delete()
            continue

        if conversation.direct_key != direct_key:
            conversation.direct_key = direct_key
            conversation.save(update_fields=["direct_key"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_notification"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversation",
            name="direct_key",
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
        migrations.RunPython(consolidate_direct_conversations, migrations.RunPython.noop),
    ]
