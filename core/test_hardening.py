from datetime import timedelta
from io import BytesIO
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, connection, transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from PIL import Image
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from .chat_attachments import conversation_devices, relay_path
from .chat_reads import with_message_receipts
from .media import MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, validate_media_upload
from .models import (AuthSession, ChatAttachment, ChatAttachmentRecipient, ChatDevice,
                     Comment, Conversation, ConversationReadState, Event, Follow, Message,
                     Notification, NotificationDelivery, NotificationDevice, PendingUploadDeletion,
                     Post, PostLike, Report, UserBlock, UserPresence)
from .notification_delivery import should_suppress
from .querysets import with_public_user_stats
from .serializers import EventSerializer, PostSerializer, ProfileUpdateSerializer, PublicUserSerializer, QuestSubmissionSerializer
from .upload_cleanup import purge_deleted_uploads
from .views import PostViewSet

User = get_user_model()
PASSWORD = 'f7R!m2K#p9Vz'


def image_upload(name='photo.jpg', content_type='image/jpeg'):
    data = BytesIO()
    Image.new('RGB', (8, 8), color='purple').save(data, format='JPEG')
    return SimpleUploadedFile(name, data.getvalue(), content_type=content_type)


def video_upload():
    return SimpleUploadedFile('clip.mp4', b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 20, content_type='video/mp4')


