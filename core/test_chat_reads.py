from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Conversation, ConversationReadState, Message, Notification

User = get_user_model()


class ChatReadTests(TestCase):
    def setUp(self):
        self.alex = User.objects.create_user("alex")
        self.sam = User.objects.create_user("sam")
        self.other = User.objects.create_user("other")
        self.chat = Conversation.objects.create(is_group=True)
        self.chat.participants.add(self.alex, self.sam)
        self.client = APIClient()
        self.client.force_authenticate(self.alex)

    def send(self, sender=None, **kwargs):
        return Message.objects.create(conversation=self.chat, sender=sender or self.sam, body="Hello", **kwargs)

    def chat_data(self):
        response = self.client.get(f"/api/conversations/{self.chat.pk}/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def mark(self, message):
        return self.client.post(f"/api/conversations/{self.chat.pk}/mark-read/", {"message_id": message.pk}, format="json")

    def test_counts_only_visible_incoming_messages_and_get_does_not_mark_read(self):
        self.send(); self.send(); self.send(self.alex)
        hidden = self.send(); hidden.hidden_for.add(self.alex)
        self.send(deleted_for_everyone=True)
        self.assertEqual(self.chat_data()["unread_count"], 2)
        self.client.get(f"/api/messages/?conversation={self.chat.pk}")
        self.assertEqual(self.chat_data()["unread_count"], 2)
        self.assertEqual(Notification.objects.count(), 0)

    def test_read_cutoff_preserves_messages_arriving_after_the_displayed_message(self):
        displayed = self.send()
        newer = self.send()
        response = self.mark(displayed)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(response.data["read_through_message_id"], displayed.pk)
        self.assertEqual(self.mark(newer).data["unread_count"], 0)
        self.assertEqual(self.mark(displayed).data["read_through_message_id"], newer.pk)

    def test_read_state_is_per_person_and_shared_by_their_devices(self):
        received = self.send()
        self.send(self.alex)
        self.mark(received)
        second_device = APIClient(); second_device.force_authenticate(self.alex)
        self.assertEqual(second_device.get(f"/api/conversations/{self.chat.pk}/").data["unread_count"], 0)
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.chat_data()["unread_count"], 1)

    def test_read_cursor_survives_message_deletion(self):
        self.send(); latest = self.send()
        self.mark(latest); latest.delete()
        self.assertEqual(self.chat_data()["unread_count"], 0)
        self.send()
        self.assertEqual(self.chat_data()["unread_count"], 1)

    def test_cannot_mark_other_chats_hidden_messages_or_invalid_ids(self):
        message = self.send(); message.hidden_for.add(self.alex)
        self.assertEqual(self.mark(message).status_code, 404)
        elsewhere = Conversation.objects.create(); elsewhere.participants.add(self.alex, self.other)
        foreign = Message.objects.create(conversation=elsewhere, sender=self.other, body="Private")
        self.assertEqual(self.mark(foreign).status_code, 404)
        for value in [None, True, 0, -1, "1", [], {}]:
            response = self.client.post(f"/api/conversations/{self.chat.pk}/mark-read/", {"message_id": value}, format="json")
            self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.mark(message).status_code, 404)
        self.assertFalse(ConversationReadState.objects.exists())

    def test_inbox_counts_exclude_hidden_chats_and_refresh_after_new_message(self):
        first = self.send(); self.mark(first)
        self.client.delete(f"/api/conversations/{self.chat.pk}/")
        response = self.client.get("/api/conversations/")
        self.assertEqual(response.data["count"], 0)
        self.client.force_authenticate(self.sam)
        self.client.post("/api/messages/", {"conversation": self.chat.pk, "body": "Are you there?"}, format="json")
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.chat_data()["unread_count"], 1)

    def test_notification_list_does_not_read_notifications_and_targeted_read_is_scoped(self):
        first = Notification.objects.create(recipient=self.alex, kind=Notification.Kind.COMMENT_REPLY)
        second = Notification.objects.create(recipient=self.alex, kind=Notification.Kind.COMMENT_REPLY)
        private = Notification.objects.create(recipient=self.sam, kind=Notification.Kind.COMMENT_REPLY)
        self.client.get("/api/notifications/")
        self.assertEqual(self.client.get("/api/notifications/unread-count/").data["count"], 2)
        self.client.post("/api/notifications/mark-read/", {"ids": [first.pk, private.pk]}, format="json")
        self.assertEqual(self.client.get("/api/notifications/unread-count/").data["count"], 1)
        second.refresh_from_db(); private.refresh_from_db()
        self.assertIsNone(second.read_at); self.assertIsNone(private.read_at)
