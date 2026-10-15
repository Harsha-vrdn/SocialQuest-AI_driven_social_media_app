from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from math import isfinite
from rest_framework import serializers
from .media import compress_image_upload, validate_media_upload
from .models import (Attendance, Comment, Conversation, Event, KarmaRating, Message,
                     Notification, Post, Profile, Quest, QuestSubmission, Report)

from .querysets import with_post_stats, with_public_user_stats

User = get_user_model()


class PublicUserListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        instances = list(data.all() if hasattr(data, "all") else data)
        cache = self.context.setdefault("public_user_stats", {})
        missing = {person.pk for person in instances if person.is_active and not hasattr(person, "follower_count_value") and person.pk not in cache}
        if missing:
            request = self.context.get("request")
            cache = self.context.setdefault("public_user_stats", {})
            cache.update((person.pk, person) for person in with_public_user_stats(
                User.objects.filter(pk__in=missing), getattr(request, "user", None),
            ))
        return super().to_representation(instances)


class PublicUserSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        # One-off writes/login responses also need real statistics. Collection
        # endpoints prefetch annotated users; the list serializer batches raw
        # collections instead of querying follower/following relations per row.
        if instance.is_active and not hasattr(instance, "follower_count_value"):
            cache = self.context.setdefault("public_user_stats", {})
            if instance.pk not in cache:
                request = self.context.get("request")
                cache[instance.pk] = with_public_user_stats(User.objects.filter(pk=instance.pk), getattr(request, "user", None)).first()
            instance = cache[instance.pk] or instance
        if not instance.is_active:
            return {"id": instance.pk, "username": "", "display_name": "Unavailable account", "bio": "", "city": "",
                    "avatar": None, "xp": 0, "karma": 0, "follower_count": 0, "following_count": 0,
                    "is_followed_by_me": False, "is_online": False}
        return super().to_representation(instance)

    display_name = serializers.CharField(source="profile.display_name", read_only=True)
    bio = serializers.CharField(source="profile.bio", read_only=True)
    city = serializers.CharField(source="profile.city", read_only=True)
    avatar = serializers.ImageField(source="profile.avatar", read_only=True)
    xp = serializers.IntegerField(source="profile.total_xp", read_only=True)
    karma = serializers.IntegerField(source="karma_value", read_only=True)
    follower_count = serializers.IntegerField(source="follower_count_value", read_only=True)
    following_count = serializers.IntegerField(source="following_count_value", read_only=True)
    is_followed_by_me = serializers.BooleanField(source="is_followed_value", read_only=True)

    class Meta:
        model = User
        list_serializer_class = PublicUserListSerializer
        fields = ["id", "username", "display_name", "bio", "city", "avatar", "xp", "karma", "follower_count", "following_count", "is_followed_by_me"]


class MediaImageField(serializers.ImageField):
    def to_internal_value(self, data):
        # Django's ImageField normalizes content_type after opening the image.
        # Check the caller's declared MIME before that information is replaced.
        try:
            validate_media_upload(data, "IMAGE")
        except ValueError as error:
            raise serializers.ValidationError(str(error))
        return super().to_internal_value(data)


