# SocialQuest

SocialQuest is a full-stack MVP for turning real-world events into low-pressure social adventures. It includes a Django REST API, a responsive public website, and an Expo (iOS/Android) client.

## What is included

- Events: users can host events, manage capacity, and review every join request.
- Public social reputation: quest XP is earned once as soon as valid proof is uploaded; karma is a separate total of post-event peer reactions (+1 Like, −1 Dislike, or 0 None).
- Quests: hosts can generate one shared main quest and two private side quests per accepted participant from an event name and description. With `OPENAI_API_KEY`, this goes through LangChain; without it, a safe local generator keeps development working.
- Proof: accepted attendees upload a photo (`IMAGE`) or video/reel (`REEL`) for each quest. Valid proof is auto-approved and awards XP immediately; there is no host-review queue.
- Social graph: public profiles, follower/following counts, and follow/unfollow endpoints.
- Tap Followers or Following on a profile to browse and search its people list. Home has a search icon for finding members by name or username, including `@username`.
- Chat shows Online only while a participant has a live foreground session. Web tabs and mobile apps send a heartbeat every 20 seconds, release their session when backgrounded, and refresh chat presence every 5 seconds. A disconnected session expires after 60 seconds; multiple devices are tracked independently.
- Sharing and bonuses: posts, reels, events, and profiles have shareable links. A new, non-self like awards the post author +1 XP; the first visit from each browser/device to a shared post link awards +5 XP.
- Clients: desktop/mobile responsive web UI and an Expo app configured for both iOS and Android.

## Run the Django API + web app

The active Homebrew Python 3.14 on this machine currently has a broken `pyexpat` linkage, so use a healthy Python 3.9+ environment (Django 4.2 LTS is used for broad compatibility). Once available:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

Open `http://127.0.0.1:8000/`. The home route sends unsigned-in visitors to `http://127.0.0.1:8000/login/`; after login or registration, they are taken directly to the community Home feed.

The mobile app and website use Departure Mono for headings, body text, and controls. The font is bundled locally: OTF for iOS/Android and WOFF2 for the website, with its SIL Open Font License alongside each asset. The official v1.500 release comes from https://github.com/rektdeckard/departure-mono/releases/tag/v1.500. Typography uses the original regular face, with size and color providing emphasis. The mobile app pairs sunny cream or deep plum surfaces with coral actions, purple navigation, colorful quest artwork, rounded cards, and subtle glass navigation. Shared light/dark palettes and cached component styles live in `mobile/theme.ts` and `mobile/appStyles.ts`. Touch feedback, screen transitions, composer steps, and photo-like feedback use native-driver animations; Reduce Motion disables decorative movement, and Reduce Transparency uses opaque surfaces. Supported iOS builds use native Liquid Glass for toolbars; other devices use subtle tinted gradients. The web client retains its pixel-art theme. After adding these native dependencies, rebuild existing custom development/production apps; Expo Go must match SDK 57. The active web stylesheet is `web/static/pixelquest.css`; the older stylesheets are retained but are not loaded.

Choose **Light**, **Dark**, or **System** in **Profile → gear → Appearance**, or on the login screen. New installs follow the device. The choice is stored locally in `appearance.json` and survives relaunches and logout; changing it updates the app and native controls without resetting navigation or drafts. System mode follows device appearance changes live. Rebuild existing custom native apps to pick up automatic appearance in the iOS/Android project configuration.

Settings load `.env` automatically without overriding existing environment variables. For AI quest generation, add `OPENAI_API_KEY` to `.env`. The generator deliberately instructs the model to produce inclusive, low-risk prompts and falls back to a deterministic set if the AI response is invalid or unavailable.

## Run the mobile app

