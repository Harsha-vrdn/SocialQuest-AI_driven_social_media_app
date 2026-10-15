from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Prefetch, Q, prefetch_related_objects
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from uuid import UUID, uuid4
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import MethodNotAllowed, NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404 as get_api_object_or_404
from rest_framework.response import Response
from .ai import generate_quests, generate_side_quests
from .authentication import SessionTokenAuthentication
from .accounts import delete_account, login_account, suspend_account
from .models import (AuthSession, Attendance, Comment, Conversation, ConversationReadState, Event, Follow, KarmaRating, Message,
                     Notification, NotificationDevice, Post, PostLike, PostLikeReward, PostShareClick, Profile, Quest, QuestSubmission, Report, UserBlock, UserPresence)
from .permissions import IsHostOrReadOnly, visible_events, visible_posts
from .recommendations import rank_events, rank_posts
from .search import EVENT_FIELDS, PEOPLE_FIELDS, ranked_search
from .chat_reads import with_message_receipts, with_unread_counts
from .serializers import (AttendanceSerializer, EventSerializer, KarmaRatingSerializer,
                          CommentSerializer, ConversationSerializer, MessageSerializer,
                          NotificationSerializer, PostSerializer, PublicUserSerializer, QuestSerializer,
                          QuestSubmissionSerializer, RegisterSerializer, ProfileUpdateSerializer, PresenceSerializer,
                          AccountSettingsSerializer, AccountPasswordSerializer, ReportSerializer)

from .moderation import blocked_user_ids, check_message_access, users_are_blocked, visible_conversations, visible_messages
from .querysets import with_post_stats, with_public_user_stats
from .throttles import AuthRateThrottle

User = get_user_model()


def direct_conversation_key(first_user_id, second_user_id):
    """Return the same identifier regardless of who starts the direct chat."""
    first_id, second_id = sorted((int(first_user_id), int(second_user_id)))
    return f"direct:{first_id}:{second_id}"


def create_participant_side_quests(event, participant, participant_number=None):
    """Create the private side-quest pair for one accepted event participant."""
    if Quest.objects.filter(event=event, kind=Quest.Kind.SIDE, assigned_to=participant).exists():
        return []
    if participant_number is None:
        participant_number = event.attendances.filter(status=Attendance.Status.ACCEPTED).count()
    existing_titles = list(event.quests.filter(kind=Quest.Kind.SIDE).values_list("title", flat=True))
    details = generate_side_quests(event, participant, participant_number, existing_titles)
    return [Quest.objects.create(event=event, assigned_to=participant, **quest) for quest in details]


def shared_post_link(request, post_id, shared_caption=None):
    """Reward a post author for one unique shared-link visit, then open the post."""
    post = get_object_or_404(visible_posts(request.user), id=post_id)
    visitor_id = request.COOKIES.get("socialquest_share_visitor") or uuid4().hex
    with transaction.atomic():
        _, created = PostShareClick.objects.get_or_create(post=post, visitor_id=visitor_id)
        if created:
            Profile.objects.filter(user=post.author).update(total_xp=F("total_xp") + 5)
    response = HttpResponseRedirect(f"/?view=post&post={post.id}")
    response.set_cookie("socialquest_share_visitor", visitor_id, max_age=60 * 60 * 24 * 365, httponly=True, samesite="Lax")
    return response


