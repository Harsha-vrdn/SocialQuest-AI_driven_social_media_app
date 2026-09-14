# SocialQuest

SocialQuest is a full-stack MVP for turning real-world events into low-pressure social adventures. It includes a Django REST API, a responsive public website, and an Expo (iOS/Android) client.

## What is included

- Events: users can host events, manage capacity, and review every join request.
- Public social reputation: XP is earned only when a host approves quest proof; karma is a separate total of post-event peer reactions (+1 Like, −1 Dislike, or 0 None).
- Quests: hosts can generate one main quest and two side quests from an event name and description. With `OPENAI_API_KEY`, this goes through LangChain; without it, a safe local generator keeps development working.
- Proof: accepted attendees upload a photo (`IMAGE`) or video/reel (`REEL`) for each quest. 
- Social graph: public profiles, follower/following counts, and follow/unfollow endpoints.
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

Dark mode is available from the moon toggle in the web navigation (and on the login page). The setting is stored locally and follows the device preference until the user makes a choice.

For AI quest generation, add `OPENAI_API_KEY` to `.env`. The generator deliberately instructs the model to produce inclusive, low-risk prompts and falls back to a deterministic set if the AI response is invalid or unavailable.

## Run the mobile app

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8000/api npm start
```

Use Expo Go or an iOS/Android simulator. A physical phone cannot use `localhost` for the server; use your computer’s LAN IP. The app’s event sheet supports join requests and photo/reel quest-proof uploads after the attendee is accepted.

The mobile app now starts with its own login/register screen; it no longer asks users to paste API tokens. After signing in, the bottom navigation always includes Home, Explore, Chats, Reels, and Profile. Chats lists conversations, supports direct messages, and refreshes automatically.

If you ran the mobile app before this update, restart Metro with `npx expo start -c`. The project now starts directly from `App.tsx` rather than an unconfigured Expo Router entry point.

## Essential API flow

1. `POST /api/auth/register/` → returns a token.
2. `POST /api/events/` → create a host-owned event.
3. `POST /api/events/{id}/generate-quests/` → create its main + side quests.
4. `POST /api/events/{id}/join/` → attendee sends a pending request.
5. `POST /api/events/{id}/review-request/` with `attendance_id` and `decision` → host accepts/denies.
6. `POST /api/submissions/` as `multipart/form-data` → accepted attendee uploads `quest`, `media`, `media_type`, and optional `caption`.
7. `POST /api/submissions/{id}/review/` → host approves proof; XP is awarded exactly once.
8. When an event finishes, each accepted attendee gets an in-app rating notification. They can `POST /api/ratings/` with `event`, `target_id`, `reaction` (`LIKE`, `DISLIKE`, or `NONE`) and an optional `note`. Only another accepted attendee can be rated.

Use `Authorization: Token <token>` for authenticated API requests. The browsable API is available at `/api/` once Django is running.

## Social home API

- `GET/POST /api/posts/` — community posts; use `kind=REEL` for the dedicated reel stream. Posts support text, photo, or video uploads.
- `POST|DELETE /api/posts/{id}/like/` and `GET/POST /api/comments/?post={id}` — feed interaction.
- `/s/post/{id}/` — shareable post link; it opens the post and records one +5 XP referral bonus per browser/device.
- `GET /api/conversations/` and `POST /api/conversations/direct/` — list chats or create/retrieve a direct chat using `user_id`.
- `GET/POST /api/messages/?conversation={id}` — private messages for a conversation participant.
- `GET/PATCH /api/people/me/` — public profile data and editable display name, bio, city, and avatar.

## Production next steps

Use PostgreSQL and object storage (S3/R2) for media, replace permissive development CORS, add rate limits/moderation on uploads and ratings, and use a background queue for quest generation and video processing. Age gating, consent rules, reporting/blocking, and privacy controls should be decided before inviting a general public community.
