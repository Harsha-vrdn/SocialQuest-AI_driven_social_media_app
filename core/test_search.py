from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Attendance, Event, Follow
from .search import normalize, small_typo

User = get_user_model()


class SmartSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.viewer = User.objects.create_user("viewer")
        self.host = User.objects.create_user("maya.rao")
        self.host.profile.display_name = "Máya Rao"
        self.host.profile.city = "Bengaluru"
        self.host.profile.save()
        self.client.force_authenticate(self.viewer)

    def event(self, name="Coffee conversations", **kwargs):
        values = dict(host=self.host, name=name, description="Meet the community.", location_name="Bengaluru",
                      starts_at=timezone.now() + timedelta(days=1), ends_at=timezone.now() + timedelta(days=1, hours=2))
        values.update(kwargs)
        return Event.objects.create(**values)

    def search(self, kind, query, **kwargs):
        response = self.client.get(f"/api/{kind}/", {"q": query, **kwargs})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_event_words_match_across_fields_in_any_order(self):
        event = self.event()
        self.event("Coffee conversations", location_name="Mumbai", host=self.viewer)
        data = self.search("events", "  bengaluru   COFFEE maya ")
        self.assertEqual([item["id"] for item in data["results"]], [event.id])

    def test_typo_and_accent_matching(self):
        event = self.event("Café conversations")
        self.assertEqual(self.search("events", "cafe converstaions")["results"][0]["id"], event.id)
        self.assertEqual(self.search("people", "@maay rao")["results"][0]["id"], self.host.id)
        self.assertEqual(self.search("people", "bengalru maya")["results"][0]["id"], self.host.id)

    def test_exact_names_rank_above_prefixes_and_description_matches(self):
        mention = self.event("Morning walk", description="Coffee afterwards")
        prefix = self.event("Coffee conversations")
        exact = self.event("Coffee")
        self.assertEqual([item["id"] for item in self.search("events", "coffee")["results"]], [exact.id, prefix.id, mention.id])

    def test_people_exact_handle_ranks_above_city_and_partial_matches(self):
        partial = User.objects.create_user("mayarao_fan")
        city = User.objects.create_user("a_city_match")
        city.profile.city = "Mayarao"
        city.profile.save()
        exact = User.objects.create_user("mayarao")
        result = self.search("people", "@mayarao")["results"]
        self.assertEqual([item["id"] for item in result], [exact.id, partial.id, city.id])

    def test_requires_all_terms_and_does_not_fuzz_short_names(self):
        self.event()
        self.assertEqual(self.search("events", "coffee mountain")["count"], 0)
        self.assertEqual(self.search("people", "mya")["count"], 0)

    def test_private_finished_and_inactive_results_stay_hidden(self):
        public = self.event()
        private = self.event(privacy=Event.Privacy.PRIVATE)
        self.event(ends_at=timezone.now() - timedelta(hours=1))
        inactive = User.objects.create_user("maya_hidden", is_active=False)
        self.assertEqual([item["id"] for item in self.search("events", "cofee")["results"]], [public.id])
        self.assertNotIn(inactive.id, [item["id"] for item in self.search("people", "maya")["results"]])
        Attendance.objects.create(event=private, user=self.viewer, status=Attendance.Status.INVITED)
        self.assertEqual(self.search("events", "cofee")["count"], 2)
        self.client.force_authenticate(None)
        self.assertEqual([item["id"] for item in self.search("events", "cofee")["results"]], [public.id])

    def test_host_history_and_relationship_scopes_survive_search(self):
        finished = self.event(ends_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(self.search("events", "coffee", host=self.host.id)["results"][0]["id"], finished.id)
        other = User.objects.create_user("maya_other")
        Follow.objects.create(follower=self.viewer, following=self.host)
        response = self.client.get(f"/api/people/{self.viewer.id}/following/", {"q": "maya"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data["results"]], [self.host.id])
        self.assertNotEqual(self.host.id, other.id)

    def test_pagination_has_complete_counts_and_stable_ties(self):
        created = [self.event(f"Coffee circle {i:02}") for i in range(25)]
        first = self.search("events", "coffee")
        second = self.search("events", "coffee", page=2)
        self.assertEqual(first["count"], 25)
        self.assertEqual(len(first["results"]), 20)
        self.assertTrue(first["next"])
        ids = [item["id"] for item in first["results"] + second["results"]]
        self.assertEqual(ids, [event.id for event in created])
        self.assertIsNone(second["next"])

    def test_blank_query_browses_but_punctuation_does_not_match_everyone(self):
        self.event()
        self.assertEqual(self.search("events", "  ")["count"], 1)
        self.assertEqual(self.search("events", "!!!")["count"], 0)
        self.assertEqual(self.search("people", "@")["count"], 0)
        self.assertEqual(normalize("  Café—MÁYA @rao_9  "), "cafe maya rao 9")

    def test_single_edit_and_transposition_boundaries(self):
        for typo in ("cofee", "cofffee", "coffae", "coffef"):
            self.assertTrue(small_typo(typo, "coffee"))
        self.assertTrue(small_typo("cofefe", "coffee"))
        self.assertFalse(small_typo("cafe", "coffee"))
        self.assertFalse(small_typo("cat", "bat"))
        self.assertFalse(small_typo("member22", "member21"))
