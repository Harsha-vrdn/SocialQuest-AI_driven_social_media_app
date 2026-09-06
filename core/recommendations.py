"""Deterministic, explainable feed and event recommendations.

The rankers deliberately work on a bounded, recent candidate set. They are a
good first production step before moving the same signals to a feature store or
an offline model as the community grows.
"""
from collections import Counter
from math import asin, cos, radians, sin, sqrt

from django.db.models import Count, Q
from django.utils import timezone

from .models import Attendance, Event, Follow, Post


MAX_CANDIDATES = 300


def _city_matches(city, location):
    city_words = {word for word in (city or "").lower().replace(",", " ").split() if len(word) > 2}
    location_words = {word for word in (location or "").lower().replace(",", " ").split() if len(word) > 2}
    return bool(city_words and city_words.intersection(location_words))


def _distance_km(latitude, longitude, other_latitude, other_longitude):
    """Great-circle distance for optional event and device coordinates."""
    earth_radius_km = 6371.0
    lat_delta = radians(other_latitude - latitude)
    lon_delta = radians(other_longitude - longitude)
    start_lat = radians(latitude)
    end_lat = radians(other_latitude)
    arc = sin(lat_delta / 2) ** 2 + cos(start_lat) * cos(end_lat) * sin(lon_delta / 2) ** 2
    return earth_radius_km * 2 * asin(sqrt(arc))


def rank_posts(user, queryset):
    """Rank recent posts with social proximity, shared context, and freshness."""
    following_ids = set(Follow.objects.filter(follower=user).values_list("following_id", flat=True))
    accepted_event_ids = set(
        Attendance.objects.filter(user=user, status=Attendance.Status.ACCEPTED).values_list("event_id", flat=True)
    )
    now = timezone.now()
    candidates = list(
        queryset.select_related("author", "author__profile", "event", "quest")
        .annotate(recommendation_likes=Count("likes", distinct=True), recommendation_comments=Count("comments", distinct=True))
        .order_by("-created_at")[:MAX_CANDIDATES]
    )
    ranked = []
    for post in candidates:
        age_hours = max(0, (now - post.created_at).total_seconds() / 3600)
        freshness = max(0, 32 - age_hours * 0.45)
        social = 58 if post.author_id in following_ids else 0
        own_post = 28 if post.author_id == user.id else 0
        shared_event = 26 if post.event_id in accepted_event_ids else 0
        engagement = min(post.recommendation_likes, 8) * 2 + min(post.recommendation_comments, 5) * 3
        media_bonus = 5 if post.media else 0
        score = round(freshness + social + own_post + shared_event + engagement + media_bonus, 2)
        if post.author_id in following_ids:
            reason = "From someone you follow"
        elif post.event_id in accepted_event_ids:
            reason = "From an event you joined"
        elif engagement >= 12:
            reason = "Popular in the community"
        else:
            reason = "New in your community"
        ranked.append((score, post, reason))
    return sorted(ranked, key=lambda item: (item[0], item[1].created_at), reverse=True)


def rank_events(user, latitude=None, longitude=None):
    """Rank available events by location, social proof, capacity, and timing."""
    now = timezone.now()
    following_ids = set(Follow.objects.filter(follower=user).values_list("following_id", flat=True))
    friends_going = Counter(
        Attendance.objects.filter(
            user_id__in=following_ids,
            status=Attendance.Status.ACCEPTED,
            event__ends_at__gt=now,
        ).values_list("event_id", flat=True)
    )
    existing_event_ids = set(Attendance.objects.filter(user=user).values_list("event_id", flat=True))
    candidates = list(
        Event.objects.filter(ends_at__gt=now, privacy=Event.Privacy.PUBLIC)
        .exclude(host=user)
        .exclude(id__in=existing_event_ids)
        .select_related("host", "host__profile")
        .annotate(recommendation_going=Count("attendances", filter=Q(attendances__status=Attendance.Status.ACCEPTED)))
        .order_by("starts_at")[:MAX_CANDIDATES]
    )
    city = getattr(user.profile, "city", "")
    ranked = []
    for event in candidates:
        score = 0
        reasons = []
        friend_count = friends_going[event.id]
        if event.host_id in following_ids:
            score += 38
            reasons.append("Hosted by someone you follow")
        if friend_count:
            score += min(friend_count, 3) * 18
            reasons.append(f"{friend_count} friend{'s' if friend_count != 1 else ''} going")
        if _city_matches(city, event.location_name):
            score += 32
            reasons.append("Near your city")
        if latitude is not None and longitude is not None and event.latitude is not None and event.longitude is not None:
            distance = _distance_km(latitude, longitude, event.latitude, event.longitude)
            if distance <= 5:
                score += 62
                reasons.insert(0, "Very close to you")
            elif distance <= 25:
                score += 46
                reasons.insert(0, "Near your current location")
            elif distance <= 80:
                score += 22
                reasons.insert(0, "Within reach today")
        if event.has_started:
            score += 16
            reasons.append("Happening now")
        else:
            hours_until = (event.starts_at - now).total_seconds() / 3600
            if hours_until <= 24:
                score += 26
                reasons.append("Starting soon")
            elif hours_until <= 24 * 7:
                score += 12
        if event.recommendation_going < event.capacity:
            score += 8
        if not reasons:
            reasons.append("A new community plan")
        ranked.append((score, event, " · ".join(reasons[:2])))
    return sorted(ranked, key=lambda item: (item[0], -item[1].starts_at.timestamp()), reverse=True)
