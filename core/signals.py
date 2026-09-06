from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from .models import Event, Post, Profile, QuestSubmission


@receiver(post_save, sender=get_user_model())
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance, display_name=instance.username)


def _remove_file_when_unused(storage, name):
    """Delete an upload only after the database no longer references it."""
    if not name:
        return

    def cleanup():
        still_used = (
            Profile.objects.filter(avatar=name).exists()
            or Event.objects.filter(cover_image=name).exists()
            or Post.objects.filter(media=name).exists()
            or QuestSubmission.objects.filter(media=name).exists()
        )
        if not still_used:
            storage.delete(name)

    transaction.on_commit(cleanup)


def _remember_replaced_file(instance, field_name):
    if not instance.pk:
        return
    previous = type(instance).objects.filter(pk=instance.pk).only(field_name).first()
    if not previous:
        return
    old_file = getattr(previous, field_name)
    new_file = getattr(instance, field_name)
    if old_file and old_file.name and old_file.name != getattr(new_file, "name", ""):
        instance._replaced_upload = (old_file.storage, old_file.name)


@receiver(pre_save, sender=Profile)
def remember_replaced_avatar(sender, instance, **kwargs):
    _remember_replaced_file(instance, "avatar")


@receiver(post_save, sender=Profile)
def remove_replaced_avatar(sender, instance, **kwargs):
    replaced = getattr(instance, "_replaced_upload", None)
    if replaced:
        delattr(instance, "_replaced_upload")
        _remove_file_when_unused(*replaced)


@receiver(post_delete, sender=Profile)
def remove_deleted_avatar(sender, instance, **kwargs):
    if instance.avatar and instance.avatar.name:
        _remove_file_when_unused(instance.avatar.storage, instance.avatar.name)


@receiver(pre_save, sender=Post)
def remember_replaced_post_media(sender, instance, **kwargs):
    _remember_replaced_file(instance, "media")


@receiver(post_save, sender=Post)
def remove_replaced_post_media(sender, instance, **kwargs):
    replaced = getattr(instance, "_replaced_upload", None)
    if replaced:
        delattr(instance, "_replaced_upload")
        _remove_file_when_unused(*replaced)


@receiver(post_delete, sender=Post)
def remove_deleted_post_media(sender, instance, **kwargs):
    if instance.media and instance.media.name:
        _remove_file_when_unused(instance.media.storage, instance.media.name)
