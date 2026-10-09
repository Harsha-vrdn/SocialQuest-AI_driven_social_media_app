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

The mobile app and website use Departure Mono for headings, body text, and controls. The font is bundled locally: OTF for iOS/Android and WOFF2 for the website, with its SIL Open Font License alongside each asset. The official v1.500 release comes from https://github.com/rektdeckard/departure-mono/releases/tag/v1.500. Typography uses the original regular face, with size and color providing emphasis. The mobile app uses the website’s gamified navy/purple palette, rounded cards, and subtle glass navigation. Shared colors and component styles live in `mobile/theme.ts` and `mobile/appStyles.ts`. Touch feedback, screen transitions, composer steps, and photo-like feedback use native-driver animations; Reduce Motion disables decorative movement, and Reduce Transparency uses opaque surfaces. Supported iOS builds use native Liquid Glass for toolbars; other devices use subtle tinted gradients. The web client retains its pixel-art theme. After adding these native dependencies, rebuild existing custom development/production apps; Expo Go must match SDK 57. The active web stylesheet is `web/static/pixelquest.css`; the older stylesheets are retained but are not loaded.

Settings load `.env` automatically without overriding existing environment variables. For AI quest generation, add `OPENAI_API_KEY` to `.env`. The generator deliberately instructs the model to produce inclusive, low-risk prompts and falls back to a deterministic set if the AI response is invalid or unavailable.

## Run the mobile app

The mobile app uses Expo SDK 57, React Native 0.86.3, and React 19.2.3. Use Node.js 22.13 or newer. SDK 57 requires iOS 16.4 or newer; compiling an iOS app locally requires Xcode 26.4 or newer. See the [Expo SDK reference](https://docs.expo.dev/versions/v57.0.0/).

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

The mobile app now starts with its own login/register screen; it no longer asks users to paste API tokens. Login is stored in the device keychain/keystore, and logging out revokes only that device session. After signing in, the bottom navigation includes Home, Events, Chats, Alerts, Reels, and Profile. Chats lists conversations by latest activity, supports direct messages, and refreshes automatically. Reels use the native Expo video player. Posts support likes, and public profiles have follow/unfollow controls. Profile includes **Posts**, **Reels**, and **Events** tabs; other members’ profiles include their visible posts and reels. Profile moments load by author, including older paginated posts outside the recommended feed, with pull-to-refresh and retry controls. Hosted and joined events are available from the Events tab; hosts can create, edit, delete, and invite people from the event sheet. Attendees can cancel or retry an RSVP. Signed-in members can edit their display name, bio, city, and avatar from **Profile → Edit profile**. A new hosting form requests foreground location permission and suggests a venue with coordinates; hosts can retry detection or enter a venue manually. Editing an existing event retains its saved venue.

Mobile hosting and event editing use **Starts at** and **Ends at** calendar controls. Pick a day, hour, minute, and AM/PM in device-local time; minute shortcuts and one-minute adjustments avoid typing timestamps. Cancel leaves the saved schedule unchanged. Moving the start beyond the current end shifts the end to preserve the event duration, and the end picker requires a time after the start. No additional native module is needed.

Each event has one private group conversation for its host and accepted participants, including existing events after migration `0016_event_group_chat`. Pending or invited people enter only after acceptance. Cancelling or losing acceptance removes chat access. In mobile, open **Event group chat** from an event or find it in **Chats**; tap the group header to browse participants. Group messages show sender names, and the chat name follows the event. Removing a chat from your inbox only hides it; reopening it from the event restores it. Deleting an event also deletes its group chat and messages.

Mobile posts and reels show relative publication times (for example, `10 mins ago`, `10 hrs ago`, `2 days ago`, and `1y 20 days ago`), refreshing while the app is active. Tap a post photo to open fullscreen; pinch or double-tap to zoom up to 4×, drag to pan, or use the zoom/reset buttons. Double-tap on the feed photo still likes it, and the separate replies control opens comments.

If Metro is already running, stop it with Ctrl+C, then use the LAN command above after this upgrade when both devices share Wi-Fi. An existing custom development build must be rebuilt for the new SDK. See the [SDK 57 release notes](https://expo.dev/changelog/sdk-57) for development build changes. The project starts directly from `App.tsx`.

## Creating posts

The Home composer and Share button open SocialQuest Studio on the web and a full-screen composer in the mobile app. Follow **Media → Details → Preview** to publish a photo, video reel, text post, or quest proof. Photos support center-cropping (square, portrait, and wide), rotation, mirroring, replacement, and removal. Videos have a playback preview. Captions include a character counter, and normal posts can include a location. The final step shows a feed preview before sharing. During an active event, accepted attendees can choose **Complete quest**, add a photo or reel, and select **Post & complete** to publish their moment and earn XP. The event name and quest title appear as a quiet attribution line on the resulting post/reel; private-event visibility rules still apply.

Closing a draft offers Keep editing, Save draft, or Discard. Drafts are temporary: web drafts last while the page stays open, and native drafts last while the app stays open. Quest drafts are kept separate from regular posts. Failed publishing keeps the draft available for retry. Each post currently supports one media file, up to 50 MB.

## Device notifications

Mobile Home links to notification setup when notifications are off; Alerts includes the **Enable notifications** button. The web client includes the button on both Home and Alerts. Permission is requested when it is tapped; users can turn notifications off from the same control. Chat messages, RSVP activity, replies, and event-ended reminders use device notifications. Messages stay out of the in-app Alerts feed.

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
- `GET/POST /api/messages/?conversation={id}` — private messages for a conversation participant.
- `GET/PATCH /api/people/me/` — public profile data and editable display name, bio, city, and avatar.

## Verification

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
