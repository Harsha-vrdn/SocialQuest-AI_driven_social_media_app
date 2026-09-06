from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0005_karma_reactions"),
    ]

    operations = [
        migrations.CreateModel(
            name="PostLikeReward",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="like_rewards", to="core.post")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="awarded_post_likes", to=settings.AUTH_USER_MODEL)),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("post", "user"), name="one_post_like_xp_reward")]},
        ),
        migrations.CreateModel(
            name="PostShareClick",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("visitor_id", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("post", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="share_clicks", to="core.post")),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("post", "visitor_id"), name="one_post_share_click_per_visitor")]},
        ),
    ]
