"""Account suspension, recoverable deletion, and immediate permanent erasure."""
import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (AuthSession, ChatAttachment, ChatAttachmentRecipient,
                     Notification, NotificationDelivery, Profile)

User = get_user_model()
logger = logging.getLogger(__name__)
DELETION_GRACE = timedelta(days=90)


def locked_user(user_id):
    # Reserve the write before reading: also serializes login/purge on SQLite,
    # whose select_for_update alone does not acquire a row lock.
    if not User.objects.filter(pk=user_id).update(last_login=F("last_login")):
        return None
    return User.objects.select_for_update().get(pk=user_id)


def login_account(username, password):
    if not isinstance(username, str) or not isinstance(password, str) or len(password) > 1024:
        return None
    candidate = User.objects.filter(username=username).first()
    if not candidate:
        User().set_password(password)  # Match the password hashing work for unknown users.
        return None
    if not candidate.check_password(password):
        return None
    return finish_login(candidate)


@transaction.atomic
def finish_login(candidate):
    user = locked_user(candidate.pk)
    if not user or user.password != candidate.password:
        return None  # Credentials changed while the password was being checked.
    profile = user.profile
    state = profile.account_state
    now = timezone.now()
    # The cutoff is enforced even if the physical deletion worker is delayed.
    if state == Profile.AccountState.PENDING_DELETION and (not profile.deletion_due_at or now >= profile.deletion_due_at):
        return None
    if not user.is_active and state == Profile.AccountState.ACTIVE:
        return None  # Never reactivate an administrator-disabled account.
    restored = state != Profile.AccountState.ACTIVE
    if restored:
        profile.account_state = Profile.AccountState.ACTIVE
        profile.deletion_due_at = None
        profile.save(update_fields=["account_state", "deletion_due_at"])
        user.is_active = True
    user.last_login = now
    user.save(update_fields=["is_active", "last_login"])
    return user, AuthSession.objects.create(user=user), state


@transaction.atomic
def suspend_account(user_id, password, *, delete=False):
    user = locked_user(user_id)
    if not user or not user.is_active or not user.check_password(password):
        raise ValidationError({"password": "Enter your current password to continue."})
    profile = user.profile
    profile.account_state = Profile.AccountState.PENDING_DELETION if delete else Profile.AccountState.DEACTIVATED
    profile.deletion_due_at = timezone.now() + DELETION_GRACE if delete else None
    profile.save(update_fields=["account_state", "deletion_due_at"])
    user.is_active = False
    user.save(update_fields=["is_active"])
    revoke_sessions(user)
    user.presence_sessions.all().delete()
    user.notification_devices.update(enabled=False)
    NotificationDelivery.objects.filter(device__user=user, status__in=["PENDING", "SENDING"]).update(status="SUPPRESSED")
    return profile


def revoke_sessions(user):
    user.auth_sessions.all().delete()
    for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if session.get_decoded().get("_auth_user_id") == str(user.pk):
            session.delete()


def erase_account(user):
    """Erase owned rows and files; also handle devices protected by the relay."""
    from .chat_attachments import purge_attachment
    revoke_sessions(user)
    # Event deletion also cascades to other senders' messages in that event's
    # group. Purge those relay files before the relational cascade removes them.
    attachments = ChatAttachment.objects.filter(
        Q(message__sender=user) | Q(message__conversation__event__host=user),
    )
    for attachment in list(attachments):
        purge_attachment(attachment.pk, "account")
        attachment.delete()
    ChatAttachmentRecipient.objects.filter(device__user=user).delete()
    # Cached delivery payloads can contain a name or authored text even when
    # the actor FK would merely become NULL during User's deletion cascade.
    Notification.objects.filter(actor=user).delete()
    user.delete()


@transaction.atomic
def delete_account(user_id):
    """Immediate, authenticated deletion, independent of the recovery window."""
    user = locked_user(user_id)
    if not user:
        return False
    erase_account(user)
    return True


@transaction.atomic
def purge_account(user_id):
    user = locked_user(user_id)
    if not user or user.profile.account_state != Profile.AccountState.PENDING_DELETION:
        return False
    due = user.profile.deletion_due_at
    if not due or due > timezone.now():
        return False
    erase_account(user)
    return True


def purge_due_accounts():
    ids = Profile.objects.filter(account_state=Profile.AccountState.PENDING_DELETION,
                                 deletion_due_at__lte=timezone.now()).values_list("user_id", flat=True)
    count = 0
    for user_id in list(ids):
        try:
            count += bool(purge_account(user_id))
        except Exception:
            logger.exception("Account deletion failed for user %s; retry on the next sweep", user_id)
    return count
