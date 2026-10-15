from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch
from uuid import uuid4

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

    def test_sender_receipt_changes_only_after_recipient_reads_the_message(self):
        message = self.send(self.alex)
        url = f"/api/messages/{message.pk}/"
        self.assertEqual(self.client.get(url).data["delivery_status"], "sent")
        self.mark(message)  # Reading your own message does not count.
        self.assertEqual(self.client.get(url).data["delivery_status"], "sent")
        self.client.force_authenticate(self.sam)
        self.assertIsNone(self.client.get(url).data["delivery_status"])
        self.mark(message)
        self.client.force_authenticate(self.alex)
        self.assertEqual(self.client.get(url).data["delivery_status"], "read")
        self.assertEqual(self.chat_data()["latest_message"]["delivery_status"], "read")
        newer = self.send(self.alex)
        self.assertEqual(self.client.get(f"/api/messages/{newer.pk}/").data["delivery_status"], "sent")

    def test_group_receipts_require_all_current_recipients_and_are_conversation_scoped(self):
        self.chat.participants.add(self.other)
        message = self.send(self.alex)
        ConversationReadState.objects.create(conversation=self.chat, user=self.sam, last_read_message_id=message.pk)
        elsewhere = Conversation.objects.create()
        elsewhere.participants.add(self.other, self.alex)
        ConversationReadState.objects.create(conversation=elsewhere, user=self.other, last_read_message_id=message.pk + 100)
        url = f"/api/messages/{message.pk}/"
        self.assertEqual(self.client.get(url).data["delivery_status"], "sent")
        ConversationReadState.objects.create(conversation=self.chat, user=self.other, last_read_message_id=message.pk)
        self.assertEqual(self.client.get(url).data["delivery_status"], "read")
        self.chat.participants.remove(self.sam, self.other)
        self.assertEqual(self.client.get(url).data["delivery_status"], "sent", "An empty recipient set is not a read receipt")
        message.deleted_for_everyone = True; message.save()
        self.assertIsNone(self.client.get(url).data["delivery_status"])

    def test_receipt_annotation_does_not_query_each_message(self):
        from .chat_reads import with_message_receipts
        for _ in range(25): self.send(self.alex)
        with self.assertNumQueries(1):
            messages = list(with_message_receipts(Message.objects.all()))
            self.assertTrue(all(item.has_recipients and item.has_unread_recipients for item in messages))

    @patch("core.notification_delivery.queue_message")
    def test_retrying_the_same_send_is_idempotent_and_cannot_mutate_an_existing_message(self, notify):
        payload = {"conversation": self.chat.pk, "body": "Hello once", "client_id": str(uuid4())}
        first = self.client.post('/api/messages/', payload, format='json')
        second = self.client.post('/api/messages/', payload, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.data['id'], first.data['id'])
        self.assertEqual(Message.objects.count(), 1); self.assertEqual(notify.call_count, 1)
        self.assertEqual(first.data['client_id'], payload['client_id'])
        self.assertEqual(first.data['delivery_status'], 'sent')
        self.assertEqual(self.client.post('/api/messages/', {**payload, 'body': 'Different'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f"/api/messages/{first.data['id']}/", {'client_id': str(uuid4())}, format='json').status_code, 400)
        elsewhere = Conversation.objects.create(); elsewhere.participants.add(self.alex, self.other)
        self.assertEqual(self.client.post('/api/messages/', {**payload, 'conversation': elsewhere.pk}, format='json').status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/messages/', payload, format='json').status_code, 403)
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.post('/api/messages/', payload, format='json').status_code, 201)
        self.assertEqual(Message.objects.count(), 2, 'Client IDs are scoped to the sender')

    def test_legacy_sends_without_client_ids_remain_distinct(self):
        for _ in range(2):
            self.assertEqual(self.client.post('/api/messages/', {'conversation': self.chat.pk, 'body': 'Hello'}, format='json').status_code, 201)
        self.assertEqual(Message.objects.count(), 2)
