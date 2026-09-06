from rest_framework.routers import DefaultRouter
from .views import (AuthViewSet, CommentViewSet, ConversationViewSet, EventViewSet,
                    KarmaRatingViewSet, MessageViewSet, PeopleViewSet, PostViewSet,
                    QuestSubmissionViewSet, NotificationViewSet)

router = DefaultRouter()
router.register("auth", AuthViewSet, basename="auth")
router.register("events", EventViewSet, basename="event")
router.register("submissions", QuestSubmissionViewSet, basename="submission")
router.register("ratings", KarmaRatingViewSet, basename="rating")
router.register("people", PeopleViewSet, basename="people")
router.register("posts", PostViewSet, basename="post")
router.register("comments", CommentViewSet, basename="comment")
router.register("conversations", ConversationViewSet, basename="conversation")
router.register("messages", MessageViewSet, basename="message")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls
