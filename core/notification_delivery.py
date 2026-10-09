"""Device delivery, independent of the in-app Alerts feed."""
import base64
import json
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Attendance, Notification, NotificationDelivery, NotificationDevice, UserPresence
from .serializers import NotificationSerializer


def chats_are_open(user_id):
    return UserPresence.objects.filter(user_id=user_id, chats_open=True, last_seen__gt=timezone.now() - UserPresence.TIMEOUT).exists()


def suppress_chat_deliveries(user_id):
    NotificationDelivery.objects.filter(device__user_id=user_id, message__isnull=False, status='PENDING').update(status='SUPPRESSED')


def queue_notification(notification):
    data = NotificationSerializer(notification).data
    payload = {
        'title': 'SocialQuest', 'body': data['text'][:240], 'kind': notification.kind,
        'notification_id': notification.id, 'recipient_id': notification.recipient_id,
        'event_id': data['event']['id'] if data['event'] else None,
        'post_id': data.get('comment_post_id'),
    }
    devices = NotificationDevice.objects.filter(user=notification.recipient, enabled=True)
    if notification.kind == Notification.Kind.EVENT_ENDED and notification.attendance:
        devices = devices.filter(updated_at__lte=notification.attendance.event.ends_at)
    for device in devices:
        NotificationDelivery.objects.get_or_create(device=device, notification=notification, defaults={'payload': payload})


def queue_message(message):
    for recipient in message.conversation.participants.exclude(id=message.sender_id):
        if chats_are_open(recipient.id):
            continue
        payload = {
            'title': message.sender.profile.display_name or message.sender.username,
            'body': message.body[:240], 'kind': 'MESSAGE', 'conversation_id': message.conversation_id,
            'message_id': message.id, 'recipient_id': recipient.id,
        }
        for device in NotificationDevice.objects.filter(user=recipient, enabled=True):
            NotificationDelivery.objects.get_or_create(device=device, message=message, defaults={'payload': payload})


def ensure_ended_notifications(user_id=None):
    attendances = Attendance.objects.filter(status=Attendance.Status.ACCEPTED, event__ends_at__lte=timezone.now())
    if user_id is not None:
        attendances = attendances.filter(user_id=user_id)
    # Exclude already-created events before iterating, including the worker's global scan.
    attendances = attendances.exclude(notifications__kind=Notification.Kind.EVENT_ENDED)
    for attendance in attendances.select_related('event'):
        Notification.objects.get_or_create(recipient_id=attendance.user_id, attendance=attendance, kind=Notification.Kind.EVENT_ENDED)


def webpush_public_key():
    path = Path(settings.WEBPUSH_PRIVATE_KEY)
    if not path.is_file():
        return None
    from cryptography.hazmat.primitives import serialization
    private = serialization.load_pem_private_key(path.read_bytes(), password=None)
    public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(public).rstrip(b'=').decode()


def validate_address(transport, address):
    if not isinstance(address, dict):
        raise ValidationError({'address': 'Provide a notification address.'})
    if transport == 'LOCAL':
        return {}
    if transport == 'EXPO':
        token = address.get('token', '')
        if not isinstance(token, str) or not re.fullmatch(r'(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]', token):
            raise ValidationError({'address': 'Invalid Expo push token.'})
        return {'token': token}
    if transport != 'WEB':
        raise ValidationError({'transport': 'Choose LOCAL, WEB, or EXPO.'})
    endpoint = address.get('endpoint', '')
    if not isinstance(endpoint, str) or len(endpoint) > 3000:
        raise ValidationError({'address': 'Invalid browser subscription.'})
    try:
        parsed = urlparse(endpoint)
        port = parsed.port
    except ValueError:
        raise ValidationError({'address': 'Invalid browser push endpoint.'})
    host = parsed.hostname or ''
    allowed = host in ('fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com')
    if parsed.scheme != 'https' or not allowed or parsed.username or parsed.password or port not in (None, 443):
        raise ValidationError({'address': 'Unsupported browser push endpoint.'})
    keys = address.get('keys', {})
    if not isinstance(keys, dict):
        raise ValidationError({'address': 'Invalid browser keys.'})
    for name, size in [('p256dh', 65), ('auth', 16)]:
        try:
            value = keys[name]
            if not isinstance(value, str) or len(value) > 200:
                raise ValueError()
            raw = base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True)
            if len(raw) != size:
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            raise ValidationError({'address': 'Invalid browser encryption keys.'})
    return {'endpoint': endpoint, 'keys': {name: keys[name] for name in ('p256dh', 'auth')}}


def should_suppress(delivery):
    if not delivery.device.enabled or not delivery.device.user.is_active:
        return True
    if delivery.created_at < timezone.now() - timedelta(hours=1):
        return True
    if delivery.message_id:
        message = delivery.message
        return (message.deleted_for_everyone or message.hidden_for.filter(id=delivery.device.user_id).exists()
                or not message.conversation.participants.filter(id=delivery.device.user_id).exists()
                or chats_are_open(delivery.device.user_id))
    return bool(delivery.notification and delivery.notification.read_at)


def claim_delivery(delivery):
    if should_suppress(delivery):
        NotificationDelivery.objects.filter(pk=delivery.pk, status='PENDING').update(status='SUPPRESSED')
        return False
    return bool(NotificationDelivery.objects.filter(pk=delivery.pk, status='PENDING').update(
        status='SENDING', attempts=F('attempts') + 1, available_at=timezone.now() + timedelta(minutes=2)))


