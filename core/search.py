"""Relevance search shared by the event and people directories.

Score only fields from the already permission-filtered queryset. Keeping the
result as a queryset preserves DRF pagination and relationship filters. This
portable implementation scans searchable text; a larger deployment can replace
it with an indexed search backend without changing either client contract.
"""
import re
import unicodedata

from django.db.models import Case, IntegerField, Value, When


def normalize(text):
    text = unicodedata.normalize("NFKD", (text or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"[^\W_]+", text, flags=re.UNICODE))


def small_typo(left, right):
    """One insertion, deletion, substitution, or adjacent transposition.

    Short terms use literal matches to avoid noisy results for initials.
    """
    if len(left) < 4 or not left.isalpha() or not right.isalpha() or abs(len(left) - len(right)) > 1:
        return False
    if len(left) == len(right):
        differences = [i for i, (a, b) in enumerate(zip(left, right)) if a != b]
        return len(differences) == 1 or (
            len(differences) == 2
            and differences[1] == differences[0] + 1
            and left[differences[0]] == right[differences[1]]
            and left[differences[1]] == right[differences[0]]
        )
    shorter, longer = sorted((left, right), key=len)
    for i, char in enumerate(shorter):
        if char != longer[i]:
            return shorter[i:] == longer[i + 1:]
    return True


def relevance(query, fields):
    """Require every word, allowing matches across name, host, and location."""
    score = 0
    for term in query.split():
        best = 0
        for text, weight in fields:
            words = text.split()
            quality = 100 if term in words else 75 if any(word.startswith(term) for word in words) else 50 if term in text else 0
            if not quality and any(small_typo(term, word) for word in words):
                quality = 15
            best = max(best, quality * weight)
        if not best:
            return 0
        score += best
    # Whole names/titles outrank incidental mentions in descriptions or cities.
    primary_weight = max(weight for _, weight in fields)
    score += max((weight * ((1000 if weight == primary_weight else 100) if text == query else 200 if text.startswith(query) else 0)
                  for text, weight in fields), default=0)
    return score


def ranked_search(queryset, query, fields, tie_breakers):
    query = normalize(query[:100])
    if not query:
        return queryset.none()
    matches = {}
    # No candidate cutoff: older rows remain searchable and counts are complete.
    for row in queryset.order_by().values_list("pk", *fields).iterator(chunk_size=500):
        score = relevance(query, [(normalize(value), weight) for value, weight in zip(row[1:], fields.values())])
        if score:
            matches[row[0]] = score
    if not matches:
        return queryset.none()
    return queryset.filter(pk__in=matches).annotate(
        search_score=Case(*[When(pk=pk, then=Value(score)) for pk, score in matches.items()], output_field=IntegerField())
    ).order_by("-search_score", *tie_breakers, "pk")


EVENT_FIELDS = {"name": 12, "location_name": 8, "host__username": 6, "host__profile__display_name": 6, "description": 2}
PEOPLE_FIELDS = {"username": 12, "profile__display_name": 12, "profile__city": 4}