class AuthViewSet(viewsets.ViewSet):
    # The app uses API tokens for authentication.  Do not let an unrelated
    # browser Django session apply SessionAuthentication's CSRF requirement to
    # login/register requests.
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action in {"login", "register"}:
            throttles.append(AuthRateThrottle())
        return throttles

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def register(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = AuthSession.objects.create(user=user)
        return Response({"token": token.key, "user": PublicUserSerializer(user, context={"request": request}).data}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def login(self, request):
        result = login_account(request.data.get("username", ""), request.data.get("password", ""))
        if not result:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_400_BAD_REQUEST)
        user, token, previous_state = result
        return Response({"token": token.key, "user": PublicUserSerializer(user, context={"request": request}).data,
                         "reactivated": previous_state != Profile.AccountState.ACTIVE,
                         "deletion_cancelled": previous_state == Profile.AccountState.PENDING_DELETION})

    @action(detail=False, methods=["get", "patch"], url_path="settings", permission_classes=[permissions.IsAuthenticated])
    def account_settings(self, request):
        serializer = AccountSettingsSerializer(request.user.profile, data=request.data, partial=True) if request.method == "PATCH" else AccountSettingsSerializer(request.user.profile)
        if request.method == "PATCH":
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(serializer.data)

    def account_action(self, request, *, delete=False):
        serializer = AccountPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = suspend_account(request.user.pk, serializer.validated_data["password"], delete=delete)
        return Response({"account_state": profile.account_state, "deletion_due_at": profile.deletion_due_at})

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def deactivate(self, request):
        return self.account_action(request)

    @action(detail=False, methods=["post"], url_path="request-deletion", permission_classes=[permissions.IsAuthenticated])
    def request_deletion(self, request):
        return self.account_action(request, delete=True)

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def logout(self, request):
        # Only revoke the credential presented by this client. Presence and
        # notification registrations belong to each client and are released by
        # that client before this request.
        if isinstance(request.auth, AuthSession):
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsHostOrReadOnly]

    def get_queryset(self):
        participant_id = self.request.query_params.get("participant")
        my_events = self.request.query_params.get("attending", "").lower() in ("true", "1", "yes") or participant_id == "me"
        if my_events and not self.request.user.is_authenticated:
            raise NotAuthenticated("Log in to view your events.")
        hosts = with_public_user_stats(User.objects.all(), self.request.user)
        # Pending participants can still view/cancel their private event request.
        # Private moments retain the stricter default visible_events boundary.
        queryset = visible_events(self.request.user, include_pending=True).prefetch_related(Prefetch("host", queryset=hosts), "attendances", "quests")
        host_id = self.request.query_params.get("host")
        if host_id:
            if not host_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(host_id=host_id)
        if my_events:
            queryset = queryset.filter(
                attendances__user=self.request.user,
                attendances__status__in=[Attendance.Status.ACCEPTED, Attendance.Status.PENDING, Attendance.Status.INVITED],
                ends_at__gt=timezone.now(),
            ).distinct()
        elif participant_id:
            if not participant_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(
                attendances__user_id=participant_id,
                attendances__status=Attendance.Status.ACCEPTED,
            ).distinct()
        # Explore and sidebar discovery should only surface ongoing/upcoming plans.
        # Profile history and direct detail pages still need access to completed events.
        if self.action == "list" and not host_id and not participant_id:
            queryset = queryset.filter(ends_at__gt=timezone.now())
        query = self.request.query_params.get("q", "").strip()[:100]
        if query:
            queryset = ranked_search(queryset, query, EVENT_FIELDS, ("starts_at",))
            if not my_events:
                return queryset
        return queryset.order_by("starts_at", "pk")

    def perform_create(self, serializer):
        serializer.save(host=self.request.user)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def recommended(self, request):
        try:
            latitude = float(request.query_params["latitude"]) if "latitude" in request.query_params else None
            longitude = float(request.query_params["longitude"]) if "longitude" in request.query_params else None
        except (TypeError, ValueError):
            return Response({"detail": "Location coordinates must be numbers."}, status=status.HTTP_400_BAD_REQUEST)
        if (latitude is None) != (longitude is None):
            return Response({"detail": "Include both latitude and longitude for nearby events."}, status=status.HTTP_400_BAD_REQUEST)
        if latitude is not None and not -90 <= latitude <= 90:
            return Response({"detail": "Latitude must be between -90 and 90."}, status=status.HTTP_400_BAD_REQUEST)
        if longitude is not None and not -180 <= longitude <= 180:
            return Response({"detail": "Longitude must be between -180 and 180."}, status=status.HTTP_400_BAD_REQUEST)
        invited = list(self.get_queryset().filter(
            ends_at__gt=timezone.now(),
            attendances__user=request.user,
            attendances__status=Attendance.Status.INVITED,
        ))
        ranked = rank_events(request.user, latitude=latitude, longitude=longitude)
        events = invited + [event for _, event, _ in ranked]
        hosts = {host.pk: host for host in with_public_user_stats(User.objects.filter(pk__in=[event.host_id for event in events]), request.user)}
        for event in events:
            event.host = hosts[event.host_id]
        prefetch_related_objects(events, "attendances", "quests")
        reasons = ["You were invited"] * len(invited) + [reason for _, _, reason in ranked]
        payload = EventSerializer(events, many=True, context={"request": request}).data
        for item, reason in zip(payload, reasons):
            item["recommendation_reason"] = reason
        return Response(payload)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def join(self, request, pk=None):
        visible_event = self.get_object()
        event = Event.objects.select_for_update().get(pk=visible_event.pk)
        if event.host == request.user:
            return Response({"detail": "Hosts are already part of their event."}, status=400)
        if event.is_finished:
            return Response({"detail": "Join requests close when the event ends."}, status=400)
        note = str(request.data.get("note", "") or "").strip()[:240]
        existing = Attendance.objects.select_for_update().filter(event=event, user=request.user).first()
        if existing and existing.status in (Attendance.Status.PENDING, Attendance.Status.ACCEPTED):
            return Response(AttendanceSerializer(existing, context={"request": request}).data)
        active_rsvps = Attendance.objects.select_for_update().filter(
            user=request.user,
            status__in=[Attendance.Status.PENDING, Attendance.Status.ACCEPTED],
            event__ends_at__gt=timezone.now(),
        )
        if active_rsvps.count() >= 2:
            return Response({"detail": "You can RSVP to at most 2 upcoming or active events at a time."}, status=400)

        invited = bool(existing and existing.status == Attendance.Status.INVITED)
        next_status = Attendance.Status.ACCEPTED if invited else Attendance.Status.PENDING
        if invited and event.attendances.filter(status=Attendance.Status.ACCEPTED).count() >= event.capacity:
            return Response({"detail": "This event is at capacity."}, status=400)
        if existing:
            existing.status = next_status
            existing.note = note
            existing.save(update_fields=["status", "note"])
            attendance = existing
        else:
            attendance = Attendance.objects.create(event=event, user=request.user, note=note, status=next_status)
        if invited:
            if event.quests.filter(kind=Quest.Kind.MAIN).exists():
                create_participant_side_quests(event, request.user)
            Notification.objects.update_or_create(
                recipient=event.host,
                attendance=attendance,
                kind=Notification.Kind.INVITE_ACCEPTED,
                defaults={"actor": request.user, "read_at": None},
            )
        else:
            Notification.objects.update_or_create(
                recipient=event.host,
                attendance=attendance,
                kind=Notification.Kind.RSVP,
                defaults={"actor": request.user, "read_at": None},
            )
        return Response(AttendanceSerializer(attendance, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def invite(self, request, pk=None):
        visible_event = self.get_object()
        event = Event.objects.select_for_update().get(pk=visible_event.pk)
        if event.host != request.user:
            raise PermissionDenied("Only the host can invite people.")
        if event.is_finished:
            raise ValidationError("Invitations close when the event ends.")
        user_id = request.data.get("user_id")
        if user_id is None or not str(user_id).isdigit():
            raise ValidationError({"user_id": "Provide a valid user ID."})
        invitee = get_api_object_or_404(User, pk=int(user_id), is_active=True)
        if users_are_blocked(request.user.pk, invitee.pk):
            raise PermissionDenied("Invitations are unavailable between these accounts.")
        if invitee == request.user:
            raise ValidationError({"user_id": "Hosts are already part of their event."})
        attendance, created = Attendance.objects.select_for_update().get_or_create(
            event=event,
            user=invitee,
            defaults={"status": Attendance.Status.INVITED},
        )
        if attendance.status != Attendance.Status.ACCEPTED:
            attendance.status = Attendance.Status.INVITED
            attendance.note = ""
            attendance.save(update_fields=["status", "note"])
        Notification.objects.update_or_create(
            recipient=invitee,
            attendance=attendance,
            kind=Notification.Kind.EVENT_INVITE,
            defaults={"actor": request.user, "read_at": None},
        )
        return Response(AttendanceSerializer(attendance, context={"request": request}).data, status=201 if created else 200)

    @action(detail=True, methods=["post"], url_path="cancel-rsvp", permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def cancel_rsvp(self, request, pk=None):
        event = Event.objects.select_for_update().get(pk=self.get_object().pk)
        attendance = Attendance.objects.filter(event=event, user=request.user).first()
        if not attendance or attendance.status not in (Attendance.Status.INVITED, Attendance.Status.PENDING, Attendance.Status.ACCEPTED):
            return Response({"detail": "No active RSVP found to cancel."}, status=status.HTTP_400_BAD_REQUEST)
        if event.is_finished:
            return Response({"detail": "Cannot cancel RSVP for a finished event."}, status=status.HTTP_400_BAD_REQUEST)
        attendance.status = Attendance.Status.CANCELLED
        attendance.save(update_fields=["status"])
        return Response(AttendanceSerializer(attendance, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def chat(self, request, pk=None):
        event = Event.objects.select_for_update().get(pk=self.get_object().pk)
        if event.host_id != request.user.id and not event.attendances.filter(user=request.user, status=Attendance.Status.ACCEPTED).exists():
            raise PermissionDenied("The event chat is for the host and accepted participants.")
        from .event_chat import sync_event_conversation
        conversation = sync_event_conversation(event.pk)
        conversation.hidden_for.remove(request.user)
        return Response(ConversationSerializer(conversation, context={"request": request}).data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def requests(self, request, pk=None):
        event = self.get_object()
        if event.host != request.user:
            return Response({"detail": "Only the host can see requests."}, status=403)
        return Response(AttendanceSerializer(event.attendances.prefetch_related(Prefetch("user", queryset=with_public_user_stats(User.objects.all(), request.user))), many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def attendees(self, request, pk=None):
        event = self.get_object()
        accepted = event.attendances.filter(status=Attendance.Status.ACCEPTED).prefetch_related(Prefetch("user", queryset=with_public_user_stats(User.objects.all(), request.user)))
        return Response(AttendanceSerializer(accepted, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="review-request", permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def review_request(self, request, pk=None):
        event = self.get_object()
        event = Event.objects.select_for_update().get(pk=event.pk)
        if event.host != request.user:
            return Response({"detail": "Only the host can approve requests."}, status=403)
        attendance_id = request.data.get("attendance_id")
        if attendance_id is None or not (isinstance(attendance_id, int) or (isinstance(attendance_id, str) and str(attendance_id).isdigit())):
            return Response({"detail": "attendance_id must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)
        attendance = get_object_or_404(event.attendances, id=int(attendance_id))
        if attendance.status == Attendance.Status.INVITED:
            return Response({"detail": "Only the invited person can accept this invitation."}, status=400)
        decision = request.data.get("decision")
        if decision not in (Attendance.Status.ACCEPTED, Attendance.Status.DENIED):
            return Response({"detail": "decision must be ACCEPTED or DENIED."}, status=400)
        if event.is_finished and decision == Attendance.Status.ACCEPTED:
            return Response({"detail": "The attendee list is closed because the event has ended."}, status=400)
        if decision == Attendance.Status.ACCEPTED and attendance.status != decision and event.attendances.filter(status=Attendance.Status.ACCEPTED).count() >= event.capacity:
            return Response({"detail": "This event is at capacity."}, status=400)
        status_changed = attendance.status != decision
        attendance.status = decision
        attendance.save(update_fields=["status"])
        if status_changed and decision == Attendance.Status.ACCEPTED and event.quests.filter(kind=Quest.Kind.MAIN).exists():
            create_participant_side_quests(event, attendance.user)
        if status_changed:
            kind = Notification.Kind.RSVP_ACCEPTED if decision == Attendance.Status.ACCEPTED else Notification.Kind.RSVP_DENIED
            Notification.objects.update_or_create(recipient=attendance.user, attendance=attendance, kind=kind, defaults={"actor": request.user, "read_at": None})
        return Response(AttendanceSerializer(attendance, context={"request": request}).data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def quests(self, request, pk=None):
        event = self.get_object()
        if not event.quests_are_active:
            return Response([])
        if event.host == request.user:
            quests = event.quests.all()
        elif request.user.is_authenticated and event.attendances.filter(user=request.user, status=Attendance.Status.ACCEPTED).exists():
            quests = event.quests.filter(Q(kind=Quest.Kind.MAIN) | Q(kind=Quest.Kind.SIDE, assigned_to=request.user))
        else:
            quests = event.quests.filter(kind=Quest.Kind.MAIN)
        return Response(QuestSerializer(quests, many=True, context={"request": request}).data)



    @action(detail=True, methods=["post"], url_path="generate-quests", permission_classes=[permissions.IsAuthenticated])
    def generate_event_quests(self, request, pk=None):
        event = self.get_object()
        if event.host != request.user:
            return Response({"detail": "Only the host can generate quests."}, status=403)
        if event.is_finished:
            return Response({"detail": "Quests cannot be generated after an event has ended."}, status=400)
        replace = request.data.get("replace")
        replace_requested = replace is True or str(replace).lower() in ("true", "1")
        if event.quests.exists() and not replace_requested:
            return Response({"detail": "This event already has quests. Send replace=true to generate a new set."}, status=400)
        if replace_requested and QuestSubmission.objects.filter(quest__event=event).exists():
            return Response({"detail": "Cannot regenerate quests after submissions have been made."}, status=400)
        with transaction.atomic():
            if replace_requested:
                event.quests.all().delete()
            generated = generate_quests(event)
            main_quest = next((quest for quest in generated if quest.get("kind") == Quest.Kind.MAIN), None)
            if not main_quest:
                return Response({"detail": "Quest generation did not return a main quest."}, status=502)
            quests = [Quest.objects.create(event=event, **main_quest)]
            accepted = event.attendances.filter(status=Attendance.Status.ACCEPTED).select_related("user").order_by("joined_at", "id")
            for participant_number, attendance in enumerate(accepted, start=1):
                quests.extend(create_participant_side_quests(event, attendance.user, participant_number))
        return Response(QuestSerializer(quests, many=True, context={"request": request}).data, status=201)


class QuestSubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = QuestSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return QuestSubmission.objects.select_related("quest", "quest__event").prefetch_related(Prefetch("participant", queryset=with_public_user_stats(User.objects.all(), self.request.user))).filter(participant=self.request.user)

    def perform_create(self, serializer):
        quest = serializer.validated_data["quest"]
        if not quest.event.quests_are_active:
            raise ValidationError("Quest proof can only be submitted while the event is in progress.")
        accepted = Attendance.objects.filter(event=quest.event, user=self.request.user, status=Attendance.Status.ACCEPTED).exists()
        if not accepted:
            raise PermissionDenied("You must be accepted into the event before submitting a quest.")
        if quest.kind == Quest.Kind.SIDE and quest.assigned_to_id != self.request.user.id:
            raise PermissionDenied("This side quest is assigned to a different participant.")
        with transaction.atomic():
            # Lock the participant so duplicate uploads cannot race the unique constraint.
            User.objects.select_for_update().get(pk=self.request.user.pk)
            if QuestSubmission.objects.filter(quest=quest, participant=self.request.user).exists():
                raise ValidationError("Looks like you already snapped proof for this one — nice work! 🎉")
            submission = serializer.save(
                participant=self.request.user,
                status=QuestSubmission.Status.APPROVED,
                reviewed_at=timezone.now(),
            )
            Post.objects.create(
                author=self.request.user,
                event=quest.event,
                quest=quest,
                kind=Post.Kind.REEL if submission.media_type == "REEL" else Post.Kind.POST,
                body=submission.caption,
                media=submission.media.name,
                location_name=quest.event.location_name,
            )
            # XP is awarded immediately — no host review required.
            Profile.objects.filter(user=self.request.user).update(total_xp=F("total_xp") + quest.xp_reward)


class KarmaRatingViewSet(viewsets.ModelViewSet):
    serializer_class = KarmaRatingSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = KarmaRating.objects.select_related("event").prefetch_related(Prefetch("rater", queryset=with_public_user_stats(User.objects.all(), self.request.user)), Prefetch("target", queryset=with_public_user_stats(User.objects.all(), self.request.user))).filter(rater=self.request.user)
        event_id = self.request.query_params.get("event")
        if event_id:
            if not event_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(event_id=event_id)
        return queryset

    def _validate_rating_participants(self, event, target):
        if not event.is_finished:
            raise ValidationError("Karma opens after the event has ended.")
        if target == self.request.user:
            raise ValidationError("Choose another person who attended this event.")
        attendees = Attendance.objects.filter(event=event, status=Attendance.Status.ACCEPTED)
        if not attendees.filter(user=self.request.user).exists() or not attendees.filter(user=target).exists():
            raise PermissionDenied("You can only rate another accepted attendee from this event.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event, target = serializer.validated_data["event"], serializer.validated_data["target"]
        self._validate_rating_participants(event, target)
        reaction = serializer.validated_data["reaction"]
        rating, created = KarmaRating.objects.update_or_create(
            event=event,
            rater=request.user,
            target=target,
            defaults={
                "score": KarmaRating.score_for_reaction(reaction),
                "note": serializer.validated_data.get("note", ""),
            },
        )
        response_serializer = self.get_serializer(rating)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PeopleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PublicUserSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = User.objects.filter(is_active=True).exclude(pk__in=blocked_user_ids(self.request.user))
        query = self.request.query_params.get("q", "").strip()[:100]
        if query:
            queryset = ranked_search(queryset, query, PEOPLE_FIELDS, ("username",))
        else:
            queryset = queryset.order_by("username")
        return with_public_user_stats(queryset, self.request.user)

    @action(detail=False, methods=["get", "patch"], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        if request.method == "PATCH":
            serializer = ProfileUpdateSerializer(request.user.profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(PublicUserSerializer(request.user, context={"request": request}).data)

    @action(detail=False, methods=["delete"], url_path="me/delete-account", permission_classes=[permissions.IsAuthenticated])
    def delete_account(self, request):
        delete_account(request.user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post", "delete"], permission_classes=[permissions.IsAuthenticated])
    @transaction.atomic
    def block(self, request, pk=None):
        person = get_api_object_or_404(User, pk=pk)
        if person.pk == request.user.pk:
            raise ValidationError("You cannot block yourself.")
        if request.method == "DELETE":
            UserBlock.objects.filter(blocker=request.user, blocked_user=person).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        relation, created = UserBlock.objects.get_or_create(blocker=request.user, blocked_user=person)
        Follow.objects.filter(Q(follower=request.user, following=person) | Q(follower=person, following=request.user)).delete()
        # Clear queued payloads too; hiding a feed item must not leave a pending
        # push containing the same blocked sender's name/message.
        from .models import NotificationDelivery
        NotificationDelivery.objects.filter(
            (Q(device__user=request.user) & (Q(message__sender=person) | Q(notification__actor=person)))
            | (Q(device__user=person) & (Q(message__sender=request.user) | Q(notification__actor=request.user))),
            status__in=["PENDING", "SENDING"],
        ).update(status="SUPPRESSED")
        return Response({"blocked": True, "created": created}, status=201 if created else 200)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def follow(self, request, pk=None):
        person = self.get_object()
        if person == request.user:
            return Response({"detail": "You cannot follow yourself."}, status=400)
        relation, created = Follow.objects.get_or_create(follower=request.user, following=person)
        return Response({"following": True, "created": created}, status=201 if created else 200)

    @follow.mapping.delete
    def unfollow(self, request, pk=None):
        person = self.get_object()
        Follow.objects.filter(follower=request.user, following=person).delete()
        return Response(status=204)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def following(self, request):
        following_ids = Follow.objects.filter(follower=request.user).values_list("following_id", flat=True)
        queryset = self.get_queryset().filter(id__in=following_ids)
        return Response(PublicUserSerializer(queryset, many=True, context={"request": request}).data)

    def relationship_list(self, person, relationship):
        if relationship == "followers":
            user_ids = person.follower_relations.values_list("follower_id", flat=True)
        else:
            user_ids = person.following_relations.values_list("following_id", flat=True)
        queryset = self.get_queryset().filter(id__in=user_ids)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=True, methods=["get"], url_path="followers")
    def followers(self, request, pk=None):
        person = get_api_object_or_404(User.objects.filter(is_active=True).exclude(pk__in=blocked_user_ids(request.user)), pk=pk)
        return self.relationship_list(person, "followers")

    @action(detail=True, methods=["get"], url_path="following")
    def following_list(self, request, pk=None):
        person = get_api_object_or_404(User.objects.filter(is_active=True).exclude(pk__in=blocked_user_ids(request.user)), pk=pk)
        return self.relationship_list(person, "following")

    @action(detail=False, methods=["put", "delete"], permission_classes=[permissions.IsAuthenticated])
    def presence(self, request):
        serializer = PresenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_id = serializer.validated_data["session_id"]
        if request.method == "DELETE":
            UserPresence.objects.filter(user=request.user, session_id=session_id).delete()
        else:
            now = timezone.now()
            UserPresence.objects.filter(last_seen__lte=now - UserPresence.TIMEOUT).delete()
            UserPresence.objects.update_or_create(
                user=request.user, session_id=session_id,
                defaults={"last_seen": now, "chats_open": serializer.validated_data["chats_open"]},
            )
            if serializer.validated_data["chats_open"]:
                from .notification_delivery import suppress_chat_deliveries
                suppress_chat_deliveries(request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        authors = with_public_user_stats(User.objects.all(), self.request.user)
        comments = Comment.objects.exclude(author_id__in=blocked_user_ids(self.request.user)).prefetch_related(Prefetch("author", queryset=authors)).order_by("-created_at")
        queryset = with_post_stats(visible_posts(self.request.user), self.request.user).select_related("event", "quest").prefetch_related(
            Prefetch("author", queryset=authors),
            Prefetch("comments", queryset=comments[:2], to_attr="prefetched_comments"),
        )
        author_id = self.request.query_params.get("author")
        kind = self.request.query_params.get("kind")
        event_id = self.request.query_params.get("event")
        if author_id:
            if not author_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(author_id=author_id)
        if event_id:
            if not event_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(event_id=event_id)
        if kind in (Post.Kind.POST, Post.Kind.REEL):
            queryset = queryset.filter(kind=kind)
        return queryset.order_by("-created_at", "-id")

    def perform_create(self, serializer):
        event = serializer.validated_data.get("event")
        if event and event.host_id != self.request.user.id and not Attendance.objects.filter(event=event, user=self.request.user, status=Attendance.Status.ACCEPTED).exists():
            raise PermissionDenied("Only accepted participants can add a moment to this event.")
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        if self.get_object().author != self.request.user:
            raise PermissionDenied("You can only edit your own post.")
        event = serializer.validated_data.get("event", self.get_object().event)
        if event and event.host_id != self.request.user.id and not Attendance.objects.filter(event=event, user=self.request.user, status=Attendance.Status.ACCEPTED).exists():
            raise PermissionDenied("Only accepted participants can add a moment to this event.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.author != self.request.user:
            raise PermissionDenied("You can only delete your own post.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="for-you", permission_classes=[permissions.IsAuthenticated])
    def for_you(self, request):
        ranked = rank_posts(request.user, self.get_queryset())
        payload = PostSerializer([post for _, post, _ in ranked], many=True, context={"request": request}).data
        for item, (_, _, reason) in zip(payload, ranked):
            item["recommendation_reason"] = reason
        return Response(payload)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, pk=None):
        post = self.get_object()
        with transaction.atomic():
            _, created = PostLike.objects.get_or_create(post=post, user=request.user)
            if post.author_id != request.user.id:
                _, rewarded = PostLikeReward.objects.get_or_create(post=post, user=request.user)
                if created and rewarded:
                    Profile.objects.filter(user=post.author).update(total_xp=F("total_xp") + 1)
        return Response({"liked": True, "created": created, "like_count": PostLike.objects.filter(post=post).count()}, status=201 if created else 200)

    @like.mapping.delete
    def unlike(self, request, pk=None):
        post = self.get_object()
        PostLike.objects.filter(post=post, user=request.user).delete()
        return Response({"liked": False, "like_count": PostLike.objects.filter(post=post).count()})

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def following(self, request):
        people = Follow.objects.filter(follower=request.user).values_list("following_id", flat=True)
        queryset = self.get_queryset().filter(author_id__in=[request.user.id, *people])
        return Response(PostSerializer(queryset, many=True, context={"request": request}).data)


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        authors = with_public_user_stats(User.objects.all(), self.request.user)
        queryset = Comment.objects.filter(post__in=visible_posts(self.request.user)).exclude(
            author_id__in=blocked_user_ids(self.request.user),
        ).select_related("post", "parent").prefetch_related(Prefetch("author", queryset=authors))
        post_id = self.request.query_params.get("post")
        if post_id:
            if not post_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(post_id=post_id)
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        post = get_object_or_404(visible_posts(self.request.user), pk=serializer.validated_data["post"].pk)
        parent = serializer.validated_data.get("parent")
        if parent and users_are_blocked(self.request.user.pk, parent.author_id):
            raise PermissionDenied("Replies are unavailable between these accounts.")
        comment = serializer.save(author=self.request.user)
        recipient = comment.parent.author if comment.parent_id else post.author
        if recipient != self.request.user:
            Notification.objects.get_or_create(
                recipient=recipient,
                actor=self.request.user,
                comment=comment,
                kind=Notification.Kind.COMMENT_REPLY,
            )

    def perform_update(self, serializer):
        comment = self.get_object()
        if comment.author != self.request.user:
            raise PermissionDenied("You can only edit your own comment.")
        serializer.save(post=comment.post)

    def perform_destroy(self, instance):
        if instance.author != self.request.user and instance.post.author != self.request.user:
            raise PermissionDenied("Only the comment or post author can remove this comment.")
        instance.delete()


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        participants = with_public_user_stats(User.objects.all(), self.request.user)
        messages = with_message_receipts(visible_messages(self.request.user)).select_related("attachment").prefetch_related(Prefetch("sender", queryset=participants))
        return with_unread_counts(visible_conversations(self.request.user), self.request.user).select_related("event").prefetch_related(
            Prefetch("participants", queryset=participants.exclude(pk__in=blocked_user_ids(self.request.user))),
            Prefetch("messages", queryset=messages, to_attr="visible_messages"),
        ).order_by("-updated_at")

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")

    def perform_update(self, serializer):
        if serializer.instance.event_id:
            raise ValidationError("Event chat names follow the event. Edit the event name instead.")
        title = serializer.validated_data.get("title", "").strip()
        serializer.save(title=title)

    def perform_destroy(self, instance):
        """Removing a chat only hides it for the requesting participant."""
        instance.hidden_for.add(self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        message_id = request.data.get("message_id")
        if not isinstance(message_id, int) or isinstance(message_id, bool) or message_id <= 0:
            raise ValidationError({"message_id": "Provide the ID of the last displayed message."})
        get_api_object_or_404(visible_messages(request.user, conversation.messages.all()), pk=message_id)
        with transaction.atomic():
            read_state, _ = ConversationReadState.objects.get_or_create(conversation=conversation, user=request.user)
            # The conditional update cannot move a cursor backwards when devices race.
            ConversationReadState.objects.filter(pk=read_state.pk, last_read_message_id__lt=message_id).update(last_read_message_id=message_id)
        current = with_unread_counts(Conversation.objects.filter(pk=conversation.pk), request.user).get()
        return Response({"unread_count": current.unread_count, "read_through_message_id": current.read_through_message_id})

    @action(detail=True, methods=["get"], url_path="attachment-devices")
    def attachment_devices(self, request, pk=None):
        from .chat_attachments import conversation_devices
        participants, devices = conversation_devices(self.get_object(), request.user)
        return Response({"participants": participants, "devices": [{"id": str(device.pk), "user": device.user_id, "public_key": device.public_key} for device in devices]})

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def direct(self, request):
        user_id = request.data.get("user_id")
        if user_id is None or not (isinstance(user_id, int) or (isinstance(user_id, str) and str(user_id).isdigit())):
            return Response({"detail": "user_id must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)
        target = get_object_or_404(User, id=int(user_id), is_active=True)
        if target == request.user:
            return Response({"detail": "Choose someone else to start a conversation."}, status=400)
        if users_are_blocked(request.user.pk, target.pk):
            raise PermissionDenied("Messaging is unavailable between these accounts.")
        with transaction.atomic():
            conversation, created = Conversation.objects.get_or_create(
                direct_key=direct_conversation_key(request.user.id, target.id),
                defaults={"is_group": False},
            )
            if created:
                conversation.participants.add(request.user, target)
            else:
                conversation.hidden_for.remove(request.user)
        return Response(ConversationSerializer(conversation, context={"request": request}).data, status=201 if created else 200)


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        senders = with_public_user_stats(User.objects.all(), self.request.user)
        queryset = with_message_receipts(visible_messages(self.request.user)).select_related("conversation", "attachment").prefetch_related(Prefetch("sender", queryset=senders))
        conversation_id = self.request.query_params.get("conversation")
        if conversation_id:
            if not conversation_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(conversation_id=conversation_id)
        return queryset

    def perform_create(self, serializer):
        conversation = serializer.validated_data["conversation"]
        check_message_access(conversation, self.request.user)
        message = serializer.save(sender=self.request.user)
        if not serializer.created_message:
            return
        Conversation.objects.filter(pk=conversation.pk).update(updated_at=timezone.now())
        conversation.hidden_for.clear()
        from .notification_delivery import queue_message
        queue_message(message)

    def perform_update(self, serializer):
        message = self.get_object()
        if message.sender != self.request.user:
            raise PermissionDenied("You can only edit your own message.")
        if message.deleted_for_everyone:
            raise PermissionDenied("A deleted message cannot be edited.")
        serializer.save(conversation=message.conversation, edited_at=timezone.now())

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        if request.query_params.get("scope") == "everyone":
            if message.sender != request.user:
                raise PermissionDenied("Only the sender can delete a message for everyone.")
            message.body = ""
            message.deleted_for_everyone = True
            message.edited_at = timezone.now()
            message.hidden_for.clear()
            message.save(update_fields=["body", "deleted_for_everyone", "edited_at"])
            if getattr(message, "attachment", None):
                from .chat_attachments import purge_attachment
                purge_attachment(message.attachment.pk, "deleted")
        else:
            message.hidden_for.add(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["get"], url_path="delivery-config")
    def delivery_config(self, request):
        from .notification_delivery import webpush_public_key
        return Response({"webpush_public_key": webpush_public_key()})

    @action(detail=False, methods=["get", "put", "delete"])
    def device(self, request):
        from .notification_delivery import validate_address
        try:
            device_id = UUID(str(request.query_params.get("id") if request.method == "GET" else request.data.get("id")))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"id": "Provide a valid device ID."})
        device = NotificationDevice.objects.filter(pk=device_id).first()
        if device and device.user_id != request.user.id:
            raise PermissionDenied("This device belongs to another account.")
        if request.method == "DELETE":
            if device:
                device.enabled = False; device.save(update_fields=["enabled"])
                device.deliveries.filter(status="PENDING").update(status="SUPPRESSED")
            return Response(status=204)
        if request.method == "PUT":
            transport = request.data.get("transport")
            address = validate_address(transport, request.data.get("address", {}))
            device, _ = NotificationDevice.objects.update_or_create(
                pk=device_id, defaults={"user": request.user, "transport": transport, "address": address, "enabled": True},
            )
            if transport != "LOCAL":
                NotificationDevice.objects.filter(transport=transport, address=address).exclude(pk=device_id).update(enabled=False)
        if not device:
            return Response({"enabled": False})
        return Response({"id": str(device.id), "transport": device.transport, "enabled": device.enabled})

    @action(detail=False, methods=["post"], url_path="poll-delivery")
    def poll_delivery(self, request):
        from .notification_delivery import poll_local
        try:
            device_id = UUID(str(request.data.get("id")))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"id": "Provide a valid device ID."})
        device = get_api_object_or_404(NotificationDevice, pk=device_id, user=request.user, enabled=True, transport="LOCAL")
        return Response({"deliveries": poll_local(device)})

    def get_queryset(self):
        from .notification_delivery import ensure_ended_notifications
        ensure_ended_notifications(self.request.user.id)
        actors = with_public_user_stats(User.objects.all(), self.request.user)
        blocked = blocked_user_ids(self.request.user)
        return Notification.objects.filter(recipient=self.request.user).exclude(kind=Notification.Kind.MESSAGE).exclude(
            actor_id__in=blocked,
        ).exclude(attendance__event__host_id__in=blocked).select_related(
            "attendance", "attendance__event", "conversation", "message", "comment", "comment__post"
        ).prefetch_related(Prefetch("actor", queryset=actors))

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        ids = request.data.get("ids")
        queryset = self.get_queryset().filter(read_at__isnull=True)
        if ids is not None:
            if not isinstance(ids, list) or any(not isinstance(value, int) or isinstance(value, bool) for value in ids):
                raise ValidationError({"ids": "Provide a list of notification IDs."})
            queryset = queryset.filter(id__in=ids)
        updated = queryset.update(read_at=timezone.now())
        return Response({"marked_read": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(read_at__isnull=True).count()})


class ReportViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["post", "options"]

    def perform_create(self, serializer):
        serializer.save(reporter=self.request.user)