def delivery_payload(delivery):
    return {**delivery.payload, 'delivery_id': delivery.id, 'device_id': str(delivery.device_id)}


def poll_local(device):
    result = []
    for delivery in device.deliveries.filter(status='PENDING').select_related('device__user', 'message__conversation', 'notification').order_by('id')[:50]:
        if claim_delivery(delivery):
            result.append(delivery_payload(delivery))
            NotificationDelivery.objects.filter(pk=delivery.pk).update(status='SENT')
    return result


def expo_request(path, body):
    headers = {'Content-Type': 'application/json'}
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers['Authorization'] = 'Bearer ' + settings.EXPO_PUSH_ACCESS_TOKEN
    response = requests.post('https://exp.host/--/api/v2/push/' + path, json=body, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


def send_delivery(delivery):
    if not claim_delivery(delivery):
        return
    try:
        # Re-check immediately before calling the provider, after acquiring the claim.
        delivery.device.refresh_from_db()
        if should_suppress(delivery):
            delivery.status = 'SUPPRESSED'
        elif delivery.device.transport == 'WEB':
            from pywebpush import webpush
            webpush(subscription_info=delivery.device.address, data=json.dumps(delivery_payload(delivery)),
                    vapid_private_key=settings.WEBPUSH_PRIVATE_KEY, vapid_claims={'sub': settings.WEBPUSH_SUBJECT}, timeout=10, ttl=300)
            delivery.status = 'SENT'
        else:
            result = expo_request('send', {
                'to': delivery.device.address['token'], 'title': delivery.payload['title'], 'body': delivery.payload['body'],
                'data': delivery_payload(delivery), 'sound': 'default', 'ttl': 300,
                'channelId': 'chat' if delivery.message_id else 'activity',
            })
            ticket = result.get('data', {})
            if not isinstance(ticket, dict) or ticket.get('status') != 'ok':
                code = ticket.get('details', {}).get('error', 'PushRejected') if isinstance(ticket, dict) else 'PushRejected'
                if code == 'DeviceNotRegistered':
                    delivery.device.enabled = False; delivery.device.save(update_fields=['enabled'])
                raise ValueError(code)
            delivery.receipt_id = ticket.get('id', '')
            if not delivery.receipt_id:
                raise ValueError('PushRejected')
            delivery.status = 'ACCEPTED'
            delivery.available_at = timezone.now() + timedelta(minutes=15)
        delivery.save(update_fields=['status', 'receipt_id', 'available_at'])
    except Exception as error:
        response = getattr(error, 'response', None)
        code = getattr(response, 'status_code', None)
        if code in (404, 410):
            delivery.device.enabled = False; delivery.device.save(update_fields=['enabled'])
        delivery.refresh_from_db()
        delivery.status = 'FAILED' if delivery.attempts >= 5 or not delivery.device.enabled else 'PENDING'
        delivery.available_at = timezone.now() + timedelta(seconds=min(300, 5 * 2 ** delivery.attempts))
        # Store only error categories; provider responses can contain credentials or payloads.
        safe_codes = {'DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig', 'MessageRateExceeded', 'PushRejected'}
        delivery.last_error = str(error) if isinstance(error, ValueError) and str(error) in safe_codes else type(error).__name__
        delivery.save(update_fields=['status', 'available_at', 'last_error'])


def check_receipts():
    pending = list(NotificationDelivery.objects.filter(status='ACCEPTED', available_at__lte=timezone.now()).select_related('device')[:100])
    if not pending:
        return
    try:
        receipts = expo_request('getReceipts', {'ids': [item.receipt_id for item in pending]})['data']
    except Exception:
        NotificationDelivery.objects.filter(id__in=[item.id for item in pending]).update(available_at=timezone.now() + timedelta(minutes=5))
        return
    for delivery in pending:
        receipt = receipts.get(delivery.receipt_id)
        if receipt:
            delivery.status = 'SENT' if receipt.get('status') == 'ok' else 'FAILED'
            delivery.last_error = receipt.get('details', {}).get('error', '')[:80]
            if delivery.last_error == 'DeviceNotRegistered':
                NotificationDevice.objects.filter(pk=delivery.device_id).update(enabled=False)
        elif delivery.created_at < timezone.now() - timedelta(hours=24):
            delivery.status = 'FAILED'; delivery.last_error = 'ReceiptUnavailable'
        delivery.available_at = timezone.now() + timedelta(minutes=5)
        delivery.save(update_fields=['status', 'last_error', 'available_at'])


def deliver_pending():
    ensure_ended_notifications()
    # Recover interrupted workers without making concurrent workers send the same row.
    NotificationDelivery.objects.filter(status='SENDING', available_at__lt=timezone.now()).update(status='PENDING')
    pending = NotificationDelivery.objects.filter(status='PENDING', available_at__lte=timezone.now()).exclude(device__transport='LOCAL')
    count = 0
    for delivery in pending.select_related('device__user', 'message__conversation', 'notification').order_by('id')[:50]:
        send_delivery(delivery); count += 1
    check_receipts()
    NotificationDelivery.objects.filter(created_at__lt=timezone.now() - timedelta(days=7)).delete()
    return count
