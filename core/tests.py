from datetime import timedelta
from io import BytesIO
import shutil
import tempfile
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from .models import AuthSession, Attendance, Comment, Conversation, Event, Follow, KarmaRating, Message, Notification, NotificationDevice, Post, PostLikeReward, PostShareClick, Quest, QuestSubmission, UserPresence
from .media import MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, compress_image_upload
from .serializers import PostSerializer

User = get_user_model()


def image_upload(name="proof.jpg", size=(8, 8)):
    source = BytesIO()
    Image.new("RGB", size, color=(120, 80, 180)).save(source, format="JPEG")
    return SimpleUploadedFile(name, source.getvalue(), content_type="image/jpeg")


class SocialQuestFlowTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls._media_dir = tempfile.mkdtemp(prefix="socialquest-tests-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_dir)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_dir)

    def setUp(self):
        self.host = User.objects.create_user("host", password="password123")
        self.alex = User.objects.create_user("alex", password="password123")
        self.sam = User.objects.create_user("sam", password="password123")
        self.jordan = User.objects.create_user("jordan", password="password123")
        self.client = APIClient()
        self.event = Event.objects.create(
            host=self.host,
            name="Coffee and conversations",
            description="Meet new people over coffee.",
            location_name="Bengaluru",
            starts_at=timezone.now() + timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=1, hours=2),
        )

    def test_token_login_works_with_an_existing_browser_session(self):
        browser_client = APIClient(enforce_csrf_checks=True)
        self.assertTrue(browser_client.login(username="alex", password="password123"))

        response = browser_client.post(
            "/api/auth/login/",
            {"username": "alex", "password": "password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)
        second = browser_client.post("/api/auth/login/", {"username": "alex", "password": "password123"}, format="json")
        self.assertNotEqual(response.data["token"], second.data["token"])

    def test_host_generates_one_main_quest_and_private_side_quests(self):
        self.client.force_authenticate(self.host)
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        Attendance.objects.create(event=self.event, user=self.sam, status=Attendance.Status.ACCEPTED)
        generated = [
            {"kind": "MAIN", "title": "Meet two people", "instructions": "Say hello and take a group photo.", "xp_reward": 120, "position": 1},
        ]
        def side_quests(event, participant, participant_number, existing_titles):
            return [
                {"kind": "SIDE", "title": f"Connection {participant.username}", "instructions": "Meet someone new and capture the moment.", "xp_reward": 45, "position": 1},
                {"kind": "SIDE", "title": f"Kindness {participant.username}", "instructions": "Help another guest and capture the moment.", "xp_reward": 60, "position": 2},
            ]

        with patch("core.views.generate_quests", return_value=generated), patch("core.views.generate_side_quests", side_effect=side_quests):
            response = self.client.post(f"/api/events/{self.event.id}/generate-quests/")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.event.quests.count(), 5)
        self.assertEqual(self.event.quests.filter(kind="MAIN").count(), 1)
        self.assertEqual(self.event.quests.filter(kind="SIDE", assigned_to=self.alex).count(), 2)
        self.assertEqual(self.event.quests.filter(kind="SIDE", assigned_to=self.sam).count(), 2)

        self.event.starts_at = timezone.now() - timedelta(minutes=5)
        self.event.ends_at = timezone.now() + timedelta(hours=1)
        self.event.save()
        self.client.force_authenticate(self.alex)
        alex_quests = self.client.get(f"/api/events/{self.event.id}/quests/").data
        self.assertEqual(len(alex_quests), 3)
        self.assertEqual(sum(quest["kind"] == "MAIN" for quest in alex_quests), 1)
        self.assertTrue(all(quest.assigned_to_id == self.alex.id for quest in self.event.quests.filter(kind="SIDE", assigned_to=self.alex)))

    def test_xp_is_awarded_only_once_on_approved_media_proof(self):
        self.event.starts_at = timezone.now() - timedelta(hours=1)
        self.event.ends_at = timezone.now() + timedelta(hours=1)
        self.event.save()
        quest = Quest.objects.create(event=self.event, kind="MAIN", title="Say hello", instructions="Make a friend.", xp_reward=75)
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        self.client.force_authenticate(self.alex)
        proof = image_upload()
        response = self.client.post("/api/submissions/", {"quest": quest.id, "media": proof, "media_type": "IMAGE"}, format="multipart")
        self.assertEqual(response.status_code, 201)
        submission = QuestSubmission.objects.get()
        # Submission is auto-approved — no host review required.
        self.assertEqual(submission.status, QuestSubmission.Status.APPROVED)
        quest_moment = Post.objects.get(author=self.alex, quest=quest)
        self.assertEqual(quest_moment.event, self.event)
        self.assertEqual(quest_moment.media.name, submission.media.name)
        self.assertEqual(self.client.get(f"/api/posts/?event={self.event.id}").data["count"], 1)
        # XP is awarded immediately on submission — verify right away.
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 75)
        # A second submission for the same quest is rejected — XP is not doubled.
        proof2 = image_upload("proof2.jpg")
        response2 = self.client.post("/api/submissions/", {"quest": quest.id, "media": proof2, "media_type": "IMAGE"}, format="multipart")
        self.assertEqual(response2.status_code, 400)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 75)

    def test_quest_photo_and_reel_include_event_attribution_without_private_leaks(self):
        self.event.starts_at = timezone.now() - timedelta(minutes=5)
        self.event.ends_at = timezone.now() + timedelta(hours=1)
        self.event.privacy = Event.Privacy.PRIVATE
        self.event.save()
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        self.client.force_authenticate(self.alex)
        for media_type in ["IMAGE", "REEL"]:
            quest = Quest.objects.create(event=self.event, kind="MAIN", title="Meet a new friend " + media_type, instructions="Share your moment", xp_reward=50)
            media = image_upload() if media_type == "IMAGE" else SimpleUploadedFile("proof.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 20, content_type="video/mp4")
            submitted = self.client.post("/api/submissions/", {"quest": quest.id, "media": media, "media_type": media_type, "caption": "We did it!"}, format="multipart")
            self.assertEqual(submitted.status_code, 201, submitted.data)
            moment = Post.objects.get(quest=quest)
            response = self.client.get(f"/api/posts/{moment.id}/")
            self.assertEqual(response.data["event_name"], self.event.name)
            self.assertEqual(response.data["quest_title"], quest.title)
            self.assertEqual(response.data["kind"], "POST" if media_type == "IMAGE" else "REEL")
            edited = self.client.patch(f"/api/posts/{moment.id}/", {"event_name": "Forged event", "quest_title": "Forged quest", "body": "Great afternoon"}, format="json")
            self.assertEqual(edited.status_code, 200)
            self.assertEqual(edited.data["event_name"], self.event.name)
            self.assertEqual(edited.data["quest_title"], quest.title)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 100)
        for viewer in [None, self.sam]:
            self.client.force_authenticate(viewer)
            self.assertEqual(self.client.get(f"/api/posts/{moment.id}/").status_code, 404)
            self.assertEqual(self.client.get("/api/posts/").data["results"], [])

    def test_quests_only_exist_during_the_event_and_requests_close_afterward(self):
        quest = Quest.objects.create(event=self.event, kind="MAIN", title="Say hello", instructions="Make a friend.", xp_reward=75)
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)

        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/quests/").data, [])
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/").data["quest_status"], "SCHEDULED")

        self.event.starts_at = timezone.now() - timedelta(minutes=5)
        self.event.ends_at = timezone.now() + timedelta(hours=1)
        self.event.save()
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/join/", {}, format="json").status_code, 201)
        pending_request = Attendance.objects.get(event=self.event, user=self.sam)
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/review-request/", {"attendance_id": pending_request.id, "decision": "ACCEPTED"}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(len(self.client.get(f"/api/events/{self.event.id}/quests/").data), 1)
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/").data["quest_status"], "ACTIVE")

        self.client.force_authenticate(self.alex)
        proof = image_upload()
        self.assertEqual(self.client.post("/api/submissions/", {"quest": quest.id, "media": proof, "media_type": "IMAGE"}, format="multipart").status_code, 201)

        self.event.ends_at = timezone.now() - timedelta(minutes=1)
        self.event.save()
        self.client.force_authenticate(self.jordan)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/join/", {}, format="json").status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/quests/").data, [])
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/").data["quest_status"], "EXPIRED")
        self.client.force_authenticate(self.alex)
        late_proof = image_upload("late-proof.jpg")
        self.assertEqual(self.client.post("/api/submissions/", {"quest": quest.id, "media": late_proof, "media_type": "IMAGE"}, format="multipart").status_code, 400)

    def test_karma_is_available_only_after_an_event_and_only_for_attendees(self):
        self.event.starts_at = timezone.now() - timedelta(hours=3)
        self.event.ends_at = timezone.now() - timedelta(hours=1)
        self.event.save()
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        Attendance.objects.create(event=self.event, user=self.sam, status=Attendance.Status.ACCEPTED)
        self.client.force_authenticate(self.alex)
        response = self.client.post("/api/ratings/", {"event": self.event.id, "target_id": self.sam.id, "reaction": "LIKE", "note": "Thoughtful teammate."})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["reaction"], "LIKE")
        self.assertEqual(KarmaRating.objects.count(), 1)
        self.sam.profile.refresh_from_db()
        self.assertEqual(self.sam.profile.karma, 1)

        changed = self.client.post("/api/ratings/", {"event": self.event.id, "target_id": self.sam.id, "reaction": "DISLIKE"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(KarmaRating.objects.count(), 1)
        self.sam.profile.refresh_from_db()
        self.assertEqual(self.sam.profile.karma, -1)

        cleared = self.client.post("/api/ratings/", {"event": self.event.id, "target_id": self.sam.id, "reaction": "NONE"})
        self.assertEqual(cleared.status_code, 200)
        self.sam.profile.refresh_from_db()
        self.assertEqual(self.sam.profile.karma, 0)

        blocked_target = self.client.post("/api/ratings/", {"event": self.event.id, "target_id": self.jordan.id, "reaction": "LIKE"})
        self.assertEqual(blocked_target.status_code, 403)
        self.client.force_authenticate(self.jordan)
        blocked_rater = self.client.post("/api/ratings/", {"event": self.event.id, "target_id": self.sam.id, "reaction": "LIKE"})
        self.assertEqual(blocked_rater.status_code, 403)

    def test_event_end_notification_is_created_once_for_each_accepted_attendee(self):
        self.event.ends_at = timezone.now() - timedelta(minutes=1)
        self.event.save()
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        Attendance.objects.create(event=self.event, user=self.sam, status=Attendance.Status.PENDING)

        self.client.force_authenticate(self.alex)
        first = self.client.get("/api/notifications/")
        second = self.client.get("/api/notifications/")

        self.assertEqual(first.data["results"][0]["kind"], Notification.Kind.EVENT_ENDED)
        self.assertIn("has ended", first.data["results"][0]["text"])
        self.assertEqual(second.data["count"], 1)
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)

    def test_people_can_create_and_interact_with_community_posts(self):
        self.client.force_authenticate(self.alex)
        created = self.client.post("/api/posts/", {"kind": "POST", "body": "I finally said hello to someone new today!"}, format="json")
        self.assertEqual(created.status_code, 201)
        post = Post.objects.get()
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.post(f"/api/posts/{post.id}/like/").status_code, 201)
        self.assertEqual(self.client.post("/api/comments/", {"post": post.id, "body": "Love this energy."}, format="json").status_code, 201)
        detail = self.client.get(f"/api/posts/{post.id}/")
        self.assertEqual(detail.data["like_count"], 1)
        self.assertEqual(detail.data["comment_count"], 1)

    def test_reels_support_likes_and_full_comment_threads(self):
        reel = Post.objects.create(author=self.alex, kind=Post.Kind.REEL, body="A community reel")
        Post.objects.create(author=self.alex, kind=Post.Kind.POST, body="A regular post")
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.post(f"/api/posts/{reel.id}/like/").status_code, 201)
        self.client.post(f"/api/posts/{reel.id}/like/")
        comment = self.client.post("/api/comments/", {"post": reel.id, "body": "Great reel!"}, format="json")
        self.assertEqual(comment.status_code, 201)
        reply = self.client.post("/api/comments/", {"post": reel.id, "parent": comment.data["id"], "body": "My reply"}, format="json")
        self.assertEqual(reply.status_code, 201)
        feed = self.client.get("/api/posts/?kind=REEL").data["results"]
        self.assertEqual([post["id"] for post in feed], [reel.id])
        self.assertTrue(feed[0]["liked_by_me"])
        self.assertEqual(feed[0]["like_count"], 1)
        self.assertEqual(feed[0]["comment_count"], 2)
        self.assertEqual(self.client.get(f"/api/comments/?post={reel.id}").data["count"], 2)
        self.assertEqual(self.client.patch(f"/api/comments/{comment.data['id']}/", {"body": "Edited reel comment"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/posts/{reel.id}/like/").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/comments/{comment.data['id']}/").status_code, 204)
        detail = self.client.get(f"/api/posts/{reel.id}/").data
        self.assertFalse(detail["liked_by_me"])
        self.assertEqual(detail["like_count"], 0)
        self.assertEqual(detail["comment_count"], 0)

    def test_recommendations_prioritize_social_connections(self):
        Follow.objects.create(follower=self.alex, following=self.host)
        followed_post = Post.objects.create(author=self.host, body="A moment from someone Alex follows.")
        Post.objects.create(author=self.jordan, body="A similarly fresh community moment.")

        self.client.force_authenticate(self.alex)
        feed = self.client.get("/api/posts/for-you/?kind=POST")
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(feed.data[0]["id"], followed_post.id)
        self.assertEqual(feed.data[0]["recommendation_reason"], "From someone you follow")

        events = self.client.get("/api/events/recommended/")
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.data[0]["id"], self.event.id)
        self.assertIn("Hosted by someone you follow", events.data[0]["recommendation_reason"])

    def test_nearby_recommendations_prioritize_events_with_coordinates(self):
        self.event.latitude = 12.9716
        self.event.longitude = 77.5946
        self.event.save(update_fields=["latitude", "longitude"])
        farther_event = Event.objects.create(
            host=self.host,
            name="Far-away picnic",
            description="A relaxed afternoon outside.",
            location_name="Mysuru",
            latitude=12.2958,
            longitude=76.6394,
            starts_at=timezone.now() + timedelta(days=2),
            ends_at=timezone.now() + timedelta(days=2, hours=2),
        )

        self.client.force_authenticate(self.alex)
        events = self.client.get("/api/events/recommended/?latitude=12.9717&longitude=77.5945")

        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.data[0]["id"], self.event.id)
        self.assertIn("Very close to you", events.data[0]["recommendation_reason"])
        self.assertIn(farther_event.id, [event["id"] for event in events.data])

    def test_following_endpoint_returns_only_people_the_user_follows(self):
        Follow.objects.create(follower=self.alex, following=self.host)
        Follow.objects.create(follower=self.alex, following=self.sam)

        self.client.force_authenticate(self.alex)
        response = self.client.get("/api/people/following/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual({person["id"] for person in response.data}, {self.host.id, self.sam.id})

    def test_post_like_and_shared_link_rewards_are_unique(self):
        post = Post.objects.create(author=self.alex, body="A small win worth sharing.")
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.post(f"/api/posts/{post.id}/like/").status_code, 201)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 1)
        self.assertEqual(PostLikeReward.objects.count(), 1)

        self.assertEqual(self.client.delete(f"/api/posts/{post.id}/like/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/posts/{post.id}/like/").status_code, 201)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 1)

        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.post(f"/api/posts/{post.id}/like/").status_code, 201)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 1)
        self.assertEqual(PostLikeReward.objects.count(), 1)

        visitor = APIClient()
        first = visitor.get(f"/s/post/{post.id}/")
        self.assertEqual(first.status_code, 302)
        self.assertEqual(first["Location"], f"/?view=post&post={post.id}")
        second = visitor.get(f"/s/post/{post.id}/%20Come%20see%20this%20community%20moment%20on%20SocialQuest.")
        self.assertEqual(second.status_code, 302)
        self.assertEqual(PostShareClick.objects.count(), 1)
        self.alex.profile.refresh_from_db()
        self.assertEqual(self.alex.profile.total_xp, 6)

    def test_people_can_edit_or_delete_only_their_own_posts(self):
        self.client.force_authenticate(self.alex)
        created = self.client.post("/api/posts/", {"kind": "POST", "body": "A first draft"}, format="json")
        post_id = created.data["id"]
        updated = self.client.patch(f"/api/posts/{post_id}/", {"body": "A better draft"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["body"], "A better draft")

        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.patch(f"/api/posts/{post_id}/", {"body": "Not mine"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/posts/{post_id}/").status_code, 403)
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.delete(f"/api/posts/{post_id}/").status_code, 204)

    def test_deleting_a_post_and_replacing_an_avatar_removes_old_uploads(self):
        def image_upload(name, color):
            source = BytesIO()
            Image.new("RGB", (24, 24), color).save(source, format="JPEG")
            return SimpleUploadedFile(name, source.getvalue(), content_type="image/jpeg")

        self.client.force_authenticate(self.alex)
        created = self.client.post(
            "/api/posts/",
            {"kind": "POST", "body": "A moment with a photo", "media": image_upload("moment.jpg", "red")},
            format="multipart",
        )
        self.assertEqual(created.status_code, 201)
        post = Post.objects.get(pk=created.data["id"])
        post_media_name = post.media.name
        self.assertTrue(post.media.storage.exists(post_media_name))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f"/api/posts/{post.id}/").status_code, 204)
        self.assertFalse(post.media.storage.exists(post_media_name))

        first_avatar = self.client.patch(
            "/api/people/me/",
            {"avatar": image_upload("first-avatar.jpg", "blue")},
            format="multipart",
        )
        self.assertEqual(first_avatar.status_code, 200)
        self.alex.profile.refresh_from_db()
        old_avatar_name = self.alex.profile.avatar.name
        storage = self.alex.profile.avatar.storage
        self.assertTrue(storage.exists(old_avatar_name))

        with self.captureOnCommitCallbacks(execute=True):
            replacement = self.client.patch(
                "/api/people/me/",
                {"avatar": image_upload("replacement-avatar.jpg", "green")},
                format="multipart",
            )
        self.assertEqual(replacement.status_code, 200)
        self.alex.profile.refresh_from_db()
        self.assertNotEqual(self.alex.profile.avatar.name, old_avatar_name)
        self.assertFalse(storage.exists(old_avatar_name))
        self.assertTrue(self.alex.profile.avatar.storage.exists(self.alex.profile.avatar.name))

    def test_direct_messages_stay_inside_the_conversation(self):
        self.client.force_authenticate(self.alex)
        response = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json")
        self.assertEqual(response.status_code, 201)
        conversation_id = response.data["id"]
        response = self.client.post("/api/messages/", {"conversation": conversation_id, "body": "Want to join the walk on Sunday?"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Message.objects.count(), 1)
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.get(f"/api/messages/?conversation={conversation_id}").data["results"][0]["body"], "Want to join the walk on Sunday?")
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.get(f"/api/messages/?conversation={conversation_id}").data["count"], 0)

    def test_starting_a_direct_chat_again_reuses_the_original_conversation(self):
        self.client.force_authenticate(self.alex)
        first = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json")
        second = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(Conversation.objects.filter(is_group=False).count(), 1)

    def test_inbox_is_ordered_by_latest_message_activity(self):
        self.client.force_authenticate(self.alex)
        older = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json").data
        newer = self.client.post("/api/conversations/direct/", {"user_id": self.jordan.id}, format="json").data
        self.client.post("/api/messages/", {"conversation": older["id"], "body": "Newest activity"}, format="json")
        inbox = self.client.get("/api/conversations/").data["results"]
        self.assertEqual([item["id"] for item in inbox[:2]], [older["id"], newer["id"]])

    def test_direct_chat_cannot_target_the_current_user(self):
        self.client.force_authenticate(self.alex)
        response = self.client.post("/api/conversations/direct/", {"user_id": self.alex.id}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Conversation.objects.filter(is_group=False).count(), 0)

    def test_participants_can_edit_and_remove_chats_from_their_own_inboxes(self):
        self.client.force_authenticate(self.alex)
        conversation = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json").data

        renamed = self.client.patch(f"/api/conversations/{conversation['id']}/", {"title": "Sunday plans"}, format="json")
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.data["title"], "Sunday plans")

        self.assertEqual(self.client.delete(f"/api/conversations/{conversation['id']}/").status_code, 204)
        self.assertEqual(self.client.get("/api/conversations/").data["count"], 0)

        self.client.force_authenticate(self.sam)
        their_inbox = self.client.get("/api/conversations/").data
        self.assertEqual(their_inbox["count"], 1)
        self.assertEqual(their_inbox["results"][0]["title"], "Sunday plans")

    def test_message_editing_and_delete_scopes_preserve_the_right_history(self):
        self.client.force_authenticate(self.alex)
        conversation = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json").data
        created = self.client.post("/api/messages/", {"conversation": conversation["id"], "body": "See you there"}, format="json").data

        edited = self.client.patch(f"/api/messages/{created['id']}/", {"body": "See you at noon"}, format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["body"], "See you at noon")
        self.assertIsNotNone(edited.data["edited_at"])

        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.patch(f"/api/messages/{created['id']}/", {"body": "I changed your message"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/messages/{created['id']}/?scope=me").status_code, 204)
        self.assertEqual(self.client.get(f"/api/messages/?conversation={conversation['id']}").data["count"], 0)

        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.delete(f"/api/messages/{created['id']}/?scope=everyone").status_code, 204)
        self.client.force_authenticate(self.sam)
        visible = self.client.get(f"/api/messages/?conversation={conversation['id']}").data["results"]
        self.assertEqual(len(visible), 1)
        self.assertTrue(visible[0]["deleted_for_everyone"])
        self.assertEqual(visible[0]["body"], "")

    def test_comment_authors_can_edit_or_delete_their_comments(self):
        post = Post.objects.create(author=self.alex, body="A small win")
        self.client.force_authenticate(self.sam)
        comment = self.client.post("/api/comments/", {"post": post.id, "body": "Love this"}, format="json").data

        updated = self.client.patch(f"/api/comments/{comment['id']}/", {"body": "Love this energy"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["body"], "Love this energy")

        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.patch(f"/api/comments/{comment['id']}/", {"body": "Not mine"}, format="json").status_code, 403)
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.delete(f"/api/comments/{comment['id']}/").status_code, 204)
        self.assertFalse(Comment.objects.filter(id=comment["id"]).exists())

    def test_comment_replies_are_nested_and_alert_the_relevant_person(self):
        post = Post.objects.create(author=self.alex, body="A small win")
        self.client.force_authenticate(self.sam)
        root = self.client.post("/api/comments/", {"post": post.id, "body": "Love this"}, format="json")
        self.assertEqual(root.status_code, 201)
        self.assertIsNone(root.data["parent"])
        self.assertTrue(Notification.objects.filter(
            recipient=self.alex,
            actor=self.sam,
            comment_id=root.data["id"],
            kind=Notification.Kind.COMMENT_REPLY,
        ).exists())

        self.client.force_authenticate(self.jordan)
        reply = self.client.post("/api/comments/", {"post": post.id, "parent": root.data["id"], "body": "Me too"}, format="json")
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.data["parent"], root.data["id"])
        notification = Notification.objects.get(recipient=self.sam, comment_id=reply.data["id"])
        self.assertEqual(notification.kind, Notification.Kind.COMMENT_REPLY)
        self.assertEqual(notification.actor, self.jordan)

        self.client.force_authenticate(self.sam)
        alert = self.client.get("/api/notifications/").data["results"][0]
        self.assertEqual(alert["comment_post_id"], post.id)
        self.assertIn("replied to your comment", alert["text"])

        other_post = Post.objects.create(author=self.alex, body="Another moment")
        invalid = self.client.post("/api/comments/", {"post": other_post.id, "parent": root.data["id"], "body": "Wrong thread"}, format="json")
        self.assertEqual(invalid.status_code, 400)

    def test_rsvp_is_limited_to_two_upcoming_or_active_events(self):
        second_event = Event.objects.create(
            host=self.host, name="Board games", description="Bring a favourite game.", location_name="Bengaluru",
            starts_at=timezone.now() + timedelta(days=2), ends_at=timezone.now() + timedelta(days=2, hours=2),
        )
        third_event = Event.objects.create(
            host=self.host, name="Morning walk", description="A gentle walk together.", location_name="Bengaluru",
            starts_at=timezone.now() + timedelta(days=3), ends_at=timezone.now() + timedelta(days=3, hours=2),
        )
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/join/", {}, format="json").status_code, 201)
        self.assertEqual(self.client.post(f"/api/events/{second_event.id}/join/", {}, format="json").status_code, 201)
        blocked = self.client.post(f"/api/events/{third_event.id}/join/", {}, format="json")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("at most 2", blocked.data["detail"])

    def test_rsvp_decisions_notify_but_chat_messages_stay_out_of_notifications(self):
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/join/", {}, format="json").status_code, 201)
        self.client.force_authenticate(self.host)
        host_notifications = self.client.get("/api/notifications/")
        self.assertEqual(host_notifications.data["results"][0]["kind"], Notification.Kind.RSVP)
        attendance = Attendance.objects.get(event=self.event, user=self.alex)
        self.assertEqual(self.client.post(f"/api/events/{self.event.id}/review-request/", {"attendance_id": attendance.id, "decision": "ACCEPTED"}, format="json").status_code, 200)

        self.client.force_authenticate(self.alex)
        member_notifications = self.client.get("/api/notifications/")
        self.assertEqual(member_notifications.data["results"][0]["kind"], Notification.Kind.RSVP_ACCEPTED)
        conversation = self.client.post("/api/conversations/direct/", {"user_id": self.sam.id}, format="json").data
        self.assertEqual(self.client.post("/api/messages/", {"conversation": conversation["id"], "body": "Hello Sam"}, format="json").status_code, 201)
        self.client.force_authenticate(self.sam)
        self.assertFalse(Notification.objects.filter(recipient=self.sam, kind=Notification.Kind.MESSAGE).exists())
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)

    def test_event_detail_exposes_accepted_people_but_keeps_pending_requests_host_only(self):
        accepted = Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        pending = Attendance.objects.create(event=self.event, user=self.sam, status=Attendance.Status.PENDING)
        self.client.force_authenticate(None)
        attendees = self.client.get(f"/api/events/{self.event.id}/attendees/")
        self.assertEqual(attendees.status_code, 200)
        self.assertEqual([row["id"] for row in attendees.data], [accepted.id])
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.get(f"/api/events/{self.event.id}/requests/").status_code, 403)
        self.client.force_authenticate(self.host)
        requests = self.client.get(f"/api/events/{self.event.id}/requests/")
        self.assertEqual(requests.status_code, 200)
        self.assertIn(pending.id, [row["id"] for row in requests.data])

    def test_logout_revokes_only_the_current_client_session(self):
        token = AuthSession.objects.create(user=self.alex)
        other_token = AuthSession.objects.create(user=self.alex)
        device = NotificationDevice.objects.create(user=self.alex, transport="LOCAL", address={})
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(AuthSession.objects.filter(key=token.key).exists())
        self.assertTrue(AuthSession.objects.filter(key=other_token.key).exists())
        device.refresh_from_db()
        self.assertTrue(device.enabled)
        self.assertEqual(self.client.get("/api/people/me/").status_code, 401)

        other_client = APIClient()
        other_client.credentials(HTTP_AUTHORIZATION=f"Token {other_token.key}")
        self.assertEqual(other_client.get("/api/people/me/").status_code, 200)

    def test_search_finds_events_and_people(self):
        self.host.profile.display_name = "Riya Kapoor"
        self.host.profile.city = "Bengaluru"
        self.host.profile.save()
        self.alex.profile.display_name = "Alex Rivera"
        self.alex.profile.save()

        self.client.force_authenticate(None)
        event_results = self.client.get("/api/events/?q=riya").data["results"]
        people_results = self.client.get("/api/people/?q=alex").data["results"]
        self.assertEqual([event["id"] for event in event_results], [self.event.id])
        self.assertEqual([person["id"] for person in people_results], [self.alex.id])

    def test_event_list_can_filter_hosted_and_participated_events(self):
        other_event = Event.objects.create(
            host=self.sam,
            name="City sketching",
            description="Draw what you notice together.",
            location_name="Bengaluru",
            starts_at=timezone.now() + timedelta(days=2),
            ends_at=timezone.now() + timedelta(days=2, hours=2),
        )
        Attendance.objects.create(event=self.event, user=self.alex, status=Attendance.Status.ACCEPTED)
        Attendance.objects.create(event=other_event, user=self.alex, status=Attendance.Status.PENDING)

        self.client.force_authenticate(None)
        hosted = self.client.get(f"/api/events/?host={self.host.id}").data["results"]
        participated = self.client.get(f"/api/events/?participant={self.alex.id}").data["results"]

        self.assertEqual([event["id"] for event in hosted], [self.event.id])
        self.assertEqual([event["id"] for event in participated], [self.event.id])

    def test_explore_hides_finished_events_but_profile_history_keeps_them(self):
        finished_event = Event.objects.create(
            host=self.host,
            name="Last week's walk",
            description="A completed community walk.",
            location_name="Bengaluru",
            starts_at=timezone.now() - timedelta(days=2),
            ends_at=timezone.now() - timedelta(days=2, hours=-2),
        )

        self.client.force_authenticate(None)
        explore = self.client.get("/api/events/").data["results"]
        hosted = self.client.get(f"/api/events/?host={self.host.id}").data["results"]
        detail = self.client.get(f"/api/events/{finished_event.id}/")

        self.assertNotIn(finished_event.id, [event["id"] for event in explore])
        self.assertIn(finished_event.id, [event["id"] for event in hosted])
        self.assertEqual(detail.status_code, 200)

    def test_server_compresses_and_resizes_uploaded_still_images(self):
        image = Image.effect_noise((2200, 1200), 100).convert("RGB")
        source = BytesIO()
        image.save(source, format="JPEG", quality=100)
        upload = SimpleUploadedFile("large-photo.jpg", source.getvalue(), content_type="image/jpeg")

        compressed = compress_image_upload(upload)
        self.assertLess(compressed.size, upload.size)
        with Image.open(compressed) as result:
            self.assertLessEqual(max(result.size), MAX_IMAGE_DIMENSION)


class AuditRegressionTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user('audit-host')
        self.guest = User.objects.create_user('audit-guest')
        self.other = User.objects.create_user('audit-other')
        self.client = APIClient()
        self.client.force_authenticate(self.host)
        self.event = Event.objects.create(host=self.host, name='Audit walk', description='Meet nearby.', location_name='Park', starts_at=timezone.now()-timedelta(hours=1), ends_at=timezone.now()+timedelta(hours=1), capacity=2)

    def test_profile_updates_validate_length_and_image(self):
        self.assertEqual(self.client.patch('/api/people/me/', {'display_name': 'x'*81}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/people/me/', {'avatar': SimpleUploadedFile('bad.txt', b'not an image', content_type='text/plain')}, format='multipart').status_code, 400)
        self.host.profile.refresh_from_db()
        self.assertEqual(self.host.profile.display_name, 'audit-host')
        self.assertEqual(self.client.patch('/api/people/me/', {'city': 'Bengaluru'}, format='json').status_code, 200)

    def test_partial_event_updates_validate_both_dates_and_capacity(self):
        url = f'/api/events/{self.event.id}/'
        self.assertEqual(self.client.patch(url, {'ends_at': (self.event.starts_at-timedelta(hours=1)).isoformat()}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'starts_at': (self.event.ends_at+timedelta(hours=1)).isoformat()}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'capacity': 0}, format='json').status_code, 400)

    def test_proof_is_auto_approved_and_xp_is_awarded_immediately(self):
        # Submissions are auto-approved on create — no host review endpoint.
        self.event.starts_at = timezone.now() - timedelta(hours=1)
        self.event.ends_at = timezone.now() + timedelta(hours=1)
        self.event.save()
        quest = Quest.objects.create(event=self.event, kind='MAIN', title='Meet', instructions='Say hello', xp_reward=120)
        Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        self.client.force_authenticate(self.guest)
        proof_file = image_upload()
        response = self.client.post('/api/submissions/', {'quest': quest.id, 'media_type': 'IMAGE', 'media': proof_file}, format='multipart')
        self.assertEqual(response.status_code, 201)
        submission = QuestSubmission.objects.get()
        self.assertEqual(submission.status, QuestSubmission.Status.APPROVED)
        self.guest.profile.refresh_from_db()
        self.assertEqual(self.guest.profile.total_xp, 120)
        # The review endpoint no longer exists.
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.post(f'/api/submissions/{submission.id}/review/', {'decision': 'APPROVED'}, format='json').status_code, 404)
        # The event-level submissions list endpoint no longer exists.
        self.assertEqual(self.client.get(f'/api/events/{self.event.id}/submissions/').status_code, 404)

    def test_duplicate_proof_returns_validation_error(self):
        quest = Quest.objects.create(event=self.event, kind='MAIN', title='Meet', instructions='Say hello')
        Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        QuestSubmission.objects.create(quest=quest, participant=self.guest, media='quest_proofs/example.jpg', media_type='IMAGE')
        self.client.force_authenticate(self.guest)
        response = self.client.post('/api/submissions/', {'quest':quest.id, 'media_type':'IMAGE', 'media':image_upload()}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(QuestSubmission.objects.count(), 1)

    def test_unread_count_includes_every_page_and_empty_ids_mark_nothing(self):
        Notification.objects.bulk_create([Notification(recipient=self.host, kind='COMMENT_REPLY') for _ in range(26)])
        self.assertEqual(self.client.get('/api/notifications/unread-count/').data['count'], 26)
        self.assertEqual(self.client.post('/api/notifications/mark-read/', {'ids':[]}, format='json').data['marked_read'], 0)
        self.assertEqual(self.client.post('/api/notifications/mark-read/', {'ids':'bad'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/notifications/mark-read/', {}, format='json').data['marked_read'], 26)

    def test_repeated_rsvp_review_is_idempotent_at_capacity(self):
        first = Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        Attendance.objects.create(event=self.event, user=self.other, status='ACCEPTED')
        url = f'/api/events/{self.event.id}/review-request/'
        payload = {'attendance_id':first.id, 'decision':'ACCEPTED'}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 200)
        for decision in ['DENIED','ACCEPTED','DENIED','ACCEPTED']:
            self.assertEqual(self.client.post(url, {**payload,'decision':decision}, format='json').status_code, 200)

    def test_reel_rejects_image_and_post_rejects_non_media(self):
        self.assertEqual(self.client.post('/api/posts/', {'kind':'REEL','media':image_upload('photo.jpg')}, format='multipart').status_code, 400)
        self.assertEqual(self.client.post('/api/posts/', {'body':'Text','media':SimpleUploadedFile('test.html', b'<script></script>', content_type='text/html')}, format='multipart').status_code, 400)

    def test_uploads_reject_corrupt_content_and_oversized_files(self):
        corrupt = SimpleUploadedFile('fake.jpg', b'not really an image', content_type='image/jpeg')
        self.assertEqual(self.client.post('/api/posts/', {'body':'Fake', 'media':corrupt}, format='multipart').status_code, 400)
        oversized = image_upload('large.jpg')
        oversized.size = MAX_IMAGE_BYTES + 1
        serializer = PostSerializer(data={'body':'Large', 'media':oversized})
        self.assertFalse(serializer.is_valid())
        self.assertIn('10 MB', str(serializer.errors))

    def test_generated_quests_have_bounded_fields_and_distinct_fallbacks(self):
        from .ai import _fallback_main_quest, _fallback_side_quests, _validated_quests
        self.event.name = 'x'*120
        self.assertLessEqual(len(_fallback_main_quest(self.event)[0]['title']), 120)
        for number in range(1, 30):
            quests = _fallback_side_quests(number)
            self.assertNotEqual(quests[0]['instructions'], quests[1]['instructions'])
        with self.assertRaises(ValueError):
            _validated_quests([{'kind':'MAIN','title':'Test','instructions':'Test','xp_reward':-1}], 'MAIN', 1, 100, 150)

    def test_private_event_content_is_limited_to_host_and_accepted_guests(self):
        self.event.privacy = Event.Privacy.PRIVATE
        self.event.save()
        post = Post.objects.create(event=self.event, author=self.host, body='Private event moment')
        Comment.objects.create(post=post, author=self.host, body='Private reply')
        Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        for user in [None, self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(f'/api/events/{self.event.id}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/comments/?post={post.id}').data['count'], 0)
        self.assertEqual(self.client.post('/api/comments/', {'post':post.id, 'body':'Uninvited'}, format='json').status_code, 404)
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.client.get(f'/api/events/{self.event.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/comments/?post={post.id}').data['count'], 1)

    def test_private_event_invitation_can_be_accepted(self):
        self.event.privacy = Event.Privacy.PRIVATE
        self.event.save()
        self.client.force_authenticate(self.host)
        invited = self.client.post(f'/api/events/{self.event.id}/invite/', {'user_id': self.guest.id}, format='json')
        self.assertEqual(invited.status_code, 201)
        self.assertEqual(invited.data['status'], Attendance.Status.INVITED)
        invitation_id = invited.data['id']
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/review-request/', {'attendance_id': invitation_id, 'decision': 'ACCEPTED'}, format='json').status_code, 400)
        self.client.force_authenticate(self.guest)
        recommended = self.client.get('/api/events/recommended/').data
        self.assertEqual(recommended[0]['id'], self.event.id)
        self.assertEqual(recommended[0]['recommendation_reason'], 'You were invited')
        self.assertEqual(self.client.get(f'/api/events/{self.event.id}/').status_code, 200)
        accepted = self.client.post(f'/api/events/{self.event.id}/join/', {}, format='json')
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(accepted.data['status'], Attendance.Status.ACCEPTED)

    def test_denied_guest_can_request_to_join_again_and_cancel(self):
        attendance = Attendance.objects.create(event=self.event, user=self.guest, status=Attendance.Status.DENIED)
        self.client.force_authenticate(self.guest)
        retried = self.client.post(f'/api/events/{self.event.id}/join/', {}, format='json')
        self.assertEqual(retried.status_code, 201)
        self.assertEqual(retried.data['status'], Attendance.Status.PENDING)
        cancelled = self.client.post(f'/api/events/{self.event.id}/cancel-rsvp/', {}, format='json')
        self.assertEqual(cancelled.status_code, 200)
        attendance.refresh_from_db()
        self.assertEqual(attendance.status, Attendance.Status.CANCELLED)

    def test_deleted_private_event_never_publishes_its_moments(self):
        self.event.privacy = Event.Privacy.PRIVATE
        self.event.save()
        post = Post.objects.create(event=self.event, author=self.host, body='Private forever')
        self.event.delete()
        post.refresh_from_db()
        self.assertTrue(post.restricted_to_event)
        self.assertIsNone(post.event_id)
        for viewer in (None, self.guest):
            self.client.force_authenticate(viewer)
            self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 404)
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 200)

    def test_non_numeric_query_params_do_not_crash_endpoints(self):
        self.client.force_authenticate(self.guest)
        # Ratings
        response = self.client.get("/api/ratings/?event=not-a-number")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

        # Messages
        response = self.client.get("/api/messages/?conversation=abc")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

        # Comments
        response = self.client.get("/api/comments/?post=xyz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

        # Events
        response = self.client.get("/api/events/?host=bad&participant=invalid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

        # Posts
        response = self.client.get("/api/posts/?author=none&event=invalid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_invalid_body_ids_return_bad_request_instead_of_crashing(self):
        self.client.force_authenticate(self.guest)
        response = self.client.post("/api/conversations/direct/", {"user_id": "not_an_int"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("user_id must be a valid integer", response.data["detail"])

        self.client.force_authenticate(self.host)
        response = self.client.post(
            f"/api/events/{self.event.id}/review-request/",
            {"attendance_id": "invalid", "decision": "ACCEPTED"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("attendance_id must be a valid integer", response.data["detail"])

    def test_chat_notifications_are_not_exposed_in_the_alerts_feed(self):
        chat = Conversation.objects.create(is_group=False)
        chat.participants.add(self.guest, self.other)
        msg = Message.objects.create(conversation=chat, sender=self.guest, body="", deleted_for_everyone=True)
        notif = Notification.objects.create(recipient=self.other, actor=self.guest, conversation=chat, message=msg, kind=Notification.Kind.MESSAGE)
        self.client.force_authenticate(self.other)
        res = self.client.get("/api/notifications/")
        self.assertEqual(res.status_code, 200)
        items = res.data["results"] if "results" in res.data else res.data
        self.assertFalse(any(item["id"] == notif.id for item in items))

    def test_quest_regeneration_blocked_when_submissions_exist(self):
        self.client.force_authenticate(self.host)
        quest = Quest.objects.create(event=self.event, kind=Quest.Kind.MAIN, title="Existing quest", instructions="Do something.", xp_reward=50)
        image_bytes = BytesIO()
        Image.new("RGB", (100, 100), color="blue").save(image_bytes, format="JPEG")
        image_bytes.seek(0)
        proof = SimpleUploadedFile("proof.jpg", image_bytes.read(), content_type="image/jpeg")
        QuestSubmission.objects.create(quest=quest, participant=self.guest, caption="Done", media=proof, media_type="IMAGE")

        response = self.client.post(f"/api/events/{self.event.id}/generate-quests/", {"replace": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Cannot regenerate quests after submissions have been made", response.data["detail"])
        self.assertTrue(Quest.objects.filter(id=quest.id).exists())

    def test_rsvp_note_truncation_and_cancel_flow(self):
        self.client.force_authenticate(self.other)
        long_note = "A" * 500
        response = self.client.post(f"/api/events/{self.event.id}/join/", {"note": long_note}, format="json")
        self.assertEqual(response.status_code, 201)
        attendance = Attendance.objects.get(event=self.event, user=self.other)
        self.assertEqual(len(attendance.note), 240)
        self.assertEqual(attendance.status, Attendance.Status.PENDING)

        # Cancel RSVP
        cancel_res = self.client.post(f"/api/events/{self.event.id}/cancel-rsvp/")
        self.assertEqual(cancel_res.status_code, 200)
        attendance.refresh_from_db()
        self.assertEqual(attendance.status, Attendance.Status.CANCELLED)

        # Cancelling again fails
        second_cancel = self.client.post(f"/api/events/{self.event.id}/cancel-rsvp/")
        self.assertEqual(second_cancel.status_code, 400)

        # Re-joining succeeds and resets status to PENDING
        rejoin_res = self.client.post(f"/api/events/{self.event.id}/join/", {"note": "Second attempt"}, format="json")
        self.assertEqual(rejoin_res.status_code, 201)
        attendance.refresh_from_db()
        self.assertEqual(attendance.status, Attendance.Status.PENDING)
        self.assertEqual(attendance.note, "Second attempt")

    def test_unread_notification_count_does_not_bulk_create_on_poll(self):
        self.client.force_authenticate(self.guest)
        with patch("core.views.Notification.objects.bulk_create") as mock_bulk:
            res = self.client.get("/api/notifications/unread-count/")
            self.assertEqual(res.status_code, 200)
            mock_bulk.assert_not_called()


class PeopleAndPresenceTests(TestCase):
    def setUp(self):
        self.alex = User.objects.create_user('alex', password='test-password')
        self.sam = User.objects.create_user('sam', password='test-password')
        self.jordan = User.objects.create_user('jordan', password='test-password')
        self.client = APIClient()
        self.client.force_authenticate(self.alex)
        self.chat = Conversation.objects.create(direct_key=f'direct:{self.alex.id}:{self.sam.id}')
        self.chat.participants.add(self.alex, self.sam)

    def sam_is_online(self):
        response = self.client.get(f'/api/conversations/{self.chat.id}/')
        self.assertEqual(response.status_code, 200)
        return next(person['is_online'] for person in response.data['participants'] if person['id'] == self.sam.id)

    def test_relationship_lists_have_correct_direction_and_follow_state(self):
        Follow.objects.create(follower=self.sam, following=self.alex)
        Follow.objects.create(follower=self.alex, following=self.jordan)
        followers = self.client.get(f'/api/people/{self.alex.id}/followers/').data['results']
        following = self.client.get(f'/api/people/{self.alex.id}/following/').data['results']
        self.assertEqual([person['id'] for person in followers], [self.sam.id])
        self.assertEqual([person['id'] for person in following], [self.jordan.id])
        self.assertFalse(followers[0]['is_followed_by_me'])
        self.assertTrue(following[0]['is_followed_by_me'])
        self.assertEqual(self.client.get(f'/api/people/{self.jordan.id}/following/').data['results'], [])
        self.client.delete(f'/api/people/{self.jordan.id}/follow/')
        self.assertEqual(self.client.get(f'/api/people/{self.alex.id}/following/').data['count'], 0)
        self.assertEqual(self.client.get('/api/people/me/').data['following_count'], 0)

    def test_relationship_search_filters_members_not_profile_owner_and_paginates(self):
        for index in range(23):
            follower = User.objects.create_user(f'member{index:02}')
            Follow.objects.create(follower=follower, following=self.alex)
        response = self.client.get(f'/api/people/{self.alex.id}/followers/')
        self.assertEqual(response.data['count'], 23)
        self.assertEqual(len(response.data['results']), 20)
        self.assertIsNotNone(response.data['next'])
        self.assertEqual(len(self.client.get(response.data['next']).data['results']), 3)
        response = self.client.get(f'/api/people/{self.alex.id}/followers/?q=member22')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([person['username'] for person in response.data['results']], ['member22'])
        self.assertEqual(self.client.get('/api/people/999999/followers/').status_code, 404)
        self.assertEqual(self.client.get('/api/people/invalid/followers/').status_code, 404)

    def test_search_and_counts_exclude_inactive_people(self):
        self.sam.profile.display_name = 'Sunny Sam'
        self.sam.profile.save()
        self.jordan.is_active = False
        self.jordan.save()
        Follow.objects.create(follower=self.alex, following=self.jordan)
        response = self.client.get('/api/people/?q=SUNNY')
        self.assertEqual([person['id'] for person in response.data['results']], [self.sam.id])
        self.assertEqual(self.client.get('/api/people/?q=@sam').data['results'][0]['id'], self.sam.id)
        self.assertEqual(self.client.get('/api/people/?q=jordan').data['count'], 0)
        self.assertEqual(self.client.get('/api/people/me/').data['following_count'], 0)

    def test_presence_requires_authentication_and_valid_session(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.put('/api/people/presence/', {'session_id': str(uuid4())}, format='json').status_code, 401)
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.put('/api/people/presence/', {'session_id': 'invalid'}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/people/presence/', {}, format='json').status_code, 400)
        self.assertFalse(UserPresence.objects.exists())

    def test_presence_expires_without_heartbeat_and_public_profiles_do_not_expose_it(self):
        now = timezone.now()
        self.assertFalse(self.sam_is_online())
        UserPresence.objects.create(user=self.sam, session_id=uuid4(), last_seen=now)
        self.assertTrue(self.sam_is_online())
        with patch('core.querysets.timezone.now', return_value=now + UserPresence.TIMEOUT):
            self.assertFalse(self.sam_is_online())
        self.assertNotIn('is_online', self.client.get(f'/api/people/{self.sam.id}/').data)
        self.client.force_authenticate(self.jordan)
        self.assertEqual(self.client.get(f'/api/conversations/{self.chat.id}/').status_code, 404)

    def test_presence_heartbeat_is_idempotent_and_devices_are_independent(self):
        first, second = str(uuid4()), str(uuid4())
        self.client.force_authenticate(self.sam)
        for session_id in [first, first, second]:
            response = self.client.put('/api/people/presence/', {'session_id': session_id}, format='json')
            self.assertEqual(response.status_code, 204)
        self.assertEqual(UserPresence.objects.filter(user=self.sam).count(), 2)
        self.client.delete('/api/people/presence/', {'session_id': first}, format='json')
        self.client.force_authenticate(self.alex)
        self.assertTrue(self.sam_is_online())
        self.client.delete('/api/people/presence/', {'session_id': second}, format='json')
        self.assertTrue(self.sam_is_online(), 'Another user must not clear Sam’s session')
        self.client.force_authenticate(self.sam)
        self.client.delete('/api/people/presence/', {'session_id': second}, format='json')
        self.client.force_authenticate(self.alex)
        self.assertFalse(self.sam_is_online())

    def test_logout_does_not_clear_another_clients_presence(self):
        first, second = uuid4(), uuid4()
        UserPresence.objects.create(user=self.alex, session_id=first)
        UserPresence.objects.create(user=self.alex, session_id=second)
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 204)
        self.assertEqual(UserPresence.objects.filter(user=self.alex).count(), 2)
        self.client.delete('/api/people/presence/', {'session_id': first}, format='json')
        self.assertEqual(UserPresence.objects.filter(user=self.alex).count(), 1)
        self.client.get('/api/notifications/')
        self.client.get('/api/people/me/')
        self.assertTrue(UserPresence.objects.filter(user=self.alex, session_id=second).exists())


class NotificationDeliveryTests(TestCase):
    def setUp(self):
        from .models import NotificationDevice
        self.sender = User.objects.create_user('notice_sender')
        self.recipient = User.objects.create_user('notice_recipient')
        self.client = APIClient()
        self.client.force_authenticate(self.recipient)
        self.chat = Conversation.objects.create(direct_key=f'direct:{self.sender.id}:{self.recipient.id}')
        self.chat.participants.add(self.sender, self.recipient)
        self.device = NotificationDevice.objects.create(user=self.recipient, transport='LOCAL')

    def send_message(self):
        self.client.force_authenticate(self.sender)
        response = self.client.post('/api/messages/', {'conversation': self.chat.id, 'body': 'Hello from a test'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.client.force_authenticate(self.recipient)
        return response.data

    def poll(self):
        response = self.client.post('/api/notifications/poll-delivery/', {'id': str(self.device.id)}, format='json')
        self.assertEqual(response.status_code, 200)
        return response.data['deliveries']

    def test_new_message_delivers_once_without_adding_to_alerts_feed(self):
        self.send_message()
        deliveries = self.poll()
        self.assertEqual(len(deliveries), 1)
        self.assertEqual(deliveries[0]['kind'], 'MESSAGE')
        self.assertEqual(deliveries[0]['conversation_id'], self.chat.id)
        self.assertEqual(self.poll(), [])
        self.assertEqual(self.client.get('/api/notifications/').data['count'], 0)

    def test_open_chats_suppresses_any_conversation_and_does_not_replay_later(self):
        session = str(uuid4())
        self.client.put('/api/people/presence/', {'session_id': session, 'chats_open': True}, format='json')
        self.send_message()
        self.assertEqual(self.poll(), [])
        self.client.put('/api/people/presence/', {'session_id': session, 'chats_open': False}, format='json')
        self.assertEqual(self.poll(), [])
        self.send_message()
        self.assertEqual(len(self.poll()), 1)

    def test_opening_chats_after_enqueue_suppresses_pending_notifications(self):
        self.send_message()
        self.client.put('/api/people/presence/', {'session_id': str(uuid4()), 'chats_open': True}, format='json')
        self.assertEqual(self.poll(), [])
        UserPresence.objects.filter(user=self.recipient).delete()
        self.assertEqual(self.poll(), [])

    def test_background_or_expired_chat_session_does_not_suppress(self):
        session = uuid4()
        UserPresence.objects.create(user=self.recipient, session_id=session, chats_open=True, last_seen=timezone.now() - timedelta(seconds=61))
        self.send_message()
        self.assertEqual(len(self.poll()), 1)
        self.client.put('/api/people/presence/', {'session_id': str(session), 'chats_open': True}, format='json')
        self.client.delete('/api/people/presence/', {'session_id': str(session)}, format='json')
        self.send_message()
        self.assertEqual(len(self.poll()), 1)

    def test_other_activity_still_delivers_while_chats_are_open(self):
        UserPresence.objects.create(user=self.recipient, session_id=uuid4(), chats_open=True)
        Notification.objects.create(recipient=self.recipient, actor=self.sender, kind=Notification.Kind.RSVP)
        self.assertEqual(self.poll()[0]['kind'], 'RSVP')

    def test_device_endpoints_require_ownership_and_never_expose_tokens(self):
        self.client.force_authenticate(self.sender)
        self.assertEqual(self.client.post('/api/notifications/poll-delivery/', {'id':str(self.device.id)}, format='json').status_code, 404)
        self.assertEqual(self.client.put('/api/notifications/device/', {'id':str(self.device.id),'transport':'LOCAL'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete('/api/notifications/device/', {'id':str(self.device.id)}, format='json').status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/notifications/delivery-config/').status_code, 401)
        self.client.force_authenticate(self.recipient)
        self.assertNotIn('address', self.client.get('/api/notifications/device/?id=' + str(self.device.id)).data)

    def test_device_registration_rejects_internal_push_urls_and_bad_tokens(self):
        for address in [{'endpoint':'http://127.0.0.1:8000/api/'}, {'endpoint':'https://127.0.0.1/api/'}, {'endpoint':'https://example.com/push'}]:
            self.assertEqual(self.client.put('/api/notifications/device/', {'id':str(uuid4()),'transport':'WEB','address':address}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/notifications/device/', {'id':str(uuid4()),'transport':'EXPO','address':{'token':'invalid'}}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/notifications/device/', {'id':'bad','transport':'LOCAL'}, format='json').status_code, 400)

    def test_revoking_one_device_stops_it_without_logout_disabling_others(self):
        self.send_message()
        self.client.delete('/api/notifications/device/', {'id':str(self.device.id)}, format='json')
        self.assertEqual(self.client.post('/api/notifications/poll-delivery/', {'id':str(self.device.id)}, format='json').status_code, 404)
        self.device.refresh_from_db(); self.assertFalse(self.device.enabled)
        self.client.put('/api/notifications/device/', {'id':str(self.device.id),'transport':'LOCAL'}, format='json')
        self.assertEqual(self.poll(), [])
        self.client.post('/api/auth/logout/')
        self.device.refresh_from_db(); self.assertTrue(self.device.enabled)

    @patch('core.notification_delivery.expo_request')
    def test_expo_ticket_is_checked_and_duplicate_worker_does_not_resend(self, push):
        from .models import NotificationDelivery
        from .notification_delivery import send_delivery, check_receipts
        self.device.transport = 'EXPO'; self.device.address = {'token':'ExpoPushToken[test-token-123]'}; self.device.save()
        self.send_message(); delivery = NotificationDelivery.objects.get(device=self.device)
        push.return_value = {'data':{'status':'ok','id':'ticket-123'}}
        send_delivery(delivery); send_delivery(delivery)
        self.assertEqual(push.call_count, 1)
        delivery.refresh_from_db(); self.assertEqual(delivery.status, 'ACCEPTED')
        delivery.available_at = timezone.now() - timedelta(seconds=1); delivery.save()
        push.return_value = {'data':{'ticket-123':{'status':'error','details':{'error':'DeviceNotRegistered'}}}}
        check_receipts()
        self.device.refresh_from_db(); self.assertFalse(self.device.enabled)
        delivery.refresh_from_db(); self.assertEqual(delivery.status, 'FAILED')

    @patch('core.notification_delivery.expo_request', side_effect=TimeoutError)
    def test_transient_push_failures_are_queued_for_retry(self, push):
        from .models import NotificationDelivery
        from .notification_delivery import send_delivery
        self.device.transport = 'EXPO'; self.device.address = {'token':'ExpoPushToken[test-token-123]'}; self.device.save()
        self.send_message(); delivery = NotificationDelivery.objects.get(device=self.device)
        send_delivery(delivery); delivery.refresh_from_db()
        self.assertEqual(delivery.status, 'PENDING'); self.assertEqual(delivery.attempts, 1)
        self.assertGreater(delivery.available_at, timezone.now())

    @patch('core.notification_delivery.expo_request')
    def test_dispatch_rechecks_chat_presence_and_deleted_messages(self, push):
        from .models import NotificationDelivery
        from .notification_delivery import send_delivery
        self.device.transport = 'EXPO'; self.device.address = {'token':'ExpoPushToken[test-token-123]'}; self.device.save()
        self.send_message(); delivery = NotificationDelivery.objects.get(device=self.device)
        UserPresence.objects.create(user=self.recipient, session_id=uuid4(), chats_open=True)
        send_delivery(delivery); self.assertFalse(push.called)
        UserPresence.objects.filter(user=self.recipient).delete()
        message = self.send_message()
        Message.objects.filter(pk=message['id']).update(deleted_for_everyone=True, body='')
        send_delivery(NotificationDelivery.objects.get(message_id=message['id']))
        self.assertFalse(push.called)

    @patch('pywebpush.webpush')
    def test_web_push_uses_encrypted_subscription_and_notification_target(self, push):
        from .models import NotificationDelivery
        from .notification_delivery import send_delivery
        self.device.transport = 'WEB'; self.device.address = {'endpoint':'https://fcm.googleapis.com/fcm/send/test'}; self.device.save()
        self.send_message(); delivery = NotificationDelivery.objects.get(device=self.device)
        send_delivery(delivery)
        payload = __import__('json').loads(push.call_args.kwargs['data'])
        self.assertEqual(payload['conversation_id'], self.chat.id)
        self.assertEqual(payload['recipient_id'], self.recipient.id)
        self.assertEqual(push.call_args.kwargs['ttl'], 300)


class EventGroupChatTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user('chat-host')
        self.guest = User.objects.create_user('chat-guest')
        self.other = User.objects.create_user('chat-other')
        self.event = Event.objects.create(host=self.host, name='Coffee walk', description='Meet friends', location_name='Park', starts_at=timezone.now() + timedelta(hours=1), ends_at=timezone.now() + timedelta(hours=3))
        self.client = APIClient()
        self.client.force_authenticate(self.host)

    def test_one_chat_includes_host_and_only_accepted_people(self):
        chat = self.event.conversation
        self.assertTrue(chat.is_group)
        self.assertEqual(set(chat.participants.all()), {self.host})
        attendance = Attendance.objects.create(event=self.event, user=self.guest)
        Attendance.objects.create(event=self.event, user=self.other, status='INVITED')
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/chat/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/conversations/{chat.id}/').status_code, 404)
        self.client.force_authenticate(self.host)
        for _ in range(2):
            response = self.client.post(f'/api/events/{self.event.id}/review-request/', {'attendance_id': attendance.id, 'decision': 'ACCEPTED'}, format='json')
            self.assertEqual(response.status_code, 200)
        self.assertEqual(Conversation.objects.filter(event=self.event).count(), 1)
        self.assertEqual(set(chat.participants.all()), {self.host, self.guest})
        self.client.force_authenticate(self.guest)
        opened = self.client.post(f'/api/events/{self.event.id}/chat/')
        self.assertEqual(opened.data['id'], chat.id)
        self.assertEqual(opened.data['event_name'], self.event.name)
        self.assertEqual(opened.data['event'], self.event.id)
        self.assertTrue(opened.data['is_group'])
        self.assertEqual(self.client.post('/api/messages/', {'conversation': chat.id, 'body': 'Hello everyone'}, format='json').status_code, 201)
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.get(f'/api/messages/?conversation={chat.id}').data['count'], 1)

    def test_cancel_and_rejection_revoke_message_and_chat_access(self):
        attendance = Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        chat = self.event.conversation
        message = Message.objects.create(conversation=chat, sender=self.host, body='Private event plans')
        for decision in ['CANCELLED', 'DENIED']:
            attendance.status = 'ACCEPTED'; attendance.save()
            self.client.force_authenticate(self.guest)
            if decision == 'CANCELLED':
                response = self.client.post(f'/api/events/{self.event.id}/cancel-rsvp/')
            else:
                self.client.force_authenticate(self.host)
                response = self.client.post(f'/api/events/{self.event.id}/review-request/', {'attendance_id': attendance.id, 'decision': decision}, format='json')
                self.client.force_authenticate(self.guest)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.client.get(f'/api/conversations/{chat.id}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/messages/{message.id}/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/messages/?conversation={chat.id}').data['count'], 0)
            self.assertEqual(self.client.post('/api/messages/', {'conversation': chat.id, 'body': 'Not allowed'}, format='json').status_code, 403)
            self.assertEqual(set(chat.participants.all()), {self.host})

    def test_host_invites_join_group_only_when_accepted(self):
        self.event.privacy = 'PRIVATE'; self.event.save()
        self.client.post(f'/api/events/{self.event.id}/invite/', {'user_id': self.guest.id}, format='json')
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/chat/').status_code, 403)
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/join/').status_code, 201)
        response = self.client.post(f'/api/events/{self.event.id}/chat/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({person['id'] for person in response.data['participants']}, {self.host.id, self.guest.id})
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/chat/').status_code, 404)

    def test_hide_reopen_rename_and_event_deletion(self):
        chat = self.event.conversation
        self.client.delete(f'/api/conversations/{chat.id}/')
        self.assertEqual(self.client.get('/api/conversations/').data['count'], 0)
        self.assertEqual(self.client.post(f'/api/events/{self.event.id}/chat/').data['id'], chat.id)
        self.assertEqual(self.client.patch(f'/api/conversations/{chat.id}/', {'title': 'Different name'}, format='json').status_code, 400)
        self.event.name = 'New adventure'; self.event.save()
        self.assertEqual(self.client.get(f'/api/conversations/{chat.id}/').data['display_name'], 'New adventure')
        Message.objects.create(conversation=chat, sender=self.host, body='Hello')
        self.event.delete()
        self.assertFalse(Conversation.objects.filter(pk=chat.pk).exists())
        self.assertFalse(Message.objects.filter(conversation_id=chat.pk).exists())

    def test_deleting_attendance_and_changing_host_sync_membership(self):
        attendance = Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        chat = self.event.conversation
        attendance.delete()
        self.assertEqual(set(chat.participants.all()), {self.host})
        self.event.host = self.other; self.event.save()
        self.assertEqual(set(chat.participants.all()), {self.other})

    def test_backfill_is_idempotent_and_keeps_existing_event_members(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        Attendance.objects.create(event=self.event, user=self.guest, status='ACCEPTED')
        Attendance.objects.create(event=self.event, user=self.other, status='PENDING')
        Conversation.objects.filter(event=self.event).delete()
        migrate = import_module('core.migrations.0016_event_group_chat').create_existing_event_chats
        for _ in range(2):
            migrate(apps, SimpleNamespace(connection=SimpleNamespace(alias='default')))
        chat = Conversation.objects.get(event=self.event)
        self.assertEqual(set(chat.participants.all()), {self.host, self.guest})
        self.assertEqual(chat.created_at, self.event.created_at)
