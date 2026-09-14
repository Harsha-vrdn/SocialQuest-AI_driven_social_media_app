from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=280, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    city = models.CharField(max_length=80, blank=True)
    total_xp = models.PositiveIntegerField(default=0)
    @property
    def karma(self):
        return KarmaRating.objects.filter(target=self.user).aggregate(score=Sum("score"))["score"] or 0

    def __str__(self):
        return self.display_name or self.user.username


class UserPresence(models.Model):
    """A foreground client lease; another device can stay online independently."""
    TIMEOUT = timedelta(seconds=60)

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="presence_sessions")
    session_id = models.UUIDField()
    last_seen = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "session_id"], name="unique_user_presence_session")]


class Follow(models.Model):
    follower = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="following_relations")
    following = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="follower_relations")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="unique_follow"),
            models.CheckConstraint(check=~models.Q(follower=models.F("following")), name="no_self_follow"),
        ]


class Event(models.Model):
    class Privacy(models.TextChoices):
        PUBLIC = "PUBLIC", "Public"
        PRIVATE = "PRIVATE", "Private"

    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hosted_events")
    name = models.CharField(max_length=120)
    description = models.TextField(max_length=2000)
    cover_image = models.ImageField(upload_to="events/", blank=True, null=True)
    location_name = models.CharField(max_length=160)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=12)
    privacy = models.CharField(max_length=10, choices=Privacy.choices, default=Privacy.PUBLIC)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_finished(self):
        return self.ends_at <= timezone.now()

    @property
    def has_started(self):
        return self.starts_at <= timezone.now()

    @property
    def quests_are_active(self):
        now = timezone.now()
        return self.starts_at <= now < self.ends_at

    def __str__(self):
        return self.name


class Attendance(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DENIED = "DENIED", "Denied"
        CANCELLED = "CANCELLED", "Cancelled"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="attendances")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="event_attendances")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    note = models.CharField(max_length=240, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["event", "user"], name="unique_event_attendance")]


class Quest(models.Model):
    class Kind(models.TextChoices):
        MAIN = "MAIN", "Main quest"
        SIDE = "SIDE", "Side quest"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="quests")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        null=True,
        on_delete=models.CASCADE,
        related_name="assigned_side_quests",
    )
    kind = models.CharField(max_length=5, choices=Kind.choices)
    title = models.CharField(max_length=120)
    instructions = models.TextField(max_length=1000)
    xp_reward = models.PositiveIntegerField(default=50)
    position = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["kind", "position"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "assigned_to", "position"],
                condition=models.Q(kind="SIDE"),
                name="unique_participant_side_quest_position",
            )
        ]


class QuestSubmission(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    quest = models.ForeignKey(Quest, on_delete=models.CASCADE, related_name="submissions")
    participant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quest_submissions")
    caption = models.CharField(max_length=280, blank=True)
    media = models.FileField(upload_to="quest_proofs/")
    media_type = models.CharField(max_length=10, choices=[("IMAGE", "Image"), ("REEL", "Reel")])
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["quest", "participant"], name="one_submission_per_quest")]


class KarmaRating(models.Model):
    class Reaction(models.TextChoices):
        LIKE = "LIKE", "Like"
        DISLIKE = "DISLIKE", "Dislike"
        NONE = "NONE", "None"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="ratings")
    rater = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="given_ratings")
    target = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="received_ratings")
    score = models.SmallIntegerField(default=0, choices=[(-1, "Dislike"), (0, "None"), (1, "Like")])
    note = models.CharField(max_length=280, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def score_for_reaction(cls, reaction):
        return {
            cls.Reaction.LIKE: 1,
            cls.Reaction.DISLIKE: -1,
            cls.Reaction.NONE: 0,
        }[reaction]

    @property
    def reaction(self):
        return {
            1: self.Reaction.LIKE,
            -1: self.Reaction.DISLIKE,
            0: self.Reaction.NONE,
        }[self.score]

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["event", "rater", "target"], name="one_rating_per_pair_event"),
            models.CheckConstraint(check=~models.Q(rater=models.F("target")), name="no_self_rating"),
        ]


class Post(models.Model):
    class Kind(models.TextChoices):
        POST = "POST", "Post"
        REEL = "REEL", "Reel"

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    event = models.ForeignKey(Event, blank=True, null=True, on_delete=models.SET_NULL, related_name="moments")
    quest = models.ForeignKey(Quest, blank=True, null=True, on_delete=models.SET_NULL, related_name="moment_posts")
    kind = models.CharField(max_length=4, choices=Kind.choices, default=Kind.POST)
    body = models.CharField(max_length=1200, blank=True)
    media = models.FileField(upload_to="posts/", blank=True, null=True)
    location_name = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="liked_posts")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "user"], name="one_like_per_post")]


class PostLikeReward(models.Model):
    """Keeps a like bonus one-time even if a user later removes their like."""
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="like_rewards")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="awarded_post_likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "user"], name="one_post_like_xp_reward")]


class PostShareClick(models.Model):
    """Counts a shared-post visit once per browser/device identifier."""
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="share_clicks")
    visitor_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "visitor_id"], name="one_post_share_click_per_visitor")]


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments")
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Conversation(models.Model):
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="conversations")
    hidden_for = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="hidden_conversations", blank=True)
    is_group = models.BooleanField(default=False)
    title = models.CharField(max_length=100, blank=True)
    # Direct chats use a stable, sorted pair of participant IDs.  Group chats
    # intentionally leave this blank, while the unique constraint prevents two
    # one-to-one conversations from being created for the same pair.
    direct_key = models.CharField(max_length=64, blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages")
    hidden_for = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="hidden_messages", blank=True)
    body = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    deleted_for_everyone = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]


class Notification(models.Model):
    class Kind(models.TextChoices):
        RSVP = "RSVP", "New RSVP"
        RSVP_ACCEPTED = "RSVP_ACCEPTED", "RSVP accepted"
        RSVP_DENIED = "RSVP_DENIED", "RSVP declined"
        MESSAGE = "MESSAGE", "New message"
        EVENT_ENDED = "EVENT_ENDED", "Event ended"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="triggered_notifications")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    attendance = models.ForeignKey(Attendance, on_delete=models.CASCADE, blank=True, null=True, related_name="notifications")
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, blank=True, null=True, related_name="notifications")
    message = models.ForeignKey(Message, on_delete=models.CASCADE, blank=True, null=True, related_name="notifications")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["recipient", "attendance", "kind"], name="unique_attendance_notification"),
            models.UniqueConstraint(fields=["recipient", "message"], name="unique_message_notification"),
        ]
