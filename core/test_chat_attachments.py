import base64
import hashlib
import json
import tempfile
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .chat_attachments import purge_expired_attachments, relay_path
from .models import ChatAttachment, ChatAttachmentRecipient, ChatDevice, Conversation, ConversationReadState, Message


class AttachmentTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_override = override_settings(CHAT_ATTACHMENT_ROOT=Path(self.directory.name) / 'private', MEDIA_ROOT=Path(self.directory.name) / 'public')
        self.settings_override.enable(); self.addCleanup(self.settings_override.disable)
        User = get_user_model()
        self.alex = User.objects.create_user('alex'); self.sam = User.objects.create_user('sam'); self.other = User.objects.create_user('other')
        self.chat = Conversation.objects.create(is_group=True); self.chat.participants.add(self.alex, self.sam)
        self.client = APIClient(); self.client.force_authenticate(self.alex)
        self.alex_device = self.device(self.alex); self.sam_device = self.device(self.sam)
        self.ciphertext = b'opaque-ciphertext-with-authentication-tag' * 3
        self.digest = hashlib.sha256(self.ciphertext).hexdigest()

    def device(self, user):
        return ChatDevice.objects.create(user=user, public_key=base64.b64encode(uuid4().bytes * 2).decode())

    def upload(self, attachment_id=None, **overrides):
        data = {'id': str(attachment_id or uuid4()), 'device': str(self.alex_device.id), 'conversation': self.chat.id,
                'envelopes': json.dumps({str(d.id): base64.b64encode(b'encrypted-key-envelope' * 8).decode() for d in ChatDevice.objects.filter(user__in=[self.alex, self.sam])}),
                'ciphertext': SimpleUploadedFile('encrypted.bin', self.ciphertext, 'application/octet-stream'), 'body': ''}
        data.update(overrides)
        return self.client.post('/api/chat-attachments/', data, format='multipart')

    def url(self, item, action='', device=None):
        return f'/api/chat-attachments/{item.pk}/{action}' + (f'?device={(device or self.alex_device).pk}' if action != 'saved/' else '')

    def save(self, item, device):
        self.client.force_authenticate(device.user)
        return self.client.post(self.url(item, 'saved/'), {'device': str(device.pk), 'sha256': self.digest}, format='json')

    def test_upload_is_private_has_24_hour_ttl_and_no_plaintext_metadata(self):
        response = self.upload(); self.assertEqual(response.status_code, 201, response.data)
        item = ChatAttachment.objects.get()
        self.assertAlmostEqual((item.expires_at - item.created_at).total_seconds(), 86400, delta=1)
        self.assertEqual(relay_path(item.pk).read_bytes(), self.ciphertext)
        self.assertEqual(relay_path(item.pk).stat().st_mode & 0o777, 0o600)
        self.assertNotIn('url', response.data['attachment']); self.assertNotIn('envelope', response.data['attachment'])
        download = self.client.get(self.url(item, 'content/'))
        self.assertEqual(download.status_code, 200); self.assertEqual(b''.join(download.streaming_content), self.ciphertext); download.close()
        self.assertEqual(download['Cache-Control'], 'private, no-store')
        self.assertFalse((Path(self.directory.name) / 'public').exists())

    def test_retries_are_idempotent_and_do_not_extend_expiry(self):
        attachment_id = uuid4(); self.upload(attachment_id); expires = ChatAttachment.objects.get().expires_at
        self.assertEqual(self.upload(attachment_id).status_code, 200)
        self.assertEqual(Message.objects.count(), 1); self.assertEqual(ChatAttachment.objects.get().expires_at, expires)
        self.assertEqual(self.upload(attachment_id, body='changed request').status_code, 400)

    def test_all_devices_must_save_before_early_deletion(self):
        second = self.device(self.sam); self.upload(); item = ChatAttachment.objects.get()
        self.assertEqual(self.save(item, self.alex_device).status_code, 200)
        self.assertEqual(self.save(item, self.sam_device).status_code, 200)
        self.assertTrue(relay_path(item.pk).exists())
        self.assertEqual(self.save(item, second).status_code, 200)
        item.refresh_from_db(); self.assertEqual(item.removal_reason, 'delivered')
        self.assertFalse(relay_path(item.pk).exists()); self.assertFalse(item.recipients.exclude(envelope='').exists())
        self.assertEqual(self.save(item, second).status_code, 200)
        self.assertFalse(ConversationReadState.objects.exists())

    def test_24_hour_access_cutoff_without_worker(self):
        self.upload(); item = ChatAttachment.objects.get()
        item.expires_at = timezone.now() - timedelta(seconds=1); item.save()
        self.assertEqual(self.client.get(self.url(item, 'content/')).status_code, 410)
        self.assertFalse(relay_path(item.pk).exists())
        self.assertEqual(self.client.get(self.url(item)).data['envelope'], '')

    def test_scheduled_cleanup_deletes_expired_bytes_and_envelopes(self):
        self.upload(); item = ChatAttachment.objects.get()
        item.expires_at = timezone.now() + timedelta(seconds=20); item.save()
        self.assertEqual(purge_expired_attachments(), 1); self.assertFalse(relay_path(item.pk).exists())
        self.assertEqual(purge_expired_attachments(), 0)

    def test_nonparticipants_and_other_users_devices_cannot_access(self):
        self.upload(); item = ChatAttachment.objects.get()
        self.assertEqual(self.client.get(self.url(item, device=self.sam_device)).status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url(item, 'content/')).status_code, 404)
        self.assertEqual(self.client.get(f'/api/conversations/{self.chat.id}/attachment-devices/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/chat-attachments/pending/?device={self.sam_device.pk}').data, [])

    def test_removed_members_and_hidden_messages_deny_download(self):
        self.upload(); item = ChatAttachment.objects.get()
        item.message.hidden_for.add(self.alex)
        self.assertEqual(self.client.get(self.url(item, 'content/')).status_code, 404)
        self.chat.participants.remove(self.sam); self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.get(self.url(item, 'content/', self.sam_device)).status_code, 404)

    def test_missing_devices_or_incomplete_envelopes_are_rejected(self):
        self.assertEqual(self.upload(envelopes='{}').status_code, 400)
        self.assertEqual(self.upload(envelopes=json.dumps({str(self.alex_device.pk): base64.b64encode(b'x' * 80).decode()})).status_code, 400)
        self.sam_device.delete()
        self.assertEqual(self.upload().status_code, 400)
        self.assertFalse(ChatAttachment.objects.exists())

    def test_ack_requires_own_device_and_matching_hash(self):
        self.upload(); item = ChatAttachment.objects.get()
        for device, digest, code in [(self.sam_device, self.digest, 404), (self.alex_device, 'bad', 400)]:
            response = self.client.post(self.url(item, 'saved/'), {'device': str(device.pk), 'sha256': digest}, format='json')
            self.assertEqual(response.status_code, code)
        self.assertFalse(ChatAttachmentRecipient.objects.exclude(saved_at=None).exists())

    def test_devices_are_immutable_and_validated(self):
        path = '/api/chat-devices/'
        same = {'id': str(self.alex_device.pk), 'public_key': self.alex_device.public_key}
        self.assertEqual(self.client.post(path, same, format='json').status_code, 200)
        same['public_key'] = self.sam_device.public_key
        self.assertEqual(self.client.post(path, same, format='json').status_code, 403)
        same['id'] = str(self.sam_device.pk)
        self.assertEqual(self.client.post(path, same, format='json').status_code, 403)
        for key in ['bad', '!', base64.b64encode(b'\x00' * 32).decode()]:
            self.assertEqual(self.client.post(path, {'id': str(uuid4()), 'public_key': key}, format='json').status_code, 400)

    def test_pending_only_returns_unsaved_authorized_devices_and_no_keys(self):
        self.upload(); item = ChatAttachment.objects.get()
        response = self.client.get(f'/api/chat-attachments/pending/?device={self.alex_device.pk}')
        self.assertEqual(len(response.data), 1); self.assertNotIn('envelope', response.data[0])
        self.save(item, self.alex_device)
        self.assertEqual(self.client.get(f'/api/chat-attachments/pending/?device={self.alex_device.pk}').data, [])

    def test_empty_and_malformed_uploads_fail_without_messages(self):
        self.assertEqual(self.upload(ciphertext=SimpleUploadedFile('empty', b'')).status_code, 400)
        self.assertEqual(self.upload(envelopes='nope').status_code, 400)
        self.assertEqual(self.upload(id='../../outside').status_code, 400)
        self.assertFalse(Message.objects.exists())

    def test_delete_for_everyone_removes_relay_copy(self):
        self.upload(); item = ChatAttachment.objects.get()
        response = self.client.delete(f'/api/messages/{item.message_id}/?scope=everyone')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(relay_path(item.pk).exists())

    def test_relay_cannot_be_configured_under_public_media(self):
        with override_settings(CHAT_ATTACHMENT_ROOT=Path(self.directory.name) / 'public' / 'attachments'):
            with self.assertRaises(RuntimeError): relay_path(uuid4())

    def test_pending_quota_and_ciphertext_size_limits(self):
        with patch('core.chat_attachments.MAX_PENDING_BYTES', len(self.ciphertext)):
            self.assertEqual(self.upload().status_code, 201)
            self.assertEqual(self.upload().status_code, 400)
        with patch('core.chat_attachments.MAX_CIPHERTEXT_BYTES', len(self.ciphertext) - 1):
            self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(Message.objects.count(), 1)

    def test_disk_deletion_failure_does_not_claim_removed_or_erase_envelopes(self):
        self.upload(); item = ChatAttachment.objects.get()
        self.save(item, self.alex_device)
        with patch('pathlib.Path.unlink', side_effect=OSError('read-only filesystem')):
            with self.assertRaises(OSError): self.save(item, self.sam_device)
        item.refresh_from_db()
        self.assertIsNone(item.removed_at); self.assertTrue(item.recipients.exclude(envelope='').exists())
        self.assertTrue(relay_path(item.pk).exists())
        self.assertEqual(self.save(item, self.sam_device).status_code, 200)
        self.assertFalse(relay_path(item.pk).exists())
