from django.contrib.auth import get_user_model
from rest_framework import serializers
from .media import compress_image_upload
from .models import (Attendance, Comment, Conversation, Event, Follow, KarmaRating, Message,
                     Notification, Post, Profile, Quest, QuestSubmission)

User = get_user_model()


class PublicUserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source="profile.display_name", read_only=True)
    bio = serializers.CharField(source="profile.bio", read_only=True)
    city = serializers.CharField(source="profile.city", read_only=True)
    avatar = serializers.ImageField(source="profile.avatar", read_only=True)
    xp = serializers.IntegerField(source="profile.total_xp", read_only=True)
    karma = serializers.IntegerField(source="profile.karma", read_only=True)
    follower_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    is_followed_by_me = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "display_name", "bio", "city", "avatar", "xp", "karma", "follower_count", "following_count", "is_followed_by_me"]

    def get_follower_count(self, obj):
        return obj.follower_relations.count()

    def get_following_count(self, obj):
        return obj.following_relations.count()

    def get_is_followed_by_me(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and Follow.objects.filter(follower=request.user, following=obj).exists())


class EventSerializer(serializers.ModelSerializer):
    host = PublicUserSerializer(read_only=True)
    accepted_count = serializers.SerializerMethodField()
    pending_count = serializers.SerializerMethodField()
    my_attendance_status = serializers.SerializerMethodField()
    is_finished = serializers.BooleanField(read_only=True)
    quest_status = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ["id", "host", "name", "description", "cover_image", "location_name", "latitude", "longitude", "starts_at", "ends_at", "capacity", "privacy", "created_at", "accepted_count", "pending_count", "my_attendance_status", "has_started", "is_finished", "quest_status"]
        read_only_fields = ["host", "created_at"]

    def validate(self, attrs):
        starts, ends = attrs.get("starts_at"), attrs.get("ends_at")
        if starts and ends and ends <= starts:
            raise serializers.ValidationError("The event must end after it starts.")
        latitude = attrs.get("latitude", getattr(self.instance, "latitude", None))
        longitude = attrs.get("longitude", getattr(self.instance, "longitude", None))
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError("Location coordinates must include both latitude and longitude.")
        if latitude is not None and not -90 <= latitude <= 90:
            raise serializers.ValidationError({"latitude": "Latitude must be between -90 and 90."})
        if longitude is not None and not -180 <= longitude <= 180:
            raise serializers.ValidationError({"longitude": "Longitude must be between -180 and 180."})
        if attrs.get("cover_image"):
            attrs["cover_image"] = compress_image_upload(attrs["cover_image"])
        return attrs

    def get_accepted_count(self, obj):
        return obj.attendances.filter(status=Attendance.Status.ACCEPTED).count()

    def get_pending_count(self, obj):
        request = self.context.get("request")
        return obj.attendances.filter(status=Attendance.Status.PENDING).count() if request and request.user == obj.host else None

    def get_my_attendance_status(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        attendance = obj.attendances.filter(user=request.user).first()
        return attendance.status if attendance else None

    def get_quest_status(self, obj):
        if obj.quests_are_active:
            return "ACTIVE"
        return "EXPIRED" if obj.is_finished else "SCHEDULED"


class AttendanceSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)

    class Meta:
        model = Attendance
        fields = ["id", "user", "status", "note", "joined_at"]
        read_only_fields = ["id", "user", "status", "joined_at"]


class QuestSerializer(serializers.ModelSerializer):
    my_submission = serializers.SerializerMethodField()

    class Meta:
        model = Quest
        fields = ["id", "event", "kind", "title", "instructions", "xp_reward", "position", "my_submission"]
        read_only_fields = ["event"]

    def get_my_submission(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            submission = obj.submissions.filter(participant=request.user).first()
            return QuestSubmissionSerializer(submission, context=self.context).data if submission else None
        return None


class QuestSubmissionSerializer(serializers.ModelSerializer):
    participant = PublicUserSerializer(read_only=True)

    class Meta:
        model = QuestSubmission
        fields = ["id", "quest", "participant", "caption", "media", "media_type", "status", "submitted_at", "reviewed_at"]
        read_only_fields = ["participant", "status", "submitted_at", "reviewed_at"]

    def validate(self, attrs):
        if attrs.get("media"):
            attrs["media"] = compress_image_upload(attrs["media"])
        return attrs


class KarmaRatingSerializer(serializers.ModelSerializer):
    rater = PublicUserSerializer(read_only=True)
    target = PublicUserSerializer(read_only=True)
    target_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), source="target", write_only=True)
    reaction = serializers.ChoiceField(choices=KarmaRating.Reaction.choices)

    class Meta:
        model = KarmaRating
        fields = ["id", "event", "rater", "target", "target_id", "reaction", "note", "created_at"]
        read_only_fields = ["rater", "created_at"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(write_only=True, max_length=80, required=False)

    class Meta:
        model = User
        fields = ["username", "email", "password", "display_name"]

    def create(self, validated_data):
        display_name = validated_data.pop("display_name", "")
        user = User.objects.create_user(**validated_data)
        user.profile.display_name = display_name or user.username
        user.profile.save()
        return user


class CommentSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "post", "author", "body", "created_at"]
        read_only_fields = ["author", "created_at"]


class PostSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)
    quest_title = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ["id", "author", "event", "quest", "quest_title", "kind", "body", "media", "location_name", "created_at", "liked_by_me", "like_count", "comment_count", "recent_comments"]
        read_only_fields = ["author", "quest", "quest_title", "created_at"]

    def validate(self, attrs):
        current = self.instance
        kind = attrs.get("kind", current.kind if current else Post.Kind.POST)
        body = attrs.get("body", current.body if current else "")
        media = attrs.get("media", current.media if current else None)
        if kind == Post.Kind.REEL and not media:
            raise serializers.ValidationError("A reel needs a video upload.")
        if not body and not media:
            raise serializers.ValidationError("Add a thought or a photo.")
        if current and current.quest_id and "event" in attrs and attrs["event"] != current.event:
            raise serializers.ValidationError("A quest moment must remain connected to its original event.")
        if attrs.get("media"):
            attrs["media"] = compress_image_upload(attrs["media"])
        return attrs

    def get_quest_title(self, obj):
        return obj.quest.title if obj.quest_id else ""

    def get_liked_by_me(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.likes.filter(user=request.user).exists())

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comments.count()

    def get_recent_comments(self, obj):
        return CommentSerializer(obj.comments.select_related("author", "author__profile").order_by("-created_at")[:2], many=True, context=self.context).data


class MessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "body", "created_at", "edited_at", "deleted_for_everyone"]
        read_only_fields = ["sender", "created_at", "edited_at", "deleted_for_everyone"]


class ConversationSerializer(serializers.ModelSerializer):
    participants = PublicUserSerializer(many=True, read_only=True)
    latest_message = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "participants", "is_group", "title", "created_at", "display_name", "latest_message"]
        read_only_fields = ["participants", "is_group", "created_at"]

    def get_latest_message(self, obj):
        messages = obj.messages.select_related("sender", "sender__profile")
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            messages = messages.exclude(hidden_for=request.user)
        message = messages.order_by("-created_at").first()
        return MessageSerializer(message, context=self.context).data if message else None

    def get_display_name(self, obj):
        if obj.title:
            return obj.title
        request = self.context.get("request")
        other_people = obj.participants.exclude(id=getattr(request.user, "id", None)) if request else obj.participants.all()
        return ", ".join(person.profile.display_name or person.username for person in other_people) or "Just you"


class NotificationSerializer(serializers.ModelSerializer):
    actor = PublicUserSerializer(read_only=True)
    text = serializers.SerializerMethodField()
    event = serializers.SerializerMethodField()
    conversation_id = serializers.IntegerField(source="conversation.id", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "actor", "text", "event", "conversation_id", "created_at", "is_read"]

    def get_event(self, obj):
        if not obj.attendance:
            return None
        event = obj.attendance.event
        return {"id": event.id, "name": event.name}

    def get_is_read(self, obj):
        return obj.read_at is not None

    def get_text(self, obj):
        actor_name = obj.actor.profile.display_name or obj.actor.username if obj.actor else "Someone"
        if obj.kind == Notification.Kind.RSVP and obj.attendance:
            return actor_name + " wants to join " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.RSVP_ACCEPTED and obj.attendance:
            return actor_name + " accepted your RSVP for " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.RSVP_DENIED and obj.attendance:
            return actor_name + " declined your RSVP for " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.MESSAGE and obj.message:
            return actor_name + ": " + obj.message.body
        if obj.kind == Notification.Kind.EVENT_ENDED and obj.attendance:
            return obj.attendance.event.name + " has ended. Rate the people who attended."
        return "You have a new SocialQuest update."
