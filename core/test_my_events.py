from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Attendance, Event, Post, UserBlock

User = get_user_model()


class MyEventsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.viewer = User.objects.create_user('viewer')
        self.host = User.objects.create_user('host')
        self.other = User.objects.create_user('other')
        self.client.force_authenticate(self.viewer)
        self.now = timezone.now()

    def event(self, status=None, **overrides):
        values = dict(host=self.host, name='Coffee walk', location_name='Bengaluru',
                      starts_at=self.now + timedelta(days=1), ends_at=self.now + timedelta(days=1, hours=2))
        values.update(overrides)
        event = Event.objects.create(**values)
        if status:
            Attendance.objects.create(event=event, user=self.viewer, status=status)
        return event

    def mine(self, **query):
        response = self.client.get('/api/events/', {'attending': 'true', **query})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_includes_only_my_active_attendance_statuses_with_serialized_badges(self):
        expected = {}
        for status in [Attendance.Status.PENDING, Attendance.Status.ACCEPTED, Attendance.Status.INVITED]:
            event = self.event(status)
            expected[event.id] = status
        for status in [Attendance.Status.CANCELLED, Attendance.Status.DENIED, None]:
            event = self.event(status)
            Attendance.objects.create(event=event, user=self.other, status=Attendance.Status.ACCEPTED)
        data = self.mine()
        self.assertEqual(data['count'], 3)
        self.assertEqual({row['id']: row['my_attendance_status'] for row in data['results']}, expected)

    def test_private_pending_invited_and_accepted_events_are_visible_only_to_the_participant(self):
        events = [self.event(status, privacy='PRIVATE') for status in ['PENDING', 'INVITED', 'ACCEPTED']]
        self.assertEqual({row['id'] for row in self.mine()['results']}, {event.id for event in events})
        for event in events:
            self.assertEqual(self.client.get(f'/api/events/{event.id}/').status_code, 200)
        # A pending request reveals event details, not private moments or chat.
        post = Post.objects.create(event=events[0], author=self.host, body='Private moment')
        self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/events/{events[0].id}/chat/').status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.mine()['count'], 0)
        self.assertEqual(self.client.get(f'/api/events/{events[0].id}/').status_code, 404)

    def test_upcoming_scope_keeps_ongoing_events_and_orders_by_start_even_with_search(self):
        later = self.event('ACCEPTED', name='Coffee', starts_at=self.now + timedelta(days=3), ends_at=self.now + timedelta(days=3, hours=2))
        earlier = self.event('PENDING', name='Coffee conversations')
        ongoing = self.event('INVITED', name='Coffee circle', starts_at=self.now - timedelta(hours=1), ends_at=self.now + timedelta(hours=1))
        self.event('ACCEPTED', ends_at=self.now - timedelta(seconds=1))
        for query in [{}, {'q': 'coffee'}]:
            self.assertEqual([row['id'] for row in self.mine(**query)['results']], [ongoing.id, earlier.id, later.id])

    def test_my_events_alias_requires_login_and_does_not_change_numeric_participant_history(self):
        past = self.event('ACCEPTED', starts_at=self.now - timedelta(days=2), ends_at=self.now - timedelta(days=1))
        pending = self.event('PENDING')
        accepted = self.event('ACCEPTED')
        alias = self.client.get('/api/events/', {'participant': 'me'})
        self.assertEqual([row['id'] for row in alias.data['results']], [pending.id, accepted.id])
        history = self.client.get('/api/events/', {'participant': self.viewer.id})
        self.assertEqual([row['id'] for row in history.data['results']], [past.id, accepted.id])
        self.client.force_authenticate(None)
        for query in [{'attending': 'true'}, {'participant': 'me'}]:
            self.assertEqual(self.client.get('/api/events/', query).status_code, 401)

    def test_cancellation_removes_public_and_private_events_from_my_events(self):
        for privacy in ['PUBLIC', 'PRIVATE']:
            event = self.event('ACCEPTED', privacy=privacy)
            self.assertIn(event.id, [row['id'] for row in self.mine()['results']])
            response = self.client.post(f'/api/events/{event.id}/cancel-rsvp/')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['status'], 'CANCELLED')
            self.assertNotIn(event.id, [row['id'] for row in self.mine()['results']])

    def test_blocked_or_inactive_hosts_stay_hidden(self):
        blocked = self.event('ACCEPTED')
        inactive = User.objects.create_user('inactive', is_active=False)
        self.event('PENDING', host=inactive)
        UserBlock.objects.create(blocker=self.viewer, blocked_user=blocked.host)
        self.assertEqual(self.mine()['count'], 0)

    def test_pagination_is_deduplicated_and_stable_with_other_attendees(self):
        events = [self.event('PENDING') for _ in range(23)]
        for event in events:
            Attendance.objects.create(event=event, user=self.other, status='ACCEPTED')
        first = self.mine()
        second = self.mine(page=2)
        self.assertEqual(first['count'], 23)
        self.assertTrue(first['next'])
        self.assertIsNone(second['next'])
        self.assertEqual([row['id'] for row in first['results'] + second['results']], [event.id for event in events])