class MediaValidationTests(SimpleTestCase):
    def test_image_and_video_boundaries_and_stream_rewind(self):
        for upload, limit, kind in [(image_upload(), MAX_IMAGE_BYTES, 'IMAGE'), (video_upload(), MAX_VIDEO_BYTES, 'REEL')]:
            upload.size = limit
            self.assertEqual(validate_media_upload(upload), kind)
            self.assertEqual(upload.tell(), 0)
            upload.size = limit + 1
            with self.assertRaisesMessage(ValueError, '10 MB' if kind == 'IMAGE' else '60 MB'):
                validate_media_upload(upload)

    def test_rejects_missing_unsupported_or_forged_mime_extensions_and_signatures(self):
        uploads = [image_upload(content_type=''), image_upload(content_type='text/html'),
                   image_upload('photo.html'), image_upload('photo.png', 'image/png'),
                   SimpleUploadedFile('bad.jpg', b'not an image', 'image/jpeg'),
                   SimpleUploadedFile('bad.svg', b'<svg/>', 'image/svg+xml'),
                   SimpleUploadedFile('bad.mp4', b'video?', 'video/mp4'),
                   SimpleUploadedFile('fake.mp4', b'\x00\x00\x00\x18ftypheic' + b'\x00' * 20, 'video/mp4'),
                   SimpleUploadedFile('bad.bin', b'anything', 'application/octet-stream'),
                   SimpleUploadedFile('empty.jpg', b'', 'image/jpeg')]
        for upload in uploads:
            with self.subTest(name=upload.name, mime=upload.content_type), self.assertRaises(ValueError):
                validate_media_upload(upload)
        with self.assertRaises(ValueError):
            validate_media_upload(image_upload(), 'REEL')
        with self.assertRaises(ValueError):
            validate_media_upload(video_upload(), 'IMAGE')

    def test_image_field_cannot_normalize_away_a_forged_declared_mime(self):
        serializer = ProfileUpdateSerializer(data={'avatar': image_upload(content_type='text/html')}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('avatar', serializer.errors)

    def test_all_media_serializer_entry_points_enforce_image_size(self):
        for serializer_class, field, extra in [
            (PostSerializer, 'media', {'body': 'Image'}),
            (QuestSubmissionSerializer, 'media', {'media_type': 'IMAGE'}),
            (ProfileUpdateSerializer, 'avatar', {}),
            (EventSerializer, 'cover_image', {}),
        ]:
            upload = image_upload(); upload.size = MAX_IMAGE_BYTES + 1
            serializer = serializer_class(data={**extra, field: upload}, partial=True)
            self.assertFalse(serializer.is_valid())
            self.assertIn('10 MB', str(serializer.errors))


    def test_post_and_quest_reels_enforce_the_video_size_limit(self):
        for serializer_class, extra in [(PostSerializer, {'kind': 'REEL'}), (QuestSubmissionSerializer, {'media_type': 'REEL'})]:
            upload = video_upload(); upload.size = MAX_VIDEO_BYTES + 1
            serializer = serializer_class(data={**extra, 'media': upload}, partial=True)
            self.assertFalse(serializer.is_valid())
            self.assertIn('60 MB', str(serializer.errors))



class IsolatedAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.viewer = User.objects.create_user('viewer', password=PASSWORD)
        cls.author = User.objects.create_user('author', password=PASSWORD)
        cls.other = User.objects.create_user('other', password=PASSWORD)

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.client.force_authenticate(self.viewer)


class SecurityPolicyTests(IsolatedAPITests):
    def test_registration_applies_all_password_validators_and_keeps_strong_passwords(self):
        for password in ['abc', 'password123', '9741638205974']:
            cache.clear()
            response = APIClient().post('/api/auth/register/', {'username': 'new-person', 'password': password}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('password', response.data)
            self.assertFalse(User.objects.filter(username='new-person').exists())
        response = APIClient().post('/api/auth/register/', {'username': 'new-person', 'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(User.objects.get(username='new-person').check_password(PASSWORD))

    def test_auth_budget_is_shared_by_login_and_registration_and_cannot_use_forwarded_ips(self):
        for attempt in range(5):
            response = APIClient().post('/api/auth/login/', {'username': 'unknown', 'password': 'wrong'}, format='json', HTTP_X_FORWARDED_FOR=f'192.0.2.{attempt}')
            self.assertEqual(response.status_code, 400)
        response = APIClient().post('/api/auth/register/', {'username': 'new-person', 'password': PASSWORD}, format='json', HTTP_X_FORWARDED_FOR='198.51.100.1')
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)
        self.assertFalse(User.objects.filter(username='new-person').exists())

    def test_authenticated_tokens_do_not_bypass_the_auth_ip_budget(self):
        for attempt in range(6):
            self.client.force_authenticate(self.viewer if attempt % 2 else self.other)
            response = self.client.post('/api/auth/login/', {'username': 'unknown', 'password': 'wrong'}, format='json')
            self.assertEqual(response.status_code, 400 if attempt < 5 else 429)

    def test_anon_and_user_budgets_enforce_rates_and_reset_after_one_minute(self):
        class Probe(APIView):
            permission_classes = [permissions.AllowAny]

            def get(self, request):
                return Response({'ok': True})

        factory = APIRequestFactory()
        for user, count in [(None, 60), (self.viewer, 300)]:
            cache.clear()
            with patch('rest_framework.throttling.SimpleRateThrottle.timer', return_value=1000):
                for attempt in range(count + 1):
                    request = factory.get('/probe/')
                    if user:
                        force_authenticate(request, user)
                    response = Probe.as_view()(request)
                    self.assertEqual(response.status_code, 200 if attempt < count else 429)
            with patch('rest_framework.throttling.SimpleRateThrottle.timer', return_value=1061):
                request = factory.get('/probe/')
                if user:
                    force_authenticate(request, user)
                self.assertEqual(Probe.as_view()(request).status_code, 200)


class ModerationTests(IsolatedAPITests):
    def setUp(self):
        super().setUp()
        self.post = Post.objects.create(author=self.author, body='A public moment')
        self.own_post = Post.objects.create(author=self.viewer, body='My moment')
        self.direct = Conversation.objects.create(direct_key=f'direct:{self.viewer.pk}:{self.author.pk}')
        self.direct.participants.set([self.viewer, self.author])
        self.group = Conversation.objects.create(is_group=True)
        self.group.participants.set([self.viewer, self.author, self.other])

    def block(self):
        response = self.client.post(f'/api/people/{self.author.pk}/block/')
        self.assertEqual(response.status_code, 201, response.data)

    def test_report_ownership_is_derived_and_reports_are_not_publicly_listable(self):
        response = self.client.post('/api/reports/', {'content_type': 'post', 'object_id': self.post.pk,
                                                    'reason': 'Harassment', 'reporter': self.author.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        report = Report.objects.get()
        self.assertEqual(report.reporter, self.viewer)
        self.assertEqual(report.reported_user, self.author)
        self.assertEqual(report.content_object, self.post)
        self.assertEqual(response.data['content_type'], 'post')
        self.assertEqual(self.client.get('/api/reports/').status_code, 405)
        self.assertEqual(APIClient().post('/api/reports/', {'reported_user': self.author.pk, 'reason': 'Abuse'}, format='json').status_code, 401)
        response = self.client.post('/api/reports/', {'reported_user': self.author.pk, 'reason': 'Spam account'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Report.objects.get(pk=response.data['id']).content_object, self.author)

    def test_reports_reject_private_content_arbitrary_models_mismatched_owners_and_empty_reasons(self):
        event = Event.objects.create(host=self.author, name='Private', privacy='PRIVATE', starts_at=timezone.now(), ends_at=timezone.now() + timedelta(hours=1))
        private_post = Post.objects.create(author=self.author, event=event, body='Private')
        elsewhere = Conversation.objects.create(); elsewhere.participants.set([self.author, self.other])
        private_message = Message.objects.create(conversation=elsewhere, sender=self.author, body='Secret')
        bodies = [
            {'content_type': 'post', 'object_id': private_post.pk},
            {'content_type': 'message', 'object_id': private_message.pk},
            {'content_type': 'event', 'object_id': event.pk},
            {'content_type': 'authsession', 'object_id': 1},
            {'content_type': 'post', 'object_id': self.post.pk, 'reported_user': self.other.pk},
            {'reported_user': self.viewer.pk}, {'content_type': 'post', 'object_id': 999999},
        ]
        for body in bodies:
            response = self.client.post('/api/reports/', {**body, 'reason': 'Abuse'}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        for reason in ['', '   ', 'x' * 2001]:
            self.assertEqual(self.client.post('/api/reports/', {'reported_user': self.author.pk, 'reason': reason}, format='json').status_code, 400)
        self.assertEqual(Report.objects.count(), 0)

    def test_report_accepts_only_allowlisted_numeric_content_types_and_oversized_ids_are_errors(self):
        content_type = ContentType.objects.get_for_model(Post)
        response = self.client.post('/api/reports/', {'content_type': content_type.pk, 'object_id': self.post.pk, 'reason': 'Spam'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        denied_type = ContentType.objects.get_for_model(AuthSession)
        for data in [{'content_type': denied_type.pk, 'object_id': 1},
                     {'content_type': 10 ** 100, 'object_id': 1},
                     {'content_type': 'post', 'object_id': 10 ** 100},
                     {'reported_user': 10 ** 100}]:
            response = self.client.post('/api/reports/', {**data, 'reason': 'Spam'}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_blocks_hide_event_discovery_and_already_existing_attachment_access(self):
        event = Event.objects.create(host=self.author, name='Hidden event', starts_at=timezone.now(), ends_at=timezone.now() + timedelta(hours=1))
        device = ChatDevice.objects.create(user=self.viewer, public_key='recipient')
        sender_device = ChatDevice.objects.create(user=self.author, public_key='sender')
        message = Message.objects.create(conversation=self.group, sender=self.author, body='')
        attachment = ChatAttachment.objects.create(id=uuid4(), message=message, sender_device=sender_device,
            ciphertext_size=8, ciphertext_sha256='a' * 64, request_digest='b' * 64,
            expires_at=timezone.now() + timedelta(hours=24))
        ChatAttachmentRecipient.objects.create(attachment=attachment, device=device, envelope='encrypted')
        self.block()
        self.assertEqual(self.client.get(f'/api/events/{event.pk}/').status_code, 404)
        recommended = self.client.get('/api/events/recommended/').data
        self.assertNotIn(event.pk, [item['id'] for item in recommended])
        self.assertEqual(self.client.get(f'/api/chat-attachments/{attachment.pk}/?device={device.pk}').status_code, 404)
        self.assertEqual(self.client.get(f'/api/chat-attachments/{attachment.pk}/content/?device={device.pk}').status_code, 404)
        self.assertEqual(self.client.get(f'/api/chat-attachments/pending/?device={device.pk}').data, [])

    def test_block_is_idempotent_unfollowed_bilateral_and_can_only_be_removed_by_its_owner(self):
        Follow.objects.create(follower=self.viewer, following=self.author)
        Follow.objects.create(follower=self.author, following=self.viewer)
        self.block()
        self.assertEqual(self.client.post(f'/api/people/{self.author.pk}/block/').status_code, 200)
        self.assertEqual(UserBlock.objects.count(), 1)
        self.assertEqual(Follow.objects.count(), 0)
        self.assertEqual(self.client.post(f'/api/people/{self.viewer.pk}/block/').status_code, 400)
        self.assertEqual(APIClient().post(f'/api/people/{self.author.pk}/block/').status_code, 401)
        self.assertEqual(self.client.get(f'/api/posts/{self.post.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/people/{self.author.pk}/').status_code, 404)
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.get(f'/api/posts/{self.own_post.pk}/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/people/{self.viewer.pk}/block/').status_code, 204)
        self.assertTrue(UserBlock.objects.exists())
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.delete(f'/api/people/{self.author.pk}/block/').status_code, 204)
        self.assertEqual(self.client.get(f'/api/posts/{self.post.pk}/').status_code, 200)

    def test_block_applies_to_every_feed_comments_previews_and_direct_message_writes(self):
        Comment.objects.create(post=self.own_post, author=self.author, body='Hidden reply')
        Comment.objects.create(post=self.own_post, author=self.other, body='Visible reply')
        Message.objects.create(conversation=self.direct, sender=self.author, body='Hidden direct')
        self.block()
        for url in ['/api/posts/', '/api/posts/for-you/', '/api/posts/following/']:
            response = self.client.get(url)
            posts = response.data['results'] if isinstance(response.data, dict) else response.data
            self.assertNotIn(self.post.pk, [post['id'] for post in posts])
        post = self.client.get(f'/api/posts/{self.own_post.pk}/').data
        self.assertEqual(post['comment_count'], 1)
        self.assertEqual([comment['body'] for comment in post['recent_comments']], ['Visible reply'])
        self.assertEqual(self.client.get(f'/api/conversations/{self.direct.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/messages/?conversation={self.direct.pk}').data['count'], 0)
        self.assertEqual(self.client.post('/api/messages/', {'conversation': self.direct.pk, 'body': 'Denied'}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/conversations/direct/', {'user_id': self.author.pk}, format='json').status_code, 403)
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.post('/api/messages/', {'conversation': self.direct.pk, 'body': 'Denied'}, format='json').status_code, 403)

    def test_group_previews_unread_receipts_and_device_lists_respect_blocking(self):
        visible = Message.objects.create(conversation=self.group, sender=self.other, body='Visible')
        hidden = Message.objects.create(conversation=self.group, sender=self.author, body='Hidden newer')
        outgoing = Message.objects.create(conversation=self.group, sender=self.viewer, body='My message')
        ConversationReadState.objects.create(conversation=self.group, user=self.other, last_read_message_id=outgoing.pk)
        self.block()
        response = self.client.get(f'/api/conversations/{self.group.pk}/')
        self.assertEqual(response.data['unread_count'], 1)
        self.assertEqual(response.data['latest_message']['body'], 'My message')
        self.assertNotIn(self.author.pk, [person['id'] for person in response.data['participants']])
        self.assertEqual(self.client.post(f'/api/conversations/{self.group.pk}/mark-read/', {'message_id': hidden.pk}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'/api/conversations/{self.group.pk}/mark-read/', {'message_id': visible.pk}, format='json').status_code, 200)
        receipt = with_message_receipts(Message.objects.filter(pk=outgoing.pk)).get()
        self.assertTrue(receipt.has_recipients); self.assertFalse(receipt.has_unread_recipients)
        self.assertEqual(self.client.post('/api/messages/', {'conversation': self.group.pk, 'body': 'For the rest of the group'}, format='json').status_code, 201)
        for user in [self.viewer, self.author, self.other]:
            ChatDevice.objects.create(user=user, public_key='test')
        people, devices = conversation_devices(self.group, self.viewer)
        self.assertNotIn(self.author.pk, people)
        self.assertNotIn(self.author.pk, [device.user_id for device in devices])

    def test_block_suppresses_queued_and_future_notifications(self):
        device = NotificationDevice.objects.create(user=self.viewer, transport='LOCAL')
        message = Message.objects.create(conversation=self.group, sender=self.author, body='Do not push')
        delivery = NotificationDelivery.objects.create(device=device, message=message, payload={'body': 'Do not push'})
        notification = Notification.objects.create(recipient=self.viewer, actor=self.author, kind='RSVP')
        self.block()
        delivery.refresh_from_db(); self.assertEqual(delivery.status, 'SUPPRESSED')
        self.assertTrue(should_suppress(delivery))
        self.assertEqual(self.client.get('/api/notifications/').data['count'], 0)
        self.assertFalse(NotificationDelivery.objects.filter(notification=notification, status='PENDING').exists())
        from .notification_delivery import queue_message
        latest = Message.objects.create(conversation=self.group, sender=self.author, body='New blocked message')
        queue_message(latest)
        self.assertFalse(NotificationDelivery.objects.filter(message=latest, device=device).exists())

    def test_database_disallows_duplicate_and_self_blocks(self):
        UserBlock.objects.create(blocker=self.viewer, blocked_user=self.author)
        for kwargs in [{'blocker': self.viewer, 'blocked_user': self.author}, {'blocker': self.viewer, 'blocked_user': self.viewer}]:
            with self.assertRaises(IntegrityError), transaction.atomic():
                UserBlock.objects.create(**kwargs)


class QueryEfficiencyTests(IsolatedAPITests):
    def make_post(self, author, number):
        post = Post.objects.create(author=author, body=f'Moment {number}')
        for person in [self.viewer, self.other]:
            PostLike.objects.create(post=post, user=person)
        for index in range(3):
            Comment.objects.create(post=post, author=author, body=f'Reply {index}')
        return post

    def test_feed_counts_are_distinct_and_serialization_performs_no_queries(self):
        self.make_post(self.author, 1)
        view = PostViewSet(); view.request = SimpleNamespace(user=self.viewer, query_params={}); view.action = 'list'
        posts = list(view.get_queryset())
        with self.assertNumQueries(0):
            payload = PostSerializer(posts, many=True, context={'request': view.request}).data
        self.assertEqual(payload[0]['like_count'], 2)
        self.assertEqual(payload[0]['comment_count'], 3)
        self.assertTrue(payload[0]['liked_by_me'])
        self.assertEqual(len(payload[0]['recent_comments']), 2)

    def test_feed_query_count_stays_constant_as_authors_posts_and_replies_grow(self):
        self.make_post(self.author, 1)
        with CaptureQueriesContext(connection) as first:
            response = self.client.get('/api/posts/')
            self.assertEqual(response.status_code, 200)
        for number in range(10):
            author = User.objects.create_user(f'author-{number}')
            self.make_post(author, number)
        with CaptureQueriesContext(connection) as many:
            response = self.client.get('/api/posts/')
            self.assertEqual(response.data['count'], 11)
        self.assertEqual(len(many), len(first))
        self.assertLessEqual(len(many), 6)
        for post in response.data['results']:
            self.assertEqual((post['like_count'], post['comment_count']), (2, 3))

    def test_public_statistics_are_distinct_filter_inactive_users_and_batch_raw_lists(self):
        for follower in [self.viewer, self.other]:
            Follow.objects.create(follower=follower, following=self.author)
            Follow.objects.create(follower=self.author, following=follower)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        people = list(with_public_user_stats(User.objects.all(), self.viewer))
        with self.assertNumQueries(0):
            payload = PublicUserSerializer(people, many=True).data
        author = next(person for person in payload if person['id'] == self.author.pk)
        self.assertEqual((author['follower_count'], author['following_count']), (1, 1))
        with self.assertNumQueries(2):
            payload = PublicUserSerializer(User.objects.all(), many=True).data
        author = next(person for person in payload if person['id'] == self.author.pk)
        self.assertEqual((author['follower_count'], author['following_count']), (1, 1))


class ImmediateDeletionTests(IsolatedAPITests):
    def setUp(self):
        super().setUp()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=Path(self.directory.name) / 'media', CHAT_ATTACHMENT_ROOT=Path(self.directory.name) / 'relay')
        self.settings_override.enable(); self.addCleanup(self.settings_override.disable)

    def test_delete_erases_owned_content_files_tokens_and_browser_sessions(self):
        token = AuthSession.objects.create(user=self.viewer)
        second = AuthSession.objects.create(user=self.viewer)
        other_token = AuthSession.objects.create(user=self.other)
        browser = APIClient(); self.assertTrue(browser.login(username=self.viewer.username, password=PASSWORD))
        browser_key = browser.session.session_key
        post = Post.objects.create(author=self.viewer, body='Private data')
        post.media.save('photo.jpg', ContentFile(b'image fixture'))
        self.viewer.profile.avatar.save('avatar.jpg', ContentFile(b'avatar fixture'))
        paths = [Path(post.media.path), Path(self.viewer.profile.avatar.path)]
        comment = Comment.objects.create(post=Post.objects.create(author=self.other, body='Keep'), author=self.viewer, body='Erase this')
        notice = Notification.objects.create(recipient=self.other, actor=self.viewer, kind='RSVP')
        device = NotificationDevice.objects.create(user=self.other, transport='LOCAL')
        NotificationDelivery.objects.create(device=device, notification=notice, payload={'body': 'Viewer private text'})
        UserPresence.objects.create(user=self.viewer, session_id=uuid4())
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete('/api/people/me/delete-account/')
        self.assertEqual(response.status_code, 204, response.data)
        self.assertFalse(User.objects.filter(pk=self.viewer.pk).exists())
        self.assertFalse(AuthSession.objects.filter(pk__in=[token.pk, second.pk]).exists())
        self.assertTrue(AuthSession.objects.filter(pk=other_token.pk).exists())
        self.assertFalse(Session.objects.filter(pk=browser_key).exists())
        self.assertFalse(Comment.objects.filter(pk=comment.pk).exists())
        self.assertFalse(Notification.objects.filter(pk=notice.pk).exists())
        self.assertFalse(NotificationDelivery.objects.filter(notification_id=notice.pk).exists())
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertEqual(self.client.get('/api/people/me/').status_code, 401)
        self.assertEqual(APIClient().delete('/api/people/me/delete-account/').status_code, 401)
        self.assertTrue(User.objects.filter(pk=self.other.pk).exists())

    def test_delete_purges_relay_devices_and_hosted_group_cascades_without_stranding_files(self):
        event = Event.objects.create(host=self.viewer, name='Hosted', starts_at=timezone.now(), ends_at=timezone.now() + timedelta(hours=1))
        group = Conversation.objects.get(event=event)
        group.participants.add(self.author)
        own_device = ChatDevice.objects.create(user=self.viewer, public_key='own')
        other_device = ChatDevice.objects.create(user=self.author, public_key='other')
        direct = Conversation.objects.create(); direct.participants.set([self.viewer, self.author])
        paths = []
        for conversation, sender, device in [(direct, self.viewer, own_device), (group, self.author, other_device)]:
            message = Message.objects.create(conversation=conversation, sender=sender, body='')
            attachment = ChatAttachment.objects.create(id=uuid4(), message=message, sender_device=device, ciphertext_size=8,
                ciphertext_sha256='a' * 64, request_digest='b' * 64, expires_at=timezone.now() + timedelta(hours=24))
            ChatAttachmentRecipient.objects.create(attachment=attachment, device=own_device, envelope='encrypted')
            path = relay_path(attachment.pk); path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b'encrypted'); paths.append(path)
        keep = Message.objects.create(conversation=direct, sender=self.author, body='Other author retains their message')
        self.assertEqual(self.client.delete('/api/people/me/delete-account/').status_code, 204)
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertFalse(ChatDevice.objects.filter(user_id=self.viewer.pk).exists())
        self.assertFalse(Event.objects.filter(pk=event.pk).exists())
        self.assertTrue(Message.objects.filter(pk=keep.pk).exists())

    def test_upload_deletion_failures_are_durable_and_retryable_after_account_erasure(self):
        post = Post.objects.create(author=self.viewer, body='Erase upload')
        post.media.save('photo.jpg', ContentFile(b'fixture'))
        name = post.media.name; path = Path(post.media.path)
        with patch('django.core.files.storage.FileSystemStorage.delete', side_effect=OSError('Storage offline')), self.assertLogs('core.upload_cleanup', level='ERROR'), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete('/api/people/me/delete-account/').status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.viewer.pk).exists())
        self.assertTrue(PendingUploadDeletion.objects.filter(name=name).exists())
        self.assertTrue(path.exists())
        purge_deleted_uploads()
        self.assertFalse(path.exists())
        self.assertFalse(PendingUploadDeletion.objects.filter(name=name).exists())
