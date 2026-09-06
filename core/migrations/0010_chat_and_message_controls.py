from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0009_event_coordinates")]

    operations = [
        migrations.AddField(
            model_name="conversation",
            name="hidden_for",
            field=models.ManyToManyField(blank=True, related_name="hidden_conversations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="message",
            name="hidden_for",
            field=models.ManyToManyField(blank=True, related_name="hidden_messages", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="message",
            name="edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="deleted_for_everyone",
            field=models.BooleanField(default=False),
        ),
    ]
