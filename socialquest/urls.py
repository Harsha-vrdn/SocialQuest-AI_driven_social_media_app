from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from core.views import shared_post_link

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("s/post/<int:post_id>/", shared_post_link, name="shared-post"),
    # Some Android share targets previously appended the caption to the URL.
    # Keep those existing links working while new shares use a clean URL.
    path("s/post/<int:post_id>/<path:shared_caption>", shared_post_link, name="shared-post-caption"),
    path("login/", TemplateView.as_view(template_name="login.html"), name="login"),
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
