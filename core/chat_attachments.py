"""Private, opaque attachment relay. No plaintext or private keys belong here."""
import base64
import hashlib
import json
import logging
from datetime import timedelta
from pathlib import Path
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Sum
from django.http import FileResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import ChatAttachment, ChatAttachmentRecipient, ChatDevice, Conversation, Message
from .moderation import blocked_user_ids, check_message_access, visible_conversations

MAX_PLAINTEXT_BYTES = 25 * 1024 * 1024
MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 28
MAX_PENDING_BYTES = 100 * 1024 * 1024
logger = logging.getLogger(__name__)


def uuid_value(value):
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("Invalid device or attachment ID.")


def decoded(value, minimum, maximum):
    if not isinstance(value, str) or len(value) > maximum * 2:
        raise ValidationError("Invalid encrypted envelope or public key.")
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        raise ValidationError("Invalid base64 encoding.")
    if not minimum <= len(raw) <= maximum or not any(raw):
        raise ValidationError("Invalid encrypted envelope or public key size.")
    return raw


def relay_root():
    root = Path(settings.CHAT_ATTACHMENT_ROOT).resolve()
    public = Path(settings.MEDIA_ROOT).resolve()
    if root == public or public in root.parents:
        raise RuntimeError("CHAT_ATTACHMENT_ROOT must not be inside public MEDIA_ROOT.")
    return root


def relay_path(attachment_id):
    return relay_root() / (str(uuid_value(attachment_id)) + ".bin")


def attachment_info(item):
    return {"id": str(item.pk), "expires_at": item.expires_at, "size": item.ciphertext_size,
            "sha256": item.ciphertext_sha256, "available": not item.removed_at and item.expires_at > timezone.now(),
            "removal_reason": item.removal_reason or ("expired" if item.expires_at <= timezone.now() else "")}


def purge_attachment(attachment_id, reason):
    # Do not claim removal until the file has actually been unlinked. Failures
    # remain eligible for the worker's next attempt; downloads still enforce TTL.
    with transaction.atomic():
        if not ChatAttachment.objects.filter(pk=attachment_id).update(ciphertext_size=F("ciphertext_size")):
            return  # A concurrent cascade deletion already removed the row.
        item = ChatAttachment.objects.select_for_update().get(pk=attachment_id)
        relay_path(item.pk).unlink(missing_ok=True)
        item.removed_at = timezone.now(); item.removal_reason = reason
        item.save(update_fields=["removed_at", "removal_reason"])
        item.recipients.update(envelope="")


def purge_expired_attachments():
    # Sweep slightly early so a healthy 2-second worker never keeps bytes past
    # the 24-hour ceiling. Access checks independently reject expired content.
    ids = ChatAttachment.objects.filter(removed_at__isnull=True, expires_at__lte=timezone.now() + timedelta(seconds=30)).values_list("pk", flat=True)
    count = 0
    for item_id in list(ids):
        try:
            purge_attachment(item_id, "expired"); count += 1
        except OSError:
            logger.exception("Could not remove expired relay file %s; retrying on next sweep", item_id)
    # Also remove ciphertext orphaned by a process crash before DB commit.
    root = relay_root()
    if root.exists():
        for path in root.glob("*.bin"):
            try:
                if timezone.now().timestamp() - path.stat().st_mtime > 24 * 60 * 60 - 30:
                    path.unlink(missing_ok=True)
            except FileNotFoundError:
                pass  # Another delivery/cleanup worker removed it.
    return count


def conversation_devices(conversation, viewer=None):
    people = conversation.participants.all()
    if viewer is not None:
        people = people.exclude(pk__in=blocked_user_ids(viewer))
    participants = list(people.values_list("id", flat=True))
    devices = list(ChatDevice.objects.filter(user_id__in=participants).order_by("id"))
    return participants, devices


class ChatDeviceViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request):
        device_id = uuid_value(request.data.get("id")); public_key = request.data.get("public_key")
        decoded(public_key, 32, 32)
        with transaction.atomic():
            # Reserve a write lock before reading: select_for_update is a no-op
            # on SQLite and concurrent read-to-write upgrades otherwise fail.
            get_user_model().objects.filter(pk=request.user.pk).update(last_login=F("last_login"))
            device = ChatDevice.objects.filter(pk=device_id).first()
            if device and (device.user_id != request.user.id or device.public_key != public_key):
                raise PermissionDenied("Device identities cannot be reassigned or have their key replaced.")
            if not device:
                if ChatDevice.objects.filter(user=request.user).count() >= 20:
                    raise ValidationError("Device limit reached. Contact support to remove an old attachment device.")
                device = ChatDevice.objects.create(pk=device_id, user=request.user, public_key=public_key)
        return Response({"id": str(device.pk), "public_key": device.public_key})


class ChatAttachmentViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _recipient(self, request, pk):
        device_id = uuid_value(request.query_params.get("device") if request.method == "GET" else request.data.get("device"))
        recipient = ChatAttachmentRecipient.objects.select_related("attachment__message", "attachment__sender_device").filter(
            attachment_id=uuid_value(pk), device_id=device_id, device__user=request.user,
            attachment__message__conversation__in=visible_conversations(request.user),
        ).exclude(attachment__message__hidden_for=request.user).exclude(attachment__message__sender_id__in=blocked_user_ids(request.user)).first()
        if not recipient or recipient.attachment.message.deleted_for_everyone:
            raise NotFound()
        return recipient

    def create(self, request):
        attachment_id = uuid_value(request.data.get("id"))
        sender_device = ChatDevice.objects.filter(pk=uuid_value(request.data.get("device")), user=request.user).first()
        if not sender_device:
            raise PermissionDenied("Register this device before sending attachments.")
        conversation_id = request.data.get("conversation")
        if not str(conversation_id).isdigit():
            raise ValidationError("Invalid conversation.")
        conversation = Conversation.objects.filter(pk=conversation_id, participants=request.user).first()
        if not conversation:
            raise PermissionDenied("You are not part of this conversation.")
        check_message_access(conversation, request.user)
        body = request.data.get("body", "")
        if not isinstance(body, str):
            raise ValidationError("Invalid caption.")
        body = body.strip()
        if len(body) > 2000:
            raise ValidationError("Caption is too long.")
        upload = request.FILES.get("ciphertext")
        if not upload or not 29 <= upload.size <= MAX_CIPHERTEXT_BYTES:
            raise ValidationError("Choose a non-empty file up to 25 MB.")
        try:
            envelopes = json.loads(request.data.get("envelopes", ""))
        except (ValueError, TypeError):
            raise ValidationError("Invalid encrypted envelopes.")
        if not isinstance(envelopes, dict) or not 1 <= len(envelopes) <= 128:
            raise ValidationError("Invalid recipient device list.")
        for device_id, envelope in envelopes.items():
            uuid_value(device_id); decoded(envelope, 72, 3000)
        digest = hashlib.sha256()
        for chunk in upload.chunks(): digest.update(chunk)
        sha256 = digest.hexdigest(); upload.seek(0)
        request_digest = hashlib.sha256(json.dumps([str(sender_device.pk), conversation.pk, body, sha256, envelopes], sort_keys=True).encode()).hexdigest()
        path = relay_path(attachment_id); written = False
        try:
            with transaction.atomic():
                get_user_model().objects.filter(pk=request.user.pk).update(last_login=F("last_login"))
                existing = ChatAttachment.objects.filter(pk=attachment_id).select_related("message").first()
                if existing:
                    if existing.message.sender_id != request.user.id or existing.request_digest != request_digest:
                        raise ValidationError("Attachment ID is already in use.")
                    from .serializers import MessageSerializer
                    return Response(MessageSerializer(existing.message, context={"request": request}).data)
                participants, devices = conversation_devices(conversation, request.user)
                if set(participants) - {device.user_id for device in devices}:
                    raise ValidationError("Everyone in this chat must open the updated app once to receive encrypted attachments.")
                if set(envelopes) != {str(device.pk) for device in devices}:
                    raise ValidationError("The chat's devices changed. Please try sending again.")
                used = ChatAttachment.objects.filter(message__sender=request.user, removed_at__isnull=True).aggregate(total=Sum("ciphertext_size"))["total"] or 0
                if used + upload.size > MAX_PENDING_BYTES:
                    raise ValidationError("You have 100 MB awaiting delivery. Wait for delivery or expiry before sending more.")
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with path.open("xb") as output:
                    written = True
                    path.chmod(0o600)
                    for chunk in upload.chunks(): output.write(chunk)
                message = Message.objects.create(conversation=conversation, sender=request.user, body=body)
                item = ChatAttachment.objects.create(pk=attachment_id, message=message, sender_device=sender_device,
                    ciphertext_size=upload.size, ciphertext_sha256=sha256, request_digest=request_digest, expires_at=timezone.now() + timedelta(hours=24))
                ChatAttachmentRecipient.objects.bulk_create([ChatAttachmentRecipient(attachment=item, device=device, envelope=envelopes[str(device.pk)]) for device in devices])
                Conversation.objects.filter(pk=conversation.pk).update(updated_at=timezone.now()); conversation.hidden_for.clear()
                from .notification_delivery import queue_message
                queue_message(message)
        except Exception:
            if written: path.unlink(missing_ok=True)
            raise
        from .serializers import MessageSerializer
        return Response(MessageSerializer(message, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        recipient = self._recipient(request, pk); item = recipient.attachment
        if item.expires_at <= timezone.now() and not item.removed_at:
            purge_attachment(item.pk, "expired"); item.refresh_from_db(); recipient.refresh_from_db()
        return Response({**attachment_info(item), "envelope": recipient.envelope, "sender_device": str(item.sender_device_id),
                         "sender_public_key": item.sender_device.public_key, "sender": item.message.sender_id,
                         "conversation": item.message.conversation_id})

    @action(detail=True, methods=["get"])
    def content(self, request, pk=None):
        recipient = self._recipient(request, pk); item = recipient.attachment
        if item.removed_at or item.expires_at <= timezone.now():
            if not item.removed_at: purge_attachment(item.pk, "expired")
            return Response({"detail": "This attachment has left the relay. Ask the sender to resend it."}, status=410)
        try:
            response = FileResponse(relay_path(item.pk).open("rb"), as_attachment=True, filename=str(item.pk) + ".bin", content_type="application/octet-stream")
        except FileNotFoundError:
            return Response({"detail": "Attachment no longer available. Ask the sender to resend it."}, status=410)
        response["Cache-Control"] = "private, no-store"; response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=["post"], url_path="saved")
    def saved(self, request, pk=None):
        recipient = self._recipient(request, pk); item = recipient.attachment
        if request.data.get("sha256") != item.ciphertext_sha256:
            raise ValidationError("The saved attachment does not match the relay copy.")
        with transaction.atomic():
            ChatAttachment.objects.filter(pk=item.pk).update(ciphertext_size=F("ciphertext_size"))
            item = ChatAttachment.objects.select_for_update().get(pk=item.pk)
            ChatAttachmentRecipient.objects.filter(pk=recipient.pk, saved_at__isnull=True).update(saved_at=timezone.now())
            if not item.removed_at and not item.recipients.filter(saved_at__isnull=True).exists():
                purge_attachment(item.pk, "delivered")
        return Response({"saved": True})

    @action(detail=False, methods=["get"])
    def pending(self, request):
        device_id = uuid_value(request.query_params.get("device"))
        recipients = ChatAttachmentRecipient.objects.filter(
            device_id=device_id, device__user=request.user, saved_at__isnull=True,
            attachment__removed_at__isnull=True, attachment__expires_at__gt=timezone.now(),
            attachment__message__conversation__in=visible_conversations(request.user),
            attachment__message__deleted_for_everyone=False,
        ).exclude(attachment__message__hidden_for=request.user).exclude(attachment__message__sender_id__in=blocked_user_ids(request.user)).select_related("attachment__message").order_by("attachment__created_at")[:100]
        return Response([{"id": str(r.attachment_id), "conversation": r.attachment.message.conversation_id,
                          "sender": r.attachment.message.sender_id, "sha256": r.attachment.ciphertext_sha256} for r in recipients])
