from django.contrib import admin
from .models import (Attendance, Comment, Conversation, Event, Follow, KarmaRating, Message,
                     Notification, Post, PostLike, Profile, Quest, QuestSubmission, Report, UserBlock)

admin.site.register([Profile, Follow, Event, Attendance, Quest, QuestSubmission, KarmaRating,
                     Post, PostLike, Comment, Conversation, Message, Notification])


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["id", "reporter", "reported_user", "content_type", "object_id", "created_at"]
    list_filter = ["content_type", "created_at"]
    search_fields = ["reason", "reporter__username", "reported_user__username"]
    readonly_fields = ["reporter", "reported_user", "content_type", "object_id", "reason", "created_at"]
    date_hierarchy = "created_at"
    list_select_related = ["reporter", "reported_user", "content_type"]

    def has_add_permission(self, request):
        return False


@admin.register(UserBlock)
class UserBlockAdmin(admin.ModelAdmin):
    list_display = ["blocker", "blocked_user", "created_at"]
    search_fields = ["blocker__username", "blocked_user__username"]
    readonly_fields = ["created_at"]
