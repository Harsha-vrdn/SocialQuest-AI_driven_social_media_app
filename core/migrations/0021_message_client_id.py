from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0020_upload_deletion_retries")]
    operations = [
        migrations.AddField(model_name="message", name="client_id", field=models.UUIDField(blank=True, editable=False, null=True)),
        migrations.AddConstraint(model_name="message", constraint=models.UniqueConstraint(fields=("sender", "client_id"), name="unique_message_client_send")),
    ]
