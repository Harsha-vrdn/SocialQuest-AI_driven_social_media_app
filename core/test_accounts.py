import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .accounts import login_account, purge_account, purge_due_accounts, suspend_account
from .chat_attachments import relay_path
from .models import (AuthSession, ChatAttachment, ChatAttachmentRecipient, ChatDevice, Conversation,
                     Event, Message, Notification, NotificationDelivery, NotificationDevice,
                     PendingUploadDeletion, Post, Profile, Quest, QuestSubmission, UserPresence)
from .upload_cleanup import purge_deleted_uploads
from .serializers import AccountSettingsSerializer, ProfileUpdateSerializer

User = get_user_model()


class AccountSettingsTests(TestCase):
    def setUp(self):
        # Throttle state is cache-backed and does not roll back with TestCase's DB.
        cache.clear()
        self.addCleanup(cache.clear)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.overrides = override_settings(MEDIA_ROOT=Path(self.directory.name) / 'media',
                                           CHAT_ATTACHMENT_ROOT=Path(self.directory.name) / 'relay')
        self.overrides.enable()
        self.addCleanup(self.overrides.disable)
        self.user = User.objects.create_user('settings-user', password='password123')
        self.other = User.objects.create_user('other-user', password='password123')
        self.token = AuthSession.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)

    def login(self, password='password123'):
        return APIClient().post('/api/auth/login/', {'username': self.user.username, 'password': password}, format='json')

    def suspend(self, delete=False, password='password123'):
        return self.client.post('/api/auth/request-deletion/' if delete else '/api/auth/deactivate/', {'password': password}, format='json')

    def test_private_settings_persist_without_changing_public_city(self):
        self.user.profile.city = 'Public city'; self.user.profile.save()
        self.assertEqual(APIClient().get('/api/auth/settings/').status_code, 401)
        response = self.client.patch('/api/auth/settings/', {'location_mode': 'SAVED', 'saved_city': 'Bengaluru, India',
            'saved_latitude': 12.97, 'saved_longitude': 77.59, 'account_state': 'PENDING_DELETION'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['account_state'], 'ACTIVE')
        self.assertEqual(self.client.get('/api/auth/settings/').data['saved_city'], 'Bengaluru, India')
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.city, 'Public city')
        self.assertEqual(self.other.profile.saved_city, '')
        public = APIClient().get(f'/api/people/{self.user.pk}/').data
        self.assertNotIn('saved_city', public)
        self.assertNotIn('saved_latitude', public)
        self.assertNotIn('account_state', public)

    def test_settings_validate_coordinates_and_saved_city(self):
        for body in [{'location_mode': 'SAVED'}, {'location_mode': 'invalid'}, {'saved_latitude': 12},
                     {'saved_latitude': 91, 'saved_longitude': 10}, {'saved_latitude': 10, 'saved_longitude': -181},
                     {'saved_latitude': 'NaN', 'saved_longitude': 10}, {'saved_city': 'x' * 81}]:
            with self.subTest(body=body):
                self.assertEqual(self.client.patch('/api/auth/settings/', body, format='json').status_code, 400)
        self.client.patch('/api/auth/settings/', {'saved_city': 'City A', 'saved_latitude': 12, 'saved_longitude': 13}, format='json')
        result = self.client.patch('/api/auth/settings/', {'location_mode': 'SAVED', 'saved_city': 'City B'}, format='json')
        self.assertIsNone(result.data['saved_latitude'])
        self.assertIsNone(result.data['saved_longitude'])

    def test_account_actions_require_current_password_and_authentication(self):
        for delete in [False, True]:
            self.assertEqual(self.suspend(delete, 'wrong').status_code, 400)
        self.assertEqual(APIClient().post('/api/auth/deactivate/', {'password': 'password123'}, format='json').status_code, 401)
        self.assertEqual(self.client.post('/api/auth/request-deletion/', {}, format='json').status_code, 400)
        self.user.refresh_from_db(); self.assertTrue(self.user.is_active)
        self.assertTrue(AuthSession.objects.filter(pk=self.token.pk).exists())

    def test_deactivate_revokes_all_sessions_presence_and_push(self):
        second = AuthSession.objects.create(user=self.user)
        other_token = AuthSession.objects.create(user=self.other)
        browser = APIClient(); browser.login(username=self.user.username, password='password123')
        browser_key = browser.session.session_key
        UserPresence.objects.create(user=self.user, session_id=uuid4())
        device = NotificationDevice.objects.create(user=self.user, transport='LOCAL')
        notice = Notification.objects.create(recipient=self.user, actor=self.other, kind='RSVP')
        delivery = NotificationDelivery.objects.get(device=device, notification=notice)
        result = self.suspend()
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.data['deletion_due_at'])
        self.assertFalse(AuthSession.objects.filter(pk__in=[second.pk, self.token.pk]).exists())
        self.assertTrue(AuthSession.objects.filter(pk=other_token.pk).exists())
        self.assertFalse(Session.objects.filter(pk=browser_key).exists())
        self.assertFalse(UserPresence.objects.filter(user=self.user).exists())
        device.refresh_from_db(); self.assertFalse(device.enabled)
        delivery.refresh_from_db(); self.assertEqual(delivery.status, 'SUPPRESSED')
        self.assertEqual(self.client.get('/api/people/me/').status_code, 401)

    def test_deactivation_hides_profile_posts_events_but_preserves_history(self):
        post = Post.objects.create(author=self.user, body='A moment')
        event = Event.objects.create(host=self.user, name='Test event', location_name='City',
            starts_at=timezone.now() + timedelta(days=1), ends_at=timezone.now() + timedelta(days=2))
        chat = Conversation.objects.create(); chat.participants.set([self.user, self.other])
        Message.objects.create(conversation=chat, sender=self.user, body='Existing shared message')
        self.suspend()
        anonymous = APIClient()
        self.assertEqual(anonymous.get(f'/api/people/{self.user.pk}/').status_code, 404)
        self.assertEqual(anonymous.get(f'/api/posts/{post.pk}/').status_code, 404)
        self.assertEqual(anonymous.get(f'/api/events/{event.pk}/').status_code, 404)
        anonymous.force_authenticate(self.other)
        conversation = anonymous.get(f'/api/conversations/{chat.pk}/').data
        self.assertEqual(conversation['display_name'], 'Unavailable account')
        self.assertEqual(conversation['latest_message']['sender']['display_name'], 'Unavailable account')
        self.assertEqual(anonymous.post('/api/conversations/direct/', {'user_id': self.user.pk}, format='json').status_code, 404)
        self.assertTrue(Post.objects.filter(pk=post.pk).exists())
        self.assertEqual(purge_due_accounts(), 0)
        result = self.login()
        self.assertTrue(result.data['reactivated']); self.assertFalse(result.data['deletion_cancelled'])
        self.assertEqual(APIClient().get(f'/api/people/{self.user.pk}/').status_code, 200)

    def test_deactivated_account_survives_indefinitely(self):
        self.suspend()
        with patch('core.accounts.timezone.now', return_value=timezone.now() + timedelta(days=1000)):
            self.assertEqual(purge_due_accounts(), 0)
            self.assertEqual(self.login().status_code, 200)

    def test_deletion_is_exactly_90_days_and_wrong_password_does_not_cancel(self):
        now = timezone.now()
        with patch('core.accounts.timezone.now', return_value=now):
            response = self.suspend(delete=True)
        self.assertEqual(response.status_code, 200)
        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.deletion_due_at, now + timedelta(days=90))
        self.assertEqual(profile.account_state, 'PENDING_DELETION')
        self.assertEqual(self.login('wrong').status_code, 400)
        profile.refresh_from_db(); self.assertEqual(profile.deletion_due_at, now + timedelta(days=90))
        self.assertFalse(purge_account(self.user.pk))

    def test_login_just_before_deadline_cancels_and_invalidates_queued_purge(self):
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        with patch('core.accounts.timezone.now', return_value=due - timedelta(microseconds=1)):
            response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['deletion_cancelled'])
        profile = Profile.objects.get(user=self.user)
        self.assertIsNone(profile.deletion_due_at)
        self.assertEqual(profile.account_state, 'ACTIVE')
        with patch('core.accounts.timezone.now', return_value=due + timedelta(days=1)):
            self.assertFalse(purge_account(self.user.pk))
        self.assertEqual(self.client.get('/api/people/me/').status_code, 401, 'An old token must stay revoked after recovery')

    def test_deadline_blocks_login_even_before_worker_runs_and_purge_is_idempotent(self):
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        for now in [due, due + timedelta(days=1)]:
            with patch('core.accounts.timezone.now', return_value=now):
                self.assertEqual(self.login().status_code, 400)
        with patch('core.accounts.timezone.now', return_value=due):
            self.assertEqual(purge_due_accounts(), 1)
            self.assertEqual(purge_due_accounts(), 0)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.other.pk).exists())

    def test_admin_disabled_account_cannot_self_reactivate(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.login().status_code, 400)
        self.assertIsNone(login_account('unknown', 'password123'))
        self.assertIsNone(login_account([], 'password123'))

    def test_stale_profile_and_location_saves_cannot_cancel_deletion(self):
        before = Profile.objects.get(user=self.user)
        editor = ProfileUpdateSerializer(before, data={'display_name': 'A pending edit'}, partial=True)
        settings = AccountSettingsSerializer(Profile.objects.get(user=self.user), data={'saved_city': 'Pune'}, partial=True)
        editor.is_valid(raise_exception=True); settings.is_valid(raise_exception=True)
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        editor.save(); settings.save()
        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.account_state, 'PENDING_DELETION')
        self.assertEqual(profile.deletion_due_at, due)

    def test_recommendations_use_saved_city_not_public_city(self):
        self.user.profile.city = 'Chennai'; self.user.profile.save()
        self.client.patch('/api/auth/settings/', {'location_mode': 'SAVED', 'saved_city': 'Bengaluru, India'}, format='json')
        events = [Event.objects.create(host=self.other, name=city, location_name=city + ', India',
            starts_at=timezone.now() + timedelta(days=1), ends_at=timezone.now() + timedelta(days=2)) for city in ['Chennai', 'Bengaluru']]
        response = self.client.get('/api/events/recommended/')
        rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        self.assertEqual(rows[0]['id'], events[1].pk)

    def test_purge_handles_protected_chat_devices_without_deleting_other_senders_messages(self):
        chat = Conversation.objects.create(); chat.participants.set([self.user, self.other])
        devices = [ChatDevice.objects.create(user=user, public_key='test-key') for user in [self.user, self.other]]
        attachments = []
        for i, user in enumerate([self.user, self.other]):
            message = Message.objects.create(conversation=chat, sender=user, body='')
            item = ChatAttachment.objects.create(id=uuid4(), message=message, sender_device=devices[i], ciphertext_size=8,
                ciphertext_sha256='a' * 64, request_digest='b' * 64, expires_at=timezone.now() + timedelta(hours=24))
            for device in devices: ChatAttachmentRecipient.objects.create(attachment=item, device=device, envelope='encrypted')
            attachments.append(item)
        path = relay_path(attachments[0].pk); path.parent.mkdir(parents=True); path.write_bytes(b'encrypted')
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        with patch('core.accounts.timezone.now', return_value=due): self.assertTrue(purge_account(self.user.pk))
        self.assertFalse(path.exists())
        self.assertFalse(ChatDevice.objects.filter(user_id=self.user.pk).exists())
        self.assertTrue(Message.objects.filter(pk=attachments[1].message_id).exists())
        self.assertEqual(attachments[1].recipients.count(), 1)

    def test_deleted_account_upload_cleanup_retries_after_storage_error(self):
        post = Post.objects.create(author=self.user, body='Media')
        post.media.save('proof.txt', ContentFile(b'fixture'))
        name = post.media.name
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        with patch('core.accounts.timezone.now', return_value=due):
            with patch('django.core.files.storage.FileSystemStorage.delete', side_effect=OSError('storage offline')), self.assertLogs('core.upload_cleanup', level='ERROR'), self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(purge_account(self.user.pk))
        self.assertTrue(Path(post.media.path).exists())
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        with patch('django.core.files.storage.FileSystemStorage.delete', side_effect=OSError('storage offline')), self.assertLogs('core.upload_cleanup', level='ERROR'):
            purge_deleted_uploads()
        self.assertTrue(PendingUploadDeletion.objects.filter(name=name).exists())
        purge_deleted_uploads()
        self.assertFalse(PendingUploadDeletion.objects.filter(name=name).exists())
        self.assertFalse(Path(post.media.path).exists())

    def test_shared_upload_is_not_removed_with_one_account(self):
        own = Post.objects.create(author=self.user, body='One')
        own.media.save('shared.txt', ContentFile(b'shared'))
        Post.objects.create(author=self.other, body='Two', media=own.media.name)
        path = Path(own.media.path)
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        with patch('core.accounts.timezone.now', return_value=due), self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(purge_account(self.user.pk))
        self.assertTrue(path.exists())

    def test_permanent_deletion_cleans_hosted_events_and_their_uploads(self):
        event = Event.objects.create(host=self.user, name='Private event', location_name='City', privacy='PRIVATE',
            starts_at=timezone.now() + timedelta(days=1), ends_at=timezone.now() + timedelta(days=2))
        event.cover_image.save('cover.png', ContentFile(b'cover fixture'))
        quest = Quest.objects.create(event=event, kind='MAIN', title='Test', instructions='Test')
        proof = QuestSubmission.objects.create(quest=quest, participant=self.other, media_type='IMAGE')
        proof.media.save('proof.png', ContentFile(b'proof fixture'))
        self.user.profile.avatar.save('avatar.png', ContentFile(b'avatar fixture'))
        other_moment = Post.objects.create(author=self.other, event=event, body='A private moment')
        paths = [Path(event.cover_image.path), Path(proof.media.path), Path(self.user.profile.avatar.path)]
        due = suspend_account(self.user.pk, 'password123', delete=True).deletion_due_at
        with patch('core.accounts.timezone.now', return_value=due), self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(purge_account(self.user.pk))
        self.assertFalse(Event.objects.filter(pk=event.pk).exists())
        self.assertFalse(QuestSubmission.objects.filter(pk=proof.pk).exists())
        self.assertFalse(Conversation.objects.filter(event_id=event.pk).exists())
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertTrue(Post.objects.filter(pk=other_moment.pk).exists())
        self.assertEqual(APIClient().get(f'/api/posts/{other_moment.pk}/').status_code, 404, 'A deleted private event must not publish another attendee\'s moment')
