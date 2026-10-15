# Backend hardening and safety APIs

The API enforces Django minimum-length, common-password, and numeric-password
validation during registration. Existing passwords continue to work at login.
Anonymous API traffic is limited to 60 requests/minute, authenticated traffic to
300/minute. Login and registration additionally share a 5/minute IP budget,
including attempts carrying authenticated credentials. Throttled responses use
HTTP 429 and include Retry-After.

Set DJANGO_NUM_PROXIES only to the actual number of trusted reverse proxies;
its default of zero ignores untrusted X-Forwarded-For headers. For multiple
workers, configure a shared cache with DJANGO_CACHE_BACKEND and
DJANGO_CACHE_LOCATION. Django's RedisCache requires the redis Python client in
the deployment. DRF's built-in cache throttles are approximate under concurrency;
use atomic edge rate limits for a hard cross-worker limit or brute-force/DDoS
protection. See the [DRF throttling documentation](https://www.django-rest-framework.org/api-guide/throttling/).

Public media uploads check size, declared MIME type, filename extension, and
actual image/container signatures before storage. Images are limited to 10 MiB
(JPEG, PNG, GIF, WebP); videos to 60 MiB (MP4/M4V, QuickTime MOV, 3GP, WebM).
Image dimensions are bounded and verified before recompression. Configure the
reverse proxy's request-body limit for a 60 MiB file plus multipart overhead.
Video signature checks identify supported containers; they do not replace full
video decoding or content moderation. The encrypted chat relay remains opaque
and retains its separate ciphertext validation and 25 MiB plaintext protocol.

## Account deletion

Authenticated DELETE /api/people/me/delete-account/ returns 204 and immediately
erases the current account, authored content and hosted events. It revokes API
credentials and active Django browser sessions, removes protected chat devices
and relevant relay files, and deletes cached notification payloads authored by
the account. Other participants retain their own direct-chat messages. Previously downloaded
recipient files are outside server storage and cannot be remotely erased.

Public upload deletion runs after transaction commit. Storage failures remain
in PendingUploadDeletion for retry by the existing purge_accounts worker; keep
that worker supervised. Shared uploads still referenced by another account are
retained. Reports authored by the account are deleted; reports from other users
retain their reason but lose the reported_user identity when that user is erased.

The existing POST /api/auth/request-deletion/ recovery window and deactivate
routes remain available with their existing semantics.

## Reporting and blocking

Authenticated POST /api/reports/ accepts either an account report:

```json
{"reported_user": 12, "reason": "Harassment"}
```

or a content report:

```json
{"content_type": "post", "object_id": 42, "reason": "Abusive content"}
```

Allowed content types are user, post, comment, message, and event. The numeric
Django ContentType ID is also accepted for these models only. The server checks
that the reporter can access the content and derives its owner; callers cannot
forge reporter identity or report arbitrary internal models. Reasons must be
nonempty and at most 2,000 characters. Reports are create-only through the public
API and available to authorized moderators through Django admin.

POST /api/people/{id}/block/ is idempotent (201 on creation, otherwise 200).
DELETE on the same route removes only the caller's block (204). Self-blocks and
duplicates are prohibited by database constraints. Blocking removes follows in
both directions. Each party's posts/profile/events are hidden from the other,
and direct conversations and message sends become unavailable. In shared groups,
other participants can continue talking, while the blocked pair cannot see each
other's messages, previews, unread counts, attachment envelopes or push alerts.
Existing attachment access and queued notification deliveries also enforce blocks.

## App Store integration

Native post overflow menus submit content reports to this API. Account reporting,
blocking and account deletion still need their corresponding UI integration,
and operators need a timely moderation process,
objectionable-content filtering, published contact information, and an accurate
privacy/retention policy. The existing mobile deletion screen still calls the
recoverable deletion route; wire the immediate-deletion route into that UX before
representing it as immediate permanent erasure. This change alone does not imply
App Store approval. See [Apple's review guidelines, 1.2 and 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/).

## Verification

```sh
.venv/bin/python manage.py migrate
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test
```

Migration 0022 creates moderation tables and composite indexes on author/time,
conversation/time, and post/time. Post feeds annotate distinct like/comment
counts and prefetch only the two recent replies needed in previews. Public-user
statistics are annotated in bulk, including nested authors and chat senders.