class EventSerializer(serializers.ModelSerializer):
    cover_image = MediaImageField(required=False, allow_null=True)
    capacity = serializers.IntegerField(min_value=2, required=False)
    host = PublicUserSerializer(read_only=True)
    accepted_count = serializers.SerializerMethodField()
    pending_count = serializers.SerializerMethodField()
    my_attendance_status = serializers.SerializerMethodField()
    is_finished = serializers.BooleanField(read_only=True)
    quest_status = serializers.SerializerMethodField()
    has_quests = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ["id", "host", "name", "description", "cover_image", "location_name", "latitude", "longitude", "starts_at", "ends_at", "capacity", "privacy", "created_at", "accepted_count", "pending_count", "my_attendance_status", "has_started", "is_finished", "quest_status", "has_quests"]
        read_only_fields = ["host", "created_at"]

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError("The event must end after it starts.")
        if self.instance and attrs.get("capacity", self.instance.capacity) < self.instance.attendances.filter(status=Attendance.Status.ACCEPTED).count():
            raise serializers.ValidationError({"capacity": "Capacity cannot be lower than the number of accepted guests."})
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
        if "attendances" in getattr(obj, "_prefetched_objects_cache", {}):
            return sum(attendance.status == Attendance.Status.ACCEPTED for attendance in obj.attendances.all())
        return obj.attendances.filter(status=Attendance.Status.ACCEPTED).count()

    def get_pending_count(self, obj):
        request = self.context.get("request")
        if not request or request.user != obj.host:
            return None
        if "attendances" in getattr(obj, "_prefetched_objects_cache", {}):
            return sum(attendance.status == Attendance.Status.PENDING for attendance in obj.attendances.all())
        return obj.attendances.filter(status=Attendance.Status.PENDING).count()

    def get_my_attendance_status(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        if "attendances" in getattr(obj, "_prefetched_objects_cache", {}):
            attendance = next((item for item in obj.attendances.all() if item.user_id == request.user.id), None)
        else:
            attendance = obj.attendances.filter(user=request.user).first()
        return attendance.status if attendance else None

    def get_has_quests(self, obj):
        if "quests" in getattr(obj, "_prefetched_objects_cache", {}):
            return any(quest.kind == Quest.Kind.MAIN for quest in obj.quests.all())
        return obj.quests.filter(kind=Quest.Kind.MAIN).exists()

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
    quest_title = serializers.CharField(source="quest.title", read_only=True)
    xp_reward = serializers.IntegerField(source="quest.xp_reward", read_only=True)

    class Meta:
        model = QuestSubmission
        fields = ["id", "quest", "quest_title", "xp_reward", "participant", "caption", "media", "media_type", "status", "submitted_at", "reviewed_at"]
        read_only_fields = ["participant", "status", "submitted_at", "reviewed_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        if request and QuestSubmission.objects.filter(quest=attrs.get("quest"), participant=request.user).exists():
            raise serializers.ValidationError("Looks like you already snapped proof for this one — nice work! 🎉")
        if not attrs.get("media"):
            raise serializers.ValidationError({"media": "📸 Drop a photo (or reel) — no snap, no proof!"})
        try:
            validate_media_upload(attrs["media"], attrs.get("media_type"))
        except ValueError as error:
            raise serializers.ValidationError({"media": str(error)})
        attrs["media"] = compress_image_upload(attrs["media"])
        return attrs


class ProfileFieldsOnlyMixin:
    def update(self, instance, validated_data):
        # A delayed profile/location edit must not overwrite lifecycle fields
        # from its stale model instance after another device requested deletion.
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=list(validated_data))
        return instance


class AccountSettingsSerializer(ProfileFieldsOnlyMixin, serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["location_mode", "saved_city", "saved_latitude", "saved_longitude", "account_state", "deletion_due_at"]
        read_only_fields = ["account_state", "deletion_due_at"]

    def validate(self, attrs):
        mode = attrs.get("location_mode", self.instance.location_mode)
        city = attrs.get("saved_city", self.instance.saved_city).strip()
        latitude = attrs.get("saved_latitude", self.instance.saved_latitude)
        longitude = attrs.get("saved_longitude", self.instance.saved_longitude)
        if mode == "SAVED" and not city:
            raise serializers.ValidationError({"saved_city": "Choose or enter a saved city."})
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError("Provide both saved coordinates, or neither.")
        if latitude is not None and (not isfinite(latitude) or not -90 <= latitude <= 90):
            raise serializers.ValidationError({"saved_latitude": "Invalid latitude."})
        if longitude is not None and (not isfinite(longitude) or not -180 <= longitude <= 180):
            raise serializers.ValidationError({"saved_longitude": "Invalid longitude."})
        if "saved_city" in attrs:
            attrs["saved_city"] = city
            if city != self.instance.saved_city and "saved_latitude" not in attrs and "saved_longitude" not in attrs:
                attrs.update(saved_latitude=None, saved_longitude=None)
        return attrs


class AccountPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=1024)


class ProfileUpdateSerializer(ProfileFieldsOnlyMixin, serializers.ModelSerializer):
    avatar = MediaImageField(required=False, allow_null=True)
    class Meta:
        model = Profile
        fields = ["display_name", "bio", "city", "avatar"]

    def validate_avatar(self, value):
        return compress_image_upload(value)


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
    password = serializers.CharField(write_only=True, min_length=8, max_length=1024, trim_whitespace=False)
    display_name = serializers.CharField(write_only=True, max_length=80, required=False)

    class Meta:
        model = User
        fields = ["username", "email", "password", "display_name"]

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)
        return value

    def create(self, validated_data):
        display_name = validated_data.pop("display_name", "")
        user = User.objects.create_user(**validated_data)
        user.profile.display_name = display_name or user.username
        user.profile.save()
        return user


class CommentSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)
    parent = serializers.PrimaryKeyRelatedField(queryset=Comment.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Comment
        fields = ["id", "post", "parent", "author", "body", "created_at"]
        read_only_fields = ["author", "created_at"]

    def validate(self, attrs):
        parent = attrs.get("parent")
        post = attrs.get("post", getattr(self.instance, "post", None))
        if self.instance and "post" in attrs and post != self.instance.post:
            raise serializers.ValidationError({"post": "A comment cannot be moved to another post."})
        if self.instance and "parent" in attrs and parent != self.instance.parent:
            raise serializers.ValidationError({"parent": "A reply cannot be moved to another comment."})
        if parent and parent.post_id != getattr(post, "id", None):
            raise serializers.ValidationError({"parent": "Replies must belong to a comment on the same post."})
        if self.instance and parent and parent.id == self.instance.id:
            raise serializers.ValidationError({"parent": "A comment cannot reply to itself."})
        return attrs


class PostSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)
    quest_title = serializers.SerializerMethodField()
    event_name = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    recent_comments = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ["id", "author", "event", "event_name", "quest", "quest_title", "kind", "body", "media", "location_name", "created_at", "liked_by_me", "like_count", "comment_count", "recent_comments"]
        read_only_fields = ["author", "event_name", "quest", "quest_title", "created_at"]

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
            upload = attrs["media"]
            try:
                media_type = validate_media_upload(upload)
            except ValueError as error:
                raise serializers.ValidationError({"media": str(error)})
            if media_type == "REEL":
                attrs["kind"] = Post.Kind.REEL
            elif kind == Post.Kind.REEL:
                raise serializers.ValidationError({"media": "A reel needs a video upload."})
            attrs["media"] = compress_image_upload(attrs["media"])
        elif current and kind != current.kind and current.media:
            raise serializers.ValidationError({"kind": "Upload matching media to change the post type."})
        return attrs

    def get_quest_title(self, obj):
        return obj.quest.title if obj.quest_id else ""

    def get_event_name(self, obj):
        return obj.event.name if obj.event_id else ""

    def get_liked_by_me(self, obj):
        if hasattr(obj, "liked_by_me_value"):
            return obj.liked_by_me_value
        request = self.context.get("request")
        if request and request.user.is_authenticated and "likes" in getattr(obj, "_prefetched_objects_cache", {}):
            return any(like.user_id == request.user.id for like in obj.likes.all())
        return bool(request and request.user.is_authenticated and obj.likes.filter(user=request.user).exists())

    def to_representation(self, instance):
        if not hasattr(instance, "like_count") or not hasattr(instance, "comment_count"):
            request = self.context.get("request")
            stats = with_post_stats(Post.objects.filter(pk=instance.pk), getattr(request, "user", None)).values("like_count", "comment_count", "liked_by_me_value").get()
            for name, value in stats.items():
                setattr(instance, name, value)
        return super().to_representation(instance)

    def get_recent_comments(self, obj):
        if hasattr(obj, "prefetched_comments"):
            comments = obj.prefetched_comments[:2]
            return CommentSerializer(comments, many=True, context=self.context).data
        return CommentSerializer(obj.comments.select_related("author", "author__profile").order_by("-created_at")[:2], many=True, context=self.context).data


class MessageSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True)
    attachment = serializers.SerializerMethodField()
    client_id = serializers.UUIDField(required=False, allow_null=True)
    delivery_status = serializers.SerializerMethodField()

    def get_delivery_status(self, obj):
        request = self.context.get("request")
        if not request or obj.sender_id != request.user.id or obj.deleted_for_everyone:
            return None
        if not hasattr(obj, "has_recipients"):
            from .chat_reads import with_message_receipts
            obj = with_message_receipts(Message.objects.filter(pk=obj.pk)).get()
        return "read" if obj.has_recipients and not obj.has_unread_recipients else "sent"

    def validate(self, attrs):
        if self.instance and "client_id" in attrs:
            raise serializers.ValidationError({"client_id": "A message's send identifier cannot be changed."})
        return attrs

    def create(self, validated_data):
        client_id = validated_data.get("client_id")
        if not client_id:
            self.created_message = True
            return super().create(validated_data)
        message, created = Message.objects.get_or_create(
            sender=validated_data["sender"], client_id=client_id,
            defaults={key: value for key, value in validated_data.items() if key not in ("sender", "client_id")},
        )
        if not created and (message.conversation_id != validated_data["conversation"].id or
                            (not message.deleted_for_everyone and message.body != validated_data["body"])):
            raise serializers.ValidationError({"client_id": "This send identifier was already used for a different message."})
        self.created_message = created
        return message

    def get_attachment(self, obj):
        from .chat_attachments import attachment_info
        item = getattr(obj, "attachment", None)
        return attachment_info(item) if item and not obj.deleted_for_everyone else None

    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "body", "created_at", "edited_at", "deleted_for_everyone", "attachment", "client_id", "delivery_status"]
        read_only_fields = ["sender", "created_at", "edited_at", "deleted_for_everyone"]
        validators = []  # Idempotent retries are resolved by create(), not rejected as duplicates.


class ChatParticipantSerializer(PublicUserSerializer):
    is_online = serializers.SerializerMethodField()

    class Meta(PublicUserSerializer.Meta):
        fields = PublicUserSerializer.Meta.fields + ["is_online"]

    def get_is_online(self, obj):
        return bool(obj.is_online_value)


class PresenceSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    chats_open = serializers.BooleanField(default=False)


class ConversationSerializer(serializers.ModelSerializer):
    event_name = serializers.CharField(source="event.name", read_only=True, default="")
    participants = ChatParticipantSerializer(many=True, read_only=True)
    latest_message = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    read_through_message_id = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "event", "event_name", "participants", "is_group", "title", "created_at", "updated_at", "display_name", "latest_message", "unread_count", "read_through_message_id"]
        read_only_fields = ["event", "participants", "is_group", "created_at", "updated_at"]

    def _read_state(self, obj):
        if not hasattr(obj, "unread_count"):
            from .chat_reads import with_unread_counts
            row = with_unread_counts(Conversation.objects.filter(pk=obj.pk), self.context["request"].user).get()
            obj.unread_count = row.unread_count
            obj.read_through_message_id = row.read_through_message_id
        return obj

    def get_unread_count(self, obj):
        return self._read_state(obj).unread_count

    def get_read_through_message_id(self, obj):
        return self._read_state(obj).read_through_message_id

    def get_latest_message(self, obj):
        if hasattr(obj, "visible_messages"):
            message = max(obj.visible_messages, key=lambda item: item.created_at, default=None)
            return MessageSerializer(message, context=self.context).data if message else None
        messages = obj.messages.select_related("sender", "sender__profile")
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            from .moderation import visible_messages
            messages = visible_messages(request.user, messages)
        message = messages.order_by("-created_at").first()
        return MessageSerializer(message, context=self.context).data if message else None

    def get_display_name(self, obj):
        if obj.event_id:
            return obj.event.name
        if obj.title:
            return obj.title
        request = self.context.get("request")
        if "participants" in getattr(obj, "_prefetched_objects_cache", {}):
            other_people = [person for person in obj.participants.all() if person.id != getattr(getattr(request, "user", None), "id", None)]
        else:
            other_people = obj.participants.exclude(id=getattr(request.user, "id", None)) if request else obj.participants.all()
        return ", ".join((person.profile.display_name or person.username) if person.is_active else "Unavailable account" for person in other_people) or "Just you"


