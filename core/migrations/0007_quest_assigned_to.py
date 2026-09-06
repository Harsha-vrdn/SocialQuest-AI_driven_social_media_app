from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0006_post_share_and_like_rewards"),
    ]

    operations = [
        migrations.AddField(
            model_name="quest",
            name="assigned_to",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="assigned_side_quests",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name="quest",
            constraint=models.UniqueConstraint(
                condition=models.Q(kind="SIDE"),
                fields=("event", "assigned_to", "position"),
                name="unique_participant_side_quest_position",
            ),
        ),
    ]
