from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0008_post_event_and_quest")]

    operations = [
        migrations.AddField(
            model_name="event",
            name="latitude",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="longitude",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
