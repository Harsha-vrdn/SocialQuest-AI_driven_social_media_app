import core.models
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def preserve_private_moment_access(apps, schema_editor):
    Post = apps.get_model("core", "Post")
    Post.objects.filter(event__privacy="PRIVATE").update(restricted_to_event=True)


def migrate_existing_tokens(apps, schema_editor):
    Token = apps.get_model("authtoken", "Token")
    AuthSession = apps.get_model("core", "AuthSession")
    AuthSession.objects.bulk_create([
        AuthSession(key=token.key, user_id=token.user_id, created_at=token.created)
        for token in Token.objects.all().iterator()
    ], ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("authtoken", "0004_alter_tokenproxy_options"),
        ("core", "0013_notification_delivery"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuthSession",
            fields=[
                ("key", models.CharField(default=core.models.generate_auth_session_key, editable=False, max_length=40, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="auth_sessions", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.RunPython(migrate_existing_tokens, migrations.RunPython.noop),
        migrations.AddField(
            model_name="post",
            name="restricted_to_event",
            field=models.BooleanField(default=False, editable=False),
        ),
        migrations.RunPython(preserve_private_moment_access, migrations.RunPython.noop),
        migrations.AddField(
            model_name="conversation",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name="conversation",
            options={"ordering": ["-updated_at"]},
        ),
        migrations.AlterField(
            model_name="attendance",
            name="status",
            field=models.CharField(choices=[("INVITED", "Invited"), ("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("DENIED", "Denied"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=12),
        ),
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(choices=[("EVENT_INVITE", "Event invitation"), ("INVITE_ACCEPTED", "Invitation accepted"), ("RSVP", "New RSVP"), ("RSVP_ACCEPTED", "RSVP accepted"), ("RSVP_DENIED", "RSVP declined"), ("MESSAGE", "New message"), ("EVENT_ENDED", "Event ended"), ("COMMENT_REPLY", "New comment reply")], max_length=20),
        ),
    ]
