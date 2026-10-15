"""Bulk annotations shared by serializers and read endpoints."""
from django.contrib.auth.models import AnonymousUser
from django.db.models import BooleanField, Count, Exists, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import Follow, KarmaRating, PostLike, UserPresence
from .moderation import blocked_user_ids


def with_public_user_stats(queryset, viewer=None):
    viewer = viewer or AnonymousUser()
    karma = KarmaRating.objects.filter(target_id=OuterRef("pk")).values("target_id").annotate(total=Sum("score")).values("total")
    followed = Exists(Follow.objects.filter(follower=viewer, following_id=OuterRef("pk"))) if viewer.is_authenticated else Value(False, output_field=BooleanField())
    return queryset.select_related("profile").annotate(
        follower_count_value=Count("follower_relations", filter=Q(follower_relations__follower__is_active=True), distinct=True),
        following_count_value=Count("following_relations", filter=Q(following_relations__following__is_active=True), distinct=True),
        karma_value=Coalesce(Subquery(karma, output_field=IntegerField()), Value(0)),
        is_followed_value=followed,
        is_online_value=Exists(UserPresence.objects.filter(user_id=OuterRef("pk"), last_seen__gt=timezone.now() - UserPresence.TIMEOUT)),
    )


def with_post_stats(queryset, viewer=None):
    viewer = viewer or AnonymousUser()
    liked = Exists(PostLike.objects.filter(post_id=OuterRef("pk"), user=viewer)) if viewer.is_authenticated else Value(False, output_field=BooleanField())
    return queryset.annotate(
        like_count=Count("likes", distinct=True),
        comment_count=Count("comments", filter=~Q(comments__author_id__in=blocked_user_ids(viewer)), distinct=True),
        liked_by_me_value=liked,
    )
