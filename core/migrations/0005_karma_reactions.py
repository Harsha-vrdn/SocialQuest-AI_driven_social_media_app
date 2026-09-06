from django.db import migrations, models


def convert_legacy_scores(apps, schema_editor):
    KarmaRating = apps.get_model("core", "KarmaRating")
    for rating in KarmaRating.objects.all().only("id", "score"):
        rating.score = 1 if rating.score >= 4 else -1 if rating.score <= 2 else 0
        rating.save(update_fields=["score"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_conversation_direct_key"),
    ]

    operations = [
        migrations.RunPython(convert_legacy_scores, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="karmarating",
            name="score",
            field=models.SmallIntegerField(choices=[(-1, "Dislike"), (0, "None"), (1, "Like")], default=0),
        ),
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(choices=[("RSVP", "New RSVP"), ("RSVP_ACCEPTED", "RSVP accepted"), ("RSVP_DENIED", "RSVP declined"), ("MESSAGE", "New message"), ("EVENT_ENDED", "Event ended")], max_length=20),
        ),
    ]