The mobile app uses Expo SDK 57, React Native 0.86.3, and React 19.2.3. Use Node.js 22.13 or newer. SDK 57 requires iOS 16.4 or newer; compiling an iOS app locally requires Xcode 26.4 or newer. See the [Expo SDK reference](https://docs.expo.dev/versions/v57.0.0/).

On **iOS 26+**, supported builds use Expo's [`expo-glass-effect`](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/) for native Liquid Glass: bottom navigation, chat toolbars, the post composer footer, search/notification buttons, the profile settings gear, Settings back control, and profile/event sheet close controls. Neutral material is untinted so UIKit supplies its highlights and refraction; content cards and nested profile tabs remain solid/tinted. Glass follows the app's Light/Dark/System choice. Screen transitions keep native glass at full opacity while retaining movement.

On supported builds, the bottom navigation floats **over** scrolling content, giving the native material photos and colors to refract. Each main page has measured bottom clearance inside its scrollable content so the last controls can move above the bar. Chat's conversation header and composer also float over messages; their measured sizes, emoji tray, and keyboard lift are excluded from read-receipt visibility. The selection highlight tracks horizontal drags across the bottom tabs and commits navigation on release; normal taps and accessible tab buttons remain available.

The runtime checks both native API and compiled-build support. Older iOS versions and Android use the tinted, in-flow fallback; **Reduce Transparency** switches surfaces to opaque colors, including when changed while the app is running. The dependency is already included—reload a compatible SDK 57 Expo Go or development build. Rebuild any custom app that predates this native module. On a physical iPhone, check both themes, scroll photos behind navigation, slide across the tabs in both directions, reach the last item on every tab, open chat (both global bars must stay hidden), expand the emoji tray/type multiple lines, show/hide the keyboard, and toggle Reduce Transparency. A JavaScript export or browser preview cannot verify native glass rendering.

Install the SDK 57-compatible Expo Go update on your iPhone. Sign into Expo Go and the Expo CLI with the **same Expo account**; this is [required by Expo Go for iOS](https://expo.dev/changelog/expo-go-57-login). From the `mobile` directory, `npx expo whoami` checks the CLI account and `npx expo login` signs in. Restart Metro after changing accounts.

For a phone on the same Wi-Fi as your computer, run these in two terminals from the repository root, replacing `YOUR_COMPUTER_LAN_IP` with the computer's current Wi-Fi IP. On macOS, `ipconfig getifaddr en0` usually shows this address.

Terminal 1 — Django API and web:

```bash
ALLOWED_HOSTS=localhost,127.0.0.1,testserver,YOUR_COMPUTER_LAN_IP .venv/bin/python manage.py runserver 0.0.0.0:8000
```

Terminal 2 — Expo:

```bash
npm --prefix mobile install
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8000/api npm --prefix mobile start -- --clear --lan --go
```

The install command is only needed after dependency changes. Keep both servers running. Open `http://YOUR_COMPUTER_LAN_IP:8000/api/` in the phone's browser to check backend access, then scan the current Expo QR code. Stop previous Metro sessions with Ctrl+C before restarting so you don't accidentally open a stale link from another port.

If scanning with Camera reports “bad URL,” open Expo Go's Home tab and select the current development server, checking that its address matches Metro's `exp://` address. Opening `http://YOUR_COMPUTER_LAN_IP:8081/status` in Safari checks whether the phone can reach Metro (use the actual Metro port if different). Safari may download the `status` response; its expected contents are `packager-status:running`. Reaching this endpoint does not confirm that Expo Go has loaded the app. If the error persists, record the installed Expo Go version and the current launch address before changing server settings again.

Use Expo Go or an iOS/Android simulator. A physical phone cannot use `localhost` for the server. Django's default `runserver` listens only on the computer; `0.0.0.0:8000` makes it reachable over the local network, and the `ALLOWED_HOSTS` value permits requests to the computer's IP. The app’s event sheet supports join requests and photo/reel quest-proof uploads after the attendee is accepted.

For an Expo tunnel, run this from the repository root:

```bash
npm --prefix mobile start -- --clear --tunnel
```

If your terminal is already in `mobile`, use `npm start -- --clear --tunnel`. The startup script repairs invalid generated tunnel hostnames before launching Expo; underscores in these names can cause iOS to report “bad URL.” Use the npm command to run this check. The tunnel dependency `@expo/ngrok` is included in the project's development dependencies, so `npm install` makes it available without relying on a global installation. Keep Metro running and scan its current QR code after a restart. The Expo tunnel serves the app bundle; the Django API still needs an address reachable from your phone.

The mobile app now starts with its own login/register screen; it no longer asks users to paste API tokens. Login is stored in the device keychain/keystore, and logging out revokes only that device session. After signing in, the bottom navigation includes Home, Events, Chats, Reels, and Profile; Settings opens from the profile gear and Alerts from the header bell. Chats lists conversations by latest activity, supports direct messages, and refreshes automatically. Reels use the native Expo video player. Posts support likes, and public profiles have follow/unfollow controls. Profile includes **Posts**, **Reels**, and **Events** tabs; other members’ profiles include their visible posts and reels. Profile moments load by author, including older paginated posts outside the recommended feed, with pull-to-refresh and retry controls. Hosted and joined events are available from the Events tab; hosts can create, edit, delete, and invite people from the event sheet. Attendees can cancel or retry an RSVP. Signed-in members can edit their display name, bio, city, and avatar from **Profile → Edit profile**. A new hosting form requests foreground location permission and suggests a venue with coordinates; hosts can retry detection or enter a venue manually. Editing an existing event retains its saved venue.

Mobile hosting and event editing use **Starts at** and **Ends at** calendar controls. Pick a day, hour, minute, and AM/PM in device-local time; minute shortcuts and one-minute adjustments avoid typing timestamps. Cancel leaves the saved schedule unchanged. Moving the start beyond the current end shifts the end to preserve the event duration, and the end picker requires a time after the start. No additional native module is needed.

Each event has one private group conversation for its host and accepted participants, including existing events after migration `0016_event_group_chat`. Pending or invited people enter only after acceptance. Cancelling or losing acceptance removes chat access. In mobile, open **Event group chat** from an event or find it in **Chats**; tap the group header to browse participants. Group messages show sender names, and the chat name follows the event. Removing a chat from your inbox only hides it; reopening it from the event restores it. Deleting an event also deletes its group chat and messages.

The mobile chat composer is a compact, borderless field with **+** for attachments and a send arrow. Emoji are available through the system keyboard; drag the message list to dismiss it. Outgoing messages show a small status dot and an accessible label: **red** while sending or not sent, **yellow** when accepted by the server but not read, and **green** after the recipient reads it (all current recipients in a group). Presence and attachment downloads do not count as reading. Receipt updates arrive with the existing chat polling.

Failed text messages remain as red bubbles: tap to retry or remove the local copy. Sends time out after 30 seconds; retries reuse a sender-scoped UUID so a lost response cannot create duplicate messages. Polling also reconciles accepted messages. Drafts and unsent bubbles stay associated with their conversation while navigating within the app, but are session-local: they do not survive app termination or logout. Migration `0021_message_client_id` is required for safe retries. Attachment failures retain their existing retryable preview and now show a red status dot too.

Mobile posts and reels show relative publication times (for example, `10 mins ago`, `10 hrs ago`, `2 days ago`, and `1y 20 days ago`), refreshing while the app is active. Tap a post photo to open fullscreen; pinch or double-tap to zoom up to 4×, drag to pan, or use the zoom/reset buttons. Double-tap on the feed photo still likes it, and the separate replies control opens comments.

The dedicated Reels feed on mobile and web includes like/unlike, a comment count that opens the full comment thread, and sharing. Comments use the existing reply, edit, and delete controls; counts stay synchronized with other loaded views of the same post. Reel actions sit below the video so playback controls remain accessible.

If Metro is already running, stop it with Ctrl+C, then use the LAN command above after this upgrade when both devices share Wi-Fi. An existing custom development build must be rebuilt for the new SDK. See the [SDK 57 release notes](https://expo.dev/changelog/sdk-57) for development build changes. The project starts directly from `App.tsx`.

## Search

Open the search icon on Home or go to Events / Explore events. The search field updates as you type, with separate **Events** and **People** tabs that retain your query. Clear the field to return to recommended events or browse the community. Results have loading, retry, and empty states, with **Load more** for additional pages.

Search matches names, @usernames, cities, event venues, hosts, and event descriptions. Words can appear in any order across these fields (for example, `coffee Bengaluru Maya`). Exact names rank above partial and incidental matches. Matching ignores case and accents and tolerates one misspelling or adjacent transposition in alphabetic words of four or more letters. Numeric handles and short terms keep literal matching. Private events, inactive accounts, and relationship scopes retain their existing access rules.

The existing `/api/events/?q=...` and `/api/people/?q=...` endpoints provide relevance ordering and normal DRF pagination. Search currently scans eligible searchable text in Python for portable SQLite support; large deployments should move this ranking to an indexed search backend. No external AI service, dependency, or migration is required.

## Mobile Settings and account lifecycle

**Settings** is a separate scrollable page opened by the small gear beside **Edit profile** on your own Profile page. It is not a bottom navigation tab or modal. A **Back to profile** control (or Android Back) returns to Profile. It contains Appearance, Notifications, Location, and Account. Alerts remain available from the header bell; the five bottom destinations are Home, Events, Chats, Reels, and Profile.

Location defaults to **Device location**, requesting foreground permission only when Nearby is used. **Saved city** opens a searchable dropdown with offline city suggestions, the public profile city, and a custom-city option. Tap **Save location preference** to persist it to the account. Suggested cities use approximate city-center coordinates; custom cities match event location text. No third-party city-search request or background tracking is required. The discovery preference is private and does not change the public profile city or event venues. Appearance and notification permission remain per-device choices.

Account controls require the current password and a final confirmation for deactivation/deletion:

- **Log out** revokes only this device's session.
- **Deactivate** hides the profile, posts, and hosted events from API discovery and signs out every device. There is no expiry; a successful API login reactivates the account. Existing shared chats remain visible with an unavailable-account identity while it is inactive.
- **Delete account** starts a server-timed **90-day** recovery window, hides the account, disables push devices, and revokes all API and Django browser sessions. A correct-password API login strictly before the deadline restores the account and clears the countdown. Wrong passwords and background requests do not cancel it. At or after the deadline login is refused even if the cleanup worker is delayed.

Run migrations and supervise this backend worker alongside the API:

```bash
.venv/bin/python manage.py migrate
.venv/bin/python manage.py purge_accounts --watch
```

The worker checks every 30 seconds; without `--watch`, it performs one sweep. Due account deletion removes dependent account records, posts, sent messages, uploaded media, and hosted events (including their associated group/history). Protected attachment-device relationships are detached safely without deleting unrelated senders' direct-chat messages. Failed public-upload removals are kept in a durable retry queue. Monitor worker logs and `PendingUploadDeletion` backlog; physical deletion requires a healthy worker and writable storage. Login recovery and deletion serialize on the user row, and stale profile/location edits cannot overwrite lifecycle fields.

This affects the live database/storage, not historical backups, CDN caches, or media already saved by recipients. Configure a production backup/cache-retention policy accordingly. Existing public media URLs are not authenticated by account state during the recovery window; hiding the profile is not remote revocation of previously shared files. Administrator-disabled accounts are not reactivated by this flow.

API: authenticated `GET/PATCH /api/auth/settings/`, `POST /api/auth/deactivate/` and `POST /api/auth/request-deletion/` (both require `password`). Login responses include `reactivated` and `deletion_cancelled`. Native device keyboard/permission interaction should still be smoke-tested on iPhone and Android.

## Creating posts

The Home composer and Share button open SocialQuest Studio on the web and a full-screen composer in the mobile app. Follow **Media → Details → Preview** to publish a photo, video reel, text post, or quest proof. Photos support center-cropping (square, portrait, and wide), rotation, mirroring, replacement, and removal. Videos have a playback preview. Captions include a character counter, and normal posts can include a location. The final step shows a feed preview before sharing. During an active event, accepted attendees can choose **Complete quest**, add a photo or reel, and select **Post & complete** to publish their moment and earn XP. The event name and quest title appear as a quiet attribution line on the resulting post/reel; private-event visibility rules still apply.

Closing a draft offers Keep editing, Save draft, or Discard. Drafts are temporary: web drafts last while the page stays open, and native drafts last while the app stays open. Quest drafts are kept separate from regular posts. Failed publishing keeps the draft available for retry. Each post currently supports one media file, up to 50 MB.

Development media delivery supports HTTP byte ranges so iPhone video previews and reels can probe and seek MOV/MP4 files. Production media hosting (reverse proxy, CDN, or object storage) must also honor `Range` requests with `206 Partial Content`, matching `Content-Range` and `Content-Length` headers, and exactly the requested bytes. This public media route does not serve the private chat attachment relay.

## Encrypted chat attachments (mobile and web)

Use the paperclip on mobile or **＋** beside the web message field to send one photo, video, or file per message (non-empty, up to **25 MB**). Mobile offers Photos/videos and Files, a preview, and an optional caption. Web files can include an optional message. Photos open full-screen; videos have playback controls; files can be saved/shared. Existing chat text, captions, timestamps, and membership metadata are **not end-to-end encrypted**.

This is **client-encrypted store-and-forward delivery**, not a direct WebRTC peer-to-peer connection or an implementation of WhatsApp/Signal. AES-256-GCM encrypts each file; TweetNaCl boxes wrap its random key and filename/type separately for each registered participant device. The server stores opaque ciphertext and encrypted envelopes, not attachment decryption keys. Device identities are pinned locally after first use, but initial identity discovery and additions trust the authenticated server. There are no verified safety numbers, forward secrecy, independent protocol audit, or cross-device history recovery; do not describe this as WhatsApp-equivalent security.

Each participant must open the updated app/site once to register a device before anyone can send them attachments. The recipient device snapshot includes the sender's other devices. When **every addressed device** confirms a verified local save, the relay file and key envelopes are deleted. Otherwise access expires **24 hours after upload**. Foreground clients automatically save pending attachments without marking messages read; background phone downloads are not implemented, so recipients must open the app/site within that window. Old/inactive devices can keep the relay copy until expiry. Newly registered devices cannot retrieve previously sent attachments—ask the sender to resend.

Saved ciphertext and device-only keys remain locally (SecureStore + app documents on mobile; IndexedDB in the browser). Logging out retains encrypted local history for that account; account/API namespaces are isolated. Clearing site data, uninstalling, storage eviction, or losing device keys can permanently lose received files after the relay copy is gone. Save important files using **Save / share** or **Save file**. Native preview plaintext is temporary app cache, cleared on view close and next account initialization; browser object URLs are revoked when detached or signed out. A recipient can independently save/share a file; deleting a message cannot recall those copies.

Deployment requirements:

```bash
.venv/bin/python manage.py migrate
npm --prefix mobile install
npm --prefix mobile run build:attachments
.venv/bin/python manage.py purge_chat_attachments --watch
```

Keep the dedicated cleanup worker supervised alongside the API. It checks every two seconds and sweeps 30 seconds early. Download endpoints enforce the 24-hour cutoff even if the worker is down, but **physical disk deletion requires a healthy worker and writable storage**—monitor process health and cleanup errors. The notification worker also sweeps as a fallback, but notification delivery can block and is not a substitute for the dedicated worker. Default private storage is `.chat-relay/`, outside public `media/`; override with `CHAT_ATTACHMENT_ROOT`. Never expose it via a web server, CDN, or public bucket, and exclude it from backups, snapshots, and object versioning. Files orphaned by a crash/cascade delete are also swept before the 24-hour ceiling. Database message history and delivery metadata persist; deleted envelope fields are not a promise of forensic erasure from old database backups/WAL pages.

Use HTTPS in production (required by release native clients and browser Web Crypto; localhost works for web development). HTTP LAN browser URLs cannot send/decrypt attachments. Set a reverse-proxy upload cap around 26 MB; the API checks 25 MB per plaintext file, a 100 MB per-sender pending relay quota, 20 devices per account, and 128 devices per chat. A shared private filesystem is needed if API and worker run on different hosts. For scale/concurrent writes, use a production database with row locking rather than the development SQLite database. Rebuild custom iOS/Android clients for the newly added Expo Crypto, DocumentPicker, and Sharing modules; matching SDK 57 Expo Go includes them.

Tests: `npm --prefix mobile run test:attachments` covers the shared cryptographic wire format, tampering, account/context isolation, local persistence before ACK, and retries. `manage.py test core.test_chat_attachments` covers permissions, expiry, deletion, idempotency, and device scoping. `web/tests/attachments.e2e.cjs` exercises real browser sending and offline delivery against a **disposable** localhost database (see its environment variables). Native device picking, file playback/sharing, and native crypto still require real-device QA; Hermes exports are not runtime device tests.

## Device notifications

Mobile Home links to **Settings → Notifications** when notifications are off; Settings contains the **Enable notifications** button. The web client includes the button on both Home and Alerts. Permission is requested when it is tapped; users can turn notifications off from the same control. Chat messages, RSVP activity, replies, and event-ended reminders use device notifications. Messages stay out of the in-app Alerts feed.

Chat alerts are suppressed while any foreground Chats tab is open for the recipient. Opening Chats also suppresses queued chat alerts and clears displayed chat notifications on that device. Other activity still notifies. A disconnected foreground session expires after 60 seconds.

Install the updated dependencies and prepare delivery from the repository root:

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py configure_webpush
```

Keep a third terminal running alongside Django and Expo:

```bash
.venv/bin/python manage.py deliver_notifications --watch
```

In production, supervise this worker as a persistent process. It retries transient failures, checks Expo receipts, and disables expired subscriptions. Keep `.notifications/vapid.pem` private and persistent; changing it invalidates existing browser subscriptions. Set `WEBPUSH_SUBJECT` to a real contact email or HTTPS URL before deploying.

Browser push requires HTTPS (localhost is allowed for development). On iPhone, install the HTTPS website to the Home Screen before enabling notifications. If browser push is unavailable, the client uses local notifications while the page is running. An HTTP LAN address cannot request browser notification permission.

The native app includes `expo-notifications` and separate Android channels for chat and other activity. **Background phone push still requires an EAS project ID and configured APNs/FCM credentials.** This repository does not yet contain an EAS project ID. Follow the [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), add the project's real UUID under `expo.extra.eas.projectId` in `mobile/app.json`, and rebuild the development/production app so the new native module and push credentials are included. Reloading Metro alone does not update an installed custom build. Without a configured push build, permitted local notifications work while the app is active; the permission card explains this limitation. Phone delivery must be verified on a physical device after setup.

Android Expo Go startup compatibility: the app imports local notification APIs separately because the SDK 57 package entry point starts remote push-token registration during import. Remote push code loads only when enabling notifications in a configured custom build. If you saw the red “Android Push notifications … removed from Expo Go” screen, stop Metro and restart from any directory with:

```bash
cd /Users/harsha_vrdn/Documents/ChatGPT/Socialquest/mobile
npm start -- --clear --lan --go
```

Scan the newly printed QR code. This startup fix needs a JavaScript reload; it does not require a new Expo Go binary. Local notifications remain available in Expo Go. Remote background push still requires the custom build and credentials described above.

## Essential API flow

1. `POST /api/auth/register/` → returns a token.
2. `POST /api/events/` → create a host-owned event.
3. `POST /api/events/{id}/generate-quests/` → create its main + side quests.
4. `POST /api/events/{id}/join/` → attendee sends a pending request.
5. `POST /api/events/{id}/review-request/` with `attendance_id` and `decision` → host accepts/denies.
6. `POST /api/submissions/` as `multipart/form-data` → accepted attendee uploads `quest`, `media`, `media_type`, and optional `caption`.
7. The submission is auto-approved, a quest moment is created, and XP is awarded exactly once. There are intentionally no proof-list or proof-review endpoints.
8. When an event finishes, each accepted attendee gets an in-app rating notification. They can `POST /api/ratings/` with `event`, `target_id`, `reaction` (`LIKE`, `DISLIKE`, or `NONE`) and an optional `note`. Only another accepted attendee can be rated.

Use `Authorization: Token <token>` for authenticated API requests. Each login creates an independent client session, and `POST /api/auth/logout/` revokes only the presented token. The browsable API is available at `/api/` once Django is running.

## Social home API

- `GET/POST /api/posts/` — community posts; use `kind=REEL` for the dedicated reel stream. Posts support text, photo, or video uploads.
- `POST|DELETE /api/posts/{id}/like/` and `GET/POST /api/comments/?post={id}` — feed interaction.
- `/s/post/{id}/` — shareable post link; it opens the post and records one +5 XP referral bonus per browser/device.
- `GET /api/conversations/` and `POST /api/conversations/direct/` — list chats or create/retrieve a direct chat using `user_id`.
- `GET/POST /api/messages/?conversation={id}` — private messages for a conversation participant. Text sends may include a `client_id` UUID for idempotent retries; it cannot be changed by PATCH. Sender responses include `delivery_status` (`sent` or `read`); incoming/deleted messages return null. Legacy clients without a UUID remain supported.
- `POST /api/conversations/{id}/mark-read/` with `message_id` — acknowledge messages through the last displayed message. Conversation responses include `unread_count` and `read_through_message_id`, shared across the reader’s devices. Own, hidden, and deleted messages do not add to unread counts.
- `GET/PATCH /api/people/me/` — public profile data and editable display name, bio, city, and avatar.

## Mobile gestures

Android edge-back, photo pan/pinch, sheet-header dragging and tab scrubbing run
on the UI thread with Expo 57-compatible Gesture Handler, Reanimated and Worklets.
After pulling these dependency changes, rebuild custom Android clients with
`cd mobile && npx expo run:android`, then clear Metro's cache with
`npx expo start --dev-client --clear`. A reload alone cannot update a custom
client's native modules. Matching SDK 57 Expo Go already includes them.
See [mobile/ARCHITECTURE.md](mobile/ARCHITECTURE.md) for the platform paths,
keyboard behavior and regression coverage.

- Bottom navigation: tap a tab, or drag horizontally across the bar and release over a destination. The highlight follows the finger; navigation occurs only on release. Vertical movements, extra fingers, and canceled gestures do not select another tab. Reduce Motion disables the snap animation.
- Photos: tap to open fullscreen, pinch or double-tap to zoom, drag a zoomed photo to pan, and swipe down at 100% zoom to close. Double-tapping a feed photo still likes it.
- Events and profile popups: on iPhone, native page sheets let you pull down on the page when its scroll view is at the top to close. While farther down the page, the same movement scrolls normally. Android uses the top handle/header to dismiss. Profile popups have a Refresh button instead of a competing pull-to-refresh gesture; the main Profile tab retains pull-to-refresh.
- Chats: Android uses the conversation's Back button or system Back to return to the inbox, with no horizontal drag preview. OS predictive-back animations are explicitly disabled in the Android app config. On iPhone, swipe right from the left edge to reveal the inbox; release a deliberate swipe to return or reverse/stop early to cancel. That preview is noninteractive, hidden from accessibility, and pauses read acknowledgements until cancellation completes. On both platforms, drag through messages to dismiss the keyboard and read history, pull to refresh, and long-press a message for its options. Both app bars stay hidden inside a conversation; the conversation toolbar remains. Profile and event popup headers can still be dragged down to dismiss on Android.

Close/back/zoom buttons remain available without gestures. Short or cancelled swipes return to their starting position, and exit animations respect Reduce Motion. Device QA should cover iOS and Android, both themes, keyboard open/closed, long event content, short/empty profiles, pulling down from page content at the top, scrolling back up without closing, reopening a dismissed sheet, photo pinch-to-pan transitions, cancelled swipes, and the chat inbox returning with its unread counts intact.

In the Events menu on Android, iOS, and the website, **Explore** shows discovery/search results and **My
Events** shows your ongoing/upcoming requests, invitations, and accepted events,
soonest first. Accepted plans are highlighted with **✓ Going**; other active RSVPs
show **⏳ Requested** or **✉ Invited**. Both filters support search, and
RSVP changes refresh the list. An empty My Events view links back to Explore.
Web filters also support arrow keys, Home, and End, and retain the selected scope
when returning from event details. Cancelling a private RSVP returns to discovery.
The authenticated API scope is `GET /api/events/?attending=true` (also
`?participant=me`); numeric `participant=<user id>` retains accepted-event profile
history. Private-event requests expose their event details to that requester;
private moments and event chat retain their existing access requirements.

## Verification

Unread chats are highlighted with red counts on each conversation, the inbox, and chat navigation on mobile and web. A thread acknowledges messages only as they become visible while the app is active; incoming messages below the visible history stay unread. Alerts keep their unread highlight until opened or explicitly marked read. Migration `0017_conversation_read_state` starts existing chat history as read, since older releases did not record read state.

```bash
OPENAI_API_KEY='' .venv/bin/python manage.py check
OPENAI_API_KEY='' .venv/bin/python manage.py test
.venv/bin/python manage.py makemigrations --check --dry-run
node --check web/static/app.js
node --check web/static/login.js
node --test web/tests/*.test.cjs
cd mobile
npm run typecheck
npm run test:startup
npm run test:app
```

The API regression suite covers the social flows, profile validation, partial event edits, private-event access, upload type validation, duplicate proof, one-time XP, repeated RSVP reviews, and notification counts across pages. See [AUDIT.md](AUDIT.md) for responsive browser verification and runtime limits.

## Production next steps

Use PostgreSQL and object storage (S3/R2) for media, replace permissive development CORS, add rate limits/moderation on uploads and ratings, and use a background queue for quest generation and video processing. Age gating, consent rules, reporting/blocking, and privacy controls should be decided before inviting a general public community.
