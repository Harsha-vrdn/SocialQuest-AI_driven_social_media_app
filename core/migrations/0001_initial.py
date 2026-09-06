from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Event",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(max_length=2000)),
                ("cover_image", models.ImageField(blank=True, null=True, upload_to="events/")),
                ("location_name", models.CharField(max_length=160)),
                ("starts_at", models.DateTimeField()),
                ("ends_at", models.DateTimeField()),
                ("capacity", models.PositiveIntegerField(default=12)),
                ("privacy", models.CharField(choices=[("PUBLIC", "Public"), ("PRIVATE", "Private")], default="PUBLIC", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("host", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="hosted_events", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Profile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("display_name", models.CharField(blank=True, max_length=80)),
                ("bio", models.CharField(blank=True, max_length=280)),
                ("avatar", models.ImageField(blank=True, null=True, upload_to="avatars/")),
                ("city", models.CharField(blank=True, max_length=80)),
                ("total_xp", models.PositiveIntegerField(default=0)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Quest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("MAIN", "Main quest"), ("SIDE", "Side quest")], max_length=5)),
                ("title", models.CharField(max_length=120)),
                ("instructions", models.TextField(max_length=1000)),
                ("xp_reward", models.PositiveIntegerField(default=50)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("event", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quests", to="core.event")),
            ],
            options={"ordering": ["kind", "position"]},
        ),
        migrations.CreateModel(
            name="Follow",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("follower", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="following_relations", to=settings.AUTH_USER_MODEL)),
                ("following", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="follower_relations", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(fields=("follower", "following"), name="unique_follow"),
                    models.CheckConstraint(check=~models.Q(follower=models.F("following")), name="no_self_follow"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Attendance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("DENIED", "Denied"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=12)),
                ("note", models.CharField(blank=True, max_length=240)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("event", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attendances", to="core.event")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="event_attendances", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="QuestSubmission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("caption", models.CharField(blank=True, max_length=280)),
                ("media", models.FileField(upload_to="quest_proofs/")),
                ("media_type", models.CharField(choices=[("IMAGE", "Image"), ("REEL", "Reel")], max_length=10)),
                ("status", models.CharField(choices=[("PENDING", "Pending review"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")], default="PENDING", max_length=10)),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("participant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quest_submissions", to=settings.AUTH_USER_MODEL)),
                ("quest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="submissions", to="core.quest")),
            ],
        ),
        migrations.CreateModel(
            name="KarmaRating",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("score", models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])),
                ("note", models.CharField(blank=True, max_length=280)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("event", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ratings", to="core.event")),
                ("rater", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="given_ratings", to=settings.AUTH_USER_MODEL)),
                ("target", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="received_ratings", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(fields=("event", "rater", "target"), name="one_rating_per_pair_event"),
                    models.CheckConstraint(check=~models.Q(rater=models.F("target")), name="no_self_rating"),
                ],
            },
        ),
        migrations.AddConstraint(model_name="attendance", constraint=models.UniqueConstraint(fields=("event", "user"), name="unique_event_attendance")),
        migrations.AddConstraint(model_name="questsubmission", constraint=models.UniqueConstraint(fields=("quest", "participant"), name="one_submission_per_quest")),
    ]
