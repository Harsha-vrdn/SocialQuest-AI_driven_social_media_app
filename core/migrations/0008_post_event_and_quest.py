from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_quest_assigned_to"),
    ]

    operations = [
        migrations.AddField(
            model_name="post",
            name="event",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="moments", to="core.event"),
        ),
        migrations.AddField(
            model_name="post",
            name="quest",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="moment_posts", to="core.quest"),
        ),
    ]
