import logging
from django.core.files.storage import default_storage
from .models import Event, PendingUploadDeletion, Post, Profile, QuestSubmission

logger = logging.getLogger(__name__)


def cleanup_upload(name, storage=default_storage):
    try:
        used = (Profile.objects.filter(avatar=name).exists() or Event.objects.filter(cover_image=name).exists()
                or Post.objects.filter(media=name).exists() or QuestSubmission.objects.filter(media=name).exists())
        if not used:
            storage.delete(name)
        PendingUploadDeletion.objects.filter(name=name).delete()
    except Exception:
        # The durable row survives the account and is retried by purge_accounts.
        logger.exception("Could not finish removing an unused public upload; retry queued")


def purge_deleted_uploads():
    for name in list(PendingUploadDeletion.objects.values_list("name", flat=True)[:500]):
        cleanup_upload(name)
