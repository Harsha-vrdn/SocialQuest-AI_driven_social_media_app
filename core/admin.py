from django.contrib import admin
from .models import (Attendance, Comment, Conversation, Event, Follow, KarmaRating, Message,
                     Notification, Post, PostLike, Profile, Quest, QuestSubmission)

admin.site.register([Profile, Follow, Event, Attendance, Quest, QuestSubmission, KarmaRating,
                     Post, PostLike, Comment, Conversation, Message, Notification])
