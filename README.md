# SocialQuest

SocialQuest is a full-stack MVP for turning real-world events into low-pressure social adventures. It includes a Django REST API, a responsive public website, and an Expo (iOS/Android) client.

## What is included

- Events: users can host events, manage capacity, and review every join request.
- Public social reputation: quest XP is earned once when a host approves proof; karma is a separate total of post-event peer reactions (+1 Like, −1 Dislike, or 0 None).
- Quests: hosts can generate one shared main quest and two private side quests per accepted participant from an event name and description. With `OPENAI_API_KEY`, this goes through LangChain; without it, a safe local generator keeps development working.
- Proof: accepted attendees upload a photo (`IMAGE`) or video/reel (`REEL`) for each quest. Hosts approve or reject it.
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

The web and mobile clients use the dark pixel-art theme. The active web stylesheet is `web/static/pixelquest.css`; the older stylesheets are retained but are not loaded.

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

The mobile app now starts with its own login/register screen; it no longer asks users to paste API tokens. After signing in, the bottom navigation includes Home, Events, Chats, Alerts, Reels, and Profile. Chats lists conversations, supports direct messages, and refreshes automatically. Reels use the native Expo video player. Posts support likes, and public profiles have follow/unfollow controls. Hosted and joined events are available from Profile; hosts can review requests and quest proof from the event sheet.

If Metro is already running, stop it with Ctrl+C, then use the LAN command above after this upgrade when both devices share Wi-Fi. An existing custom development build must be rebuilt for the new SDK. See the [SDK 57 release notes](https://expo.dev/changelog/sdk-57) for development build changes. The project starts directly from `App.tsx`.

## Essential API flow

1. `POST /api/auth/register/` → returns a token.
2. `POST /api/events/` → create a host-owned event.
3. `POST /api/events/{id}/generate-quests/` → create its main + side quests.
4. `POST /api/events/{id}/join/` → attendee sends a pending request.
5. `POST /api/events/{id}/review-request/` with `attendance_id` and `decision` → host accepts/denies.
6. `POST /api/submissions/` as `multipart/form-data` → accepted attendee uploads `quest`, `media`, `media_type`, and optional `caption`.
7. `GET /api/events/{id}/submissions/` → the host lists proof awaiting review. `POST /api/submissions/{id}/review/` approves or rejects it. Approval awards XP exactly once; approved proof cannot be reversed.
8. When an event finishes, each accepted attendee gets an in-app rating notification. They can `POST /api/ratings/` with `event`, `target_id`, `reaction` (`LIKE`, `DISLIKE`, or `NONE`) and an optional `note`. Only another accepted attendee can be rated.

Use `Authorization: Token <token>` for authenticated API requests. The browsable API is available at `/api/` once Django is running.

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
cd mobile
npm run typecheck
npm run test:startup
```

The API regression suite covers the social flows, profile validation, partial event edits, private-event access, upload type validation, duplicate proof, one-time XP, repeated RSVP reviews, and notification counts across pages. See [AUDIT.md](AUDIT.md) for responsive browser verification and runtime limits.

## Production next steps

Use PostgreSQL and object storage (S3/R2) for media, replace permissive development CORS, add rate limits/moderation on uploads and ratings, and use a background queue for quest generation and video processing. Age gating, consent rules, reporting/blocking, and privacy controls should be decided before inviting a general public community.