class NotificationSerializer(serializers.ModelSerializer):
    actor = PublicUserSerializer(read_only=True)
    text = serializers.SerializerMethodField()
    event = serializers.SerializerMethodField()
    conversation_id = serializers.IntegerField(source="conversation.id", read_only=True)
    comment_post_id = serializers.IntegerField(source="comment.post.id", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "actor", "text", "event", "conversation_id", "comment_post_id", "created_at", "is_read"]

    def get_event(self, obj):
        if not obj.attendance:
            return None
        event = obj.attendance.event
        return {"id": event.id, "name": event.name}

    def get_is_read(self, obj):
        return obj.read_at is not None

    def get_text(self, obj):
        actor_name = (obj.actor.profile.display_name or obj.actor.username) if obj.actor and obj.actor.is_active else "Someone"
        if obj.kind == Notification.Kind.EVENT_INVITE and obj.attendance:
            return actor_name + " invited you to " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.INVITE_ACCEPTED and obj.attendance:
            return actor_name + " accepted your invitation to " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.RSVP and obj.attendance:
            return actor_name + " wants to join " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.RSVP_ACCEPTED and obj.attendance:
            return actor_name + " accepted your RSVP for " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.RSVP_DENIED and obj.attendance:
            return actor_name + " declined your RSVP for " + obj.attendance.event.name + "."
        if obj.kind == Notification.Kind.MESSAGE and obj.message:
            if obj.message.deleted_for_everyone:
                return actor_name + ": Message deleted"
            return actor_name + ": " + obj.message.body
        if obj.kind == Notification.Kind.EVENT_ENDED and obj.attendance:
            return obj.attendance.event.name + " has ended. Rate the people who attended."
        if obj.kind == Notification.Kind.COMMENT_REPLY and obj.comment:
            action = "replied to your comment" if obj.comment.parent_id else "commented on your post"
            return actor_name + " " + action + ": " + obj.comment.body
        return "You have a new SocialQuest update."


class ReportContentTypeField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        super().__init__(choices=["user", "post", "comment", "message", "event"], **kwargs)

    def to_internal_value(self, data):
        if not isinstance(data, bool) and (isinstance(data, int) or isinstance(data, str) and data.isdigit()):
            if len(str(data)) > 19 or not 0 < int(data) <= 9223372036854775807:
                self.fail("invalid_choice", input=data)
            content_type = ContentType.objects.filter(pk=data).first()
            models = {"user": User, "post": Post, "comment": Comment, "message": Message, "event": Event}
            if content_type:
                for name, model in models.items():
                    if content_type.model_class() == model:
                        return name
            self.fail("invalid_choice", input=data)
        return super().to_internal_value(data)

    def to_representation(self, value):
        return "user" if value.model_class() == User else value.model


class BoundedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    def to_internal_value(self, data):
        # DRF's related field otherwise calls only pk_field.to_internal_value,
        # skipping the min/max validators before issuing the database lookup.
        return super().to_internal_value(self.pk_field.run_validation(data))


class ReportSerializer(serializers.ModelSerializer):
    content_type = ReportContentTypeField(required=False)
    object_id = serializers.IntegerField(min_value=1, max_value=9223372036854775807, required=False)
    reported_user = BoundedPrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False, pk_field=serializers.IntegerField(min_value=1, max_value=9223372036854775807))

    class Meta:
        model = Report
        fields = ["id", "reporter", "reported_user", "content_type", "object_id", "reason", "created_at"]
        read_only_fields = ["id", "reporter", "created_at"]

    def validate(self, attrs):
        from .moderation import blocked_user_ids, visible_messages
        from .permissions import visible_events, visible_posts
        user = self.context["request"].user
        reported = attrs.get("reported_user")
        kind = attrs.get("content_type", "user" if reported else None)
        object_id = attrs.get("object_id", reported.pk if reported and kind == "user" else None)
        if not kind or object_id is None:
            raise serializers.ValidationError("Provide a content_type and object_id, or a reported_user.")
        querysets = {
            "user": User.objects.filter(is_active=True), "post": visible_posts(user),
            "event": visible_events(user), "message": visible_messages(user),
            "comment": Comment.objects.filter(post__in=visible_posts(user)).exclude(author_id__in=blocked_user_ids(user)),
        }
        content = querysets[kind].filter(pk=object_id).first()
        if content is None:
            raise serializers.ValidationError("This content is not available to report.")
        owner_id = content.pk if kind == "user" else content.host_id if kind == "event" else content.sender_id if kind == "message" else content.author_id
        if owner_id == user.pk:
            raise serializers.ValidationError("You cannot report your own account or content.")
        if reported and reported.pk != owner_id:
            raise serializers.ValidationError({"reported_user": "The reported user must own the content."})
        attrs.update(content_type=ContentType.objects.get_for_model(content), object_id=content.pk,
                     reported_user_id=owner_id)
        attrs.pop("reported_user", None)
        return attrs
