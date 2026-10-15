# SocialQuest audit — 13 September 2026

Reviewed the Django application, API permissions/validation, migrations, web templates and assets, Expo client, dependency configuration, and run documentation. Changes preserve the existing dark pixel-art design. Tests used a separate database and media directory under `/tmp/socialquest-audit`; the existing project database and uploads were not edited.

## Chat back preview, minimal composer, and delivery dots — 15 October 2026

- Chat left-edge swipes now reveal the actual inbox with finger-driven parallax and a scrim. Commit/cancel/reversal, multiple touches, interruption, layout resets, accessibility escape, and Reduce Motion retain the existing gesture safeguards. The preview is noninteractive and excluded from accessibility; read acknowledgement pauses while dragging and through the cancellation animation. This is an in-app preview, not Android OS predictive-back integration.
- Simplified the composer to a borderless expanding field, a 44-point attachment control, and a 44-point send arrow. Removed the extra emoji/keyboard-dismiss controls; native keyboard emoji and drag-to-dismiss remain. Light/dark styling and native glass/fallback surfaces remain intact.
- Outgoing messages have red sending/failed, yellow accepted-but-unread, and green read dots with readable/accessibility labels. Group green means all current recipients. Receipt annotations use existing per-person, per-conversation read cursors in bounded SQL queries; sender reads, presence, and file downloads do not count. Incoming/deleted messages do not expose outgoing status.
- Added a session-local text outbox with immediate bubbles, duplicate-tap guards, a 30-second timeout, same-ID retry, local removal, poll reconciliation, and logout/unmount guards. Acknowledged sends cannot turn failed because a UI refresh failed. Conversation drafts are isolated and preserved across navigation. Neither unsent text nor composer drafts persist across process termination/logout; attachment retry remains in its existing preview sheet and now has a failure indicator.
- Added nullable message client UUIDs and a sender-scoped uniqueness constraint for duplicate-safe text retries. Repeated sends do not duplicate notifications or inbox activity; malformed/conflicting IDs and unauthorized chats remain rejected. Legacy clients remain supported. Applied migration `0021_message_client_id` after a SQLite backup at `/private/tmp/socialquest-chat-backup.2h1Gw8/db.sqlite3`; no existing messages or accounts were removed.
- Verification: **141 Django tests**, TypeScript, and **136 mobile app tests** passed. Django system/migration consistency checks passed. Inspected a browser specimen using actual mobile styles and the status component at 320px and 390px in light/dark modes; composer space, wrapping labels, and all three colors were visible. This is not native device QA; physical iOS/Android gesture smoothness, keyboard behavior, and glass rendering remain unverified.
- All **9 web tests** passed. Final iOS and Android Hermes exports succeeded at `/private/tmp/socialquest-chat-final.Np2Wjb`; no new native dependency or rebuild-only feature was added.

## Reel likes and comments — 14 October 2026

- Added like/unlike, visible like and comment counts, and comment-thread access to the dedicated Reels feeds on mobile and web. Sharing remains available. Both use the existing post APIs and comment tools, including replies, editing, and deletion; no schema or native dependency changes were needed.
- Mobile actions follow light/dark themes and have accessible labels/states and 44-point minimum touch targets. Likes and comment counts synchronize across loaded feed, reel, event, and profile views. Existing in-flight guards prevent duplicate requests.
- Web reel cards now expose the shared action handlers and post identifiers so counts stay synchronized with the detail modal. Actions sit below the native video controls instead of covering them. Buttons retain 44-pixel minimum targets, and late feed responses after navigation are guarded.
- Verification: TypeScript and **126 mobile tests**, **9 web tests**, the web syntax check, and the targeted Django reel lifecycle test passed. Coverage includes like/unlike, repeated taps, comment creation/replies/editing/cascade deletion, shared counts, themes, and accessible state. iOS and Android Hermes exports succeeded at `/private/tmp/socialquest-reel-actions.MqR1B3`.
- Physical-device/browser visual testing was not performed for this change. Backend coverage used a separate test database; no real posts, accounts, or uploads were changed.

## Floating glass navigation, tab sliding, and chat — 14 October 2026

- Investigated the user's screenshot: the navigation layout reserved space below the scroll viewport, leaving a uniform background beneath its glass. Supported iOS builds now place navigation above the full content viewport; measured bar height and safe-area clearance are added inside Home, Events, Chats inbox, Reels, Alerts, Profile, and Settings scroll content. Scroll indicators avoid the overlay. Older iOS, Android, and Reduce Transparency retain in-flow fallback layouts.
- Added `SlidingTabs`: horizontal drag-to-select with an animated highlight, one navigation commit on release, normal taps, accessible tab labels/states, and red unread counts. Narrow/wide tracks and Reduce Motion are covered; vertical/multitouch/terminated/off-bar gestures cancel without navigation.
- The conversation header and composer now float over messages on supported iOS. Header/composer/emoji-tray heights are measured to reserve scroll clearance; global app bars remain hidden in chat. Keyboard lift reports conservative occlusion until native-driven animation completion and rejects stale frame measurements. Read receipts use measured message frames and exposed viewport bounds so covered messages are not acknowledged.
- TypeScript and **122 mobile tests** passed (11 added in this change), covering drag selection/cancellation, theme/fallback controls, safe-area/large-control layout calculations, settings clearance, chat occlusion and read timing, and keyboard transitions. iOS and Android Hermes exports succeeded at `/private/tmp/socialquest-floating-glass.jxpJvL`.
- Physical-device native rendering/gesture smoothness remain unverified because no iOS simulator/Xcode is available here. README includes a targeted reload/phone smoke checklist. No backend, website, account data, or native dependencies changed.

## Expo native Liquid Glass on iOS — 14 October 2026

- Retained the existing SDK 57-compatible `expo-glass-effect` dependency (installed version 57.0.4). Expanded native glass from toolbars to search/notification buttons, the own-profile Settings gear, Settings back control, post-creator close control, and shared profile/event sheet close controls. Bottom navigation, chat header/composer, and the post-composer footer continue using native material. Content cards and nested profile tabs are not native glass; chat still hides global navigation/header.
- Removed the heavy neutral tint and simulated gradient/edge overlays on native material so UIKit supplies refraction and highlights. Cleared opaque control backgrounds, matched material radii to controls, and retained decorative-only, non-intercepting layers with existing accessible touch targets.
- Glass follows the app theme and is gated by both native API/build availability and Reduce Transparency. Fixed the initial accessibility-read race so a stale read cannot undo a newer OS event. Screen transitions keep full opacity when glass is active, retaining translation/scale and Reduce Motion behavior. Older iOS/Android retain tinted fallbacks; reduced-transparency surfaces are fully opaque.
- Verification: TypeScript and **111 mobile app/theme/settings/glass tests** passed, including eight new native/fallback/theme/accessibility/transition tests. Offline Expo dependency validation reported dependencies up to date (offline validation is advisory). iOS and Android Hermes exports succeeded at `/private/tmp/socialquest-glass-export.qvPAFw`.
- Native visual rendering is not verified: this machine has Command Line Tools but no configured full Xcode/simulator. README includes iOS 26+ support, compatible-build requirements, and a physical-device smoke checklist. No backend, website, account data, or navigation destinations were changed.

## Settings entry moved to Profile — 14 October 2026

- Removed Settings from bottom navigation, leaving five destinations. Added a muted, borderless gear beside Edit profile on the signed-in user's own Profile page, with a 44 × 48 px touch target and an accessible label/hint. Other members' profiles do not expose it.
- Settings remains a separate page with all existing preferences and account controls. Added Back to profile and made Android Back return there; no backend, account lifecycle, or database changes were needed.
- TypeScript and all **103 mobile app/theme/settings tests** passed, including updated navigation and back-button coverage. Updated README instructions.

## Separate mobile Settings page and account lifecycle

- Added a full, scrollable Settings destination in the bottom navigation. Appearance, device notifications, private discovery location, logout, deactivation, and scheduled deletion are grouped there instead of in Profile/Alerts. The bell still opens Alerts; navigation stays at six destinations and text can shrink slightly on narrow phones. Settings supports iOS keyboard insets and both themes.
- Device location is the default and asks for foreground permission only for Nearby. Saved city uses offline searchable suggestions with approximate center coordinates, an existing-profile-city option, and arbitrary typed cities using text matching. Preferences persist on the account without exposing coordinates publicly or changing the public profile/event venue. No new geocoding service, native dependency, or location tracking was introduced.
- Password-confirmed deactivation hides profiles/posts/hosted events, redacts inactive identities in shared chat responses, disables notification devices, and revokes all API/browser sessions. Correct-password API login reactivates it indefinitely. Scheduled deletion uses a strict server-side 90-day cutoff; login before it cancels the countdown, while login at/after it is rejected regardless of worker availability. Admin-disabled accounts are not self-reactivated.
- Added serialized login/purge, protected chat-device cleanup, account cascades, and durable retries for failed public-upload deletion. Stale profile/location saves update only their supplied fields so they cannot undo a later deletion request. Existing private-event visibility boundaries survive host deletion.
- Backed up the local SQLite database to `/private/tmp/socialquest-settings-backup.kdcZ9T/db.sqlite3`, then applied migrations `0019` and `0020`. No real account was deactivated or scheduled/deleted during testing; pending-account and upload-cleanup counts were both zero. The local `purge_accounts --watch` worker was started. Production must supervise this worker, monitor cleanup errors/backlog, and define backup/CDN retention separately; see README.
- Verification: the full **135-test Django suite**, **102 mobile app/theme/settings tests**, **11 startup tests**, **15 attachment tests**, **9 web tests**, TypeScript, migration consistency, and Django checks passed. **16 account/lifecycle tests** cover recovery boundaries, session invalidation, public visibility, setting isolation/validation, stale saves, attachment protections, hosted-event cleanup, and retryable storage failures. Final iOS/Android Hermes exports succeeded at `/private/tmp/socialquest-settings-export.9UeD1f`.
- Inspected the actual Settings component/style tree in isolated browser approximations at **320 px (light, city dropdown)** and **390 px (dark, deletion panel)**. Both had zero horizontal document overflow and readable controls/copy. Native keyboard, notification permissions, and physical-device interaction remain unverified. The temporary preview server/tab were closed. The user's Django development server was not responding on port 8000 at the final check and must be started before phone/API testing.

## iPhone reel byte-range playback fix — 13 October 2026

- Reproduced the reported MOV failure: the default Django development media view returned the entire 3,741,465-byte file for `Range: bytes=0-1`. The file was already uploaded; AVFoundation failed while probing playback tracks.
- Added bounded single-range streaming for public development media, with correct partial-content headers, seek/suffix support, unsatisfiable-range responses, conditional requests, and file cleanup on early disconnect. The route remains development-only and rejects path/symlink escapes; private chat relay storage is not exposed. Production hosting still requires a range-capable media server.
- All **119 Django tests** passed, including **12 new media tests**. Real HTTP checks against the running server and the reported MOV returned exactly 2 bytes for the iPhone probe, 80,001 bytes for a mid-file seek, and an empty 416 for a range beyond EOF. No upload, native dependency, or database changes were required. Physical iPhone playback remains to be rechecked by the user.

## Encrypted chat attachments — 13 October 2026

- Added mobile Photos/videos and Files pickers, optional captions, image viewer, video playback, and save/share controls; added the corresponding web attachment composer and encrypted local-cache renderer. Existing themes, unread behavior, and chat gestures remain intact.
- Shared versioned attachment format: AES-256-GCM (12-byte nonce, 16-byte tag, message-context AAD), per-device TweetNaCl key/metadata envelopes, native secure randomness and SecureStore identity, browser Web Crypto and IndexedDB identity. Native and browser local caches contain ciphertext; ACKs occur only after read-back and decryption verification. HTML/SVG and other active documents use download-only octet-stream blobs, not same-origin executable previews.
- Added private authenticated relay storage, exact recipient-device snapshots, immutable device keys, retry idempotency, per-file/per-sender limits, automatic foreground saving without read receipts, early all-device-confirmed deletion, and a 24-hour expiry. The dedicated cleanup command sweeps early, retries filesystem/database failures, and does not claim deletion on failure. SQLite write-lock ordering was corrected after real browser QA exposed an ACK race.
- Applied migration `0018` to the local database after a SQLite backup at `/private/tmp/socialquest-attachment-backup.2IKHuA/db.sqlite3`. The cleanup worker is running locally; deployment still requires a supervised worker, private storage excluded from backups/CDNs, and HTTPS. The temporary QA server on port 8012 was stopped; its synthetic test database was separate from user data.
- Verification: full **107-test Django suite** passed, including **16 attachment API tests**; **92 mobile app/theme tests**, **11 startup tests**, **15 crypto/storage tests**, and **9 web tests** passed. TypeScript, migration checks, and final iOS/Android Hermes exports passed (`/private/tmp/socialquest-attachments-ios.VO1dnW`).
- Real Chromium end-to-end testing used two isolated browser accounts, one at 390 px: verified sending while the registered recipient was offline, exact downloaded bytes, relay deletion after all ACKs, reopening local copies after reload, full-screen photos, actual WebM decoding, and the unavailable-on-new-device state. Desktop/mobile screenshots were inspected at `/private/tmp/socialquest-attachment-desktop-web.png` and `/private/tmp/socialquest-attachment-mobile-web.png`. Final browser application-error collection was empty. Native iPhone/Android picking, filesystem/crypto integration, playback, and sharing remain unverified on actual devices.
- Limits: encrypted temporary relay, **not direct P2P** or the WhatsApp/Signal protocol; no audited forward secrecy or independently verified device identity. Chat text/captions remain server-readable. Offline devices must return within 24 hours; new devices and cleared local storage cannot recover expired files. Local recipients can keep/share files. Physical server deletion depends on a healthy worker and storage; access is independently denied at expiry.
- Dependency audit still reports 30 warnings (9 moderate, 20 high, 1 critical), including existing toolchain packages such as `shell-quote`; the added `expo-sharing` warning is inherited through `@expo/config-plugins`. No advisory was returned for `expo-crypto`, `tweetnacl`, `expo-document-picker`, or the added esbuild version. Broad Expo/toolchain upgrades were not attempted in this feature change.

## Website startup repair — 17 September 2026

The blank page was caused by duplicate `const` declarations in `renderEventDetail` (`requests`, `questEmptyMessage`, `questList`, `eventMoments`, and `hostControls`). The syntax error prevented any of `app.js` from executing, leaving the static navigation and profile placeholders uninitialized.

- Removed the duplicate legacy blocks and retired quest-proof review calls, retaining attendance approval and instant quest XP behavior.
- Normalized quest, attendee, and request responses so event details also accept paginated API results.
- Reconnected the full post/quest creator and restored scoped comment refreshes, authoritative cascade counts, and draft preservation.
- Updated the application asset URL so a page reload fetches the repaired script.
- Added complete-script compilation/dependency-order checks and a web host-event regression test. Confirmed the new compilation check rejects the original broken file.

Verification: 15 app regression tests and 8 web tests passed; all scripts loaded by the website compile; login/worker syntax and Django system checks passed. Browser verification used the separate `/tmp/socialquest-bugfix-browser-20260917` database: all six main destinations, people search/followers, profile tabs, host event details, quest creator, a complete text-post publish, comment submission, and mobile chat navigation. Inspected desktop (1440 × 1000) and phone (390 × 844) layouts; the post creator and home feed also fit 320px without horizontal overflow. No browser console errors or warnings were recorded. Native device push delivery and media uploads were not re-tested for this startup repair. Real user data was not modified.

## App review fixes — 17 September 2026

Fixed the eight findings from the `App.tsx` / `app.js` review:

- Removed the duplicate `requests` declaration that prevented native compilation.
- Removed obsolete host proof-list/review calls and controls; attendance approval still uses the supported request endpoint.
- Removed duplicate composer fields/buttons, quest notices/actions, and event post rendering.
- Kept acknowledged chat messages sent when subsequent refresh requests fail, and prevented failed sends from restoring text into a different conversation.
- Guarded native comment writes against repeated taps and kept failed writes retryable.
- Discarded stale comment responses after switching or closing a post, including closing and reopening the same post. Completed writes do not clear another post's draft.
- Updated web comments in place after submission, so late saves cannot navigate to another post or replace the current page.
- Refetched authoritative comments/counts after deletion so cascaded replies disappear from both the post dialog and feed while existing drafts remain intact.

Verification: TypeScript and web syntax checks passed; 14 new async-handler regression tests, 11 existing startup/notification tests, and 6 web notification-worker tests passed. Android and iOS production bundle exports succeeded. Run the new tests with `npm --prefix mobile run test:app`.

Browser smoke testing used `/tmp/socialquest-bugfix-browser-20260917` with synthetic users/posts and reached the post detail/comment interface. The browser automation connection stalled at the deletion confirmation, so the end-to-end deletion and delayed-navigation checks were not completed in the browser; both paths have automated handler coverage. No physical-device smoke test was performed. The temporary test server was stopped; production data was not changed.

## Post creation interface — 16 September 2026

Replaced the small post composer with a full Media → Details → Preview flow on the web and in the native app. Includes photo/video selection, photo crop/rotate/mirror tools, video preview, a larger caption field with a counter, optional location, feed preview, and publishing feedback. The web layout uses two columns on desktop and a full-screen dialog on phones. Quest proof uses the same interface.

Drafts can be kept or discarded, with separate drafts for regular posts and each quest. They last only for the current page/app session. Failed publishing preserves the draft; a refresh failure after a successful upload no longer reports the upload as failed. Posts still support one media file, up to 50 MB.

Verified in an isolated database/media directory under `/tmp/socialquest-social-feature-check`:

- Browser layouts at 1440 × 1000, 390 × 844, and 320 × 740, with no horizontal overflow at the narrowest width.
- Photo selection, 4:5 crop (1200 × 800 to 640 × 800), caption/location, save and reopen draft, preview, and successful publishing.
- Empty text/reel validation and draft confirmation controls, including inert background controls.
- Stopped the local server before publishing, confirmed the draft remained available, restarted the server, and retried successfully. The test database contains exactly one retry-test post.
- Web JavaScript syntax and CSS parsing; native TypeScript; all 11 startup/notification tests; final Android and iOS production bundle exports.

Physical-device camera, keyboard, GPS, and video playback were not exercised for this change. No production data was modified and no deployment was performed.

## Fixes

### Web

- Restored the HTML `hidden` attribute across registration fields, notification badges, previews, and profile panels.
- Made all six destinations accessible from mobile navigation, with logout available from Profile.
- Improved long-content wrapping, small-screen form sizing, native input sizing, dialog scrolling, sidebar controls, and keyboard focus targets.
- Kept the chat composer above the mobile navigation and made desktop message history scroll inside the chat panel.
- Followed API pagination so conversations, messages, replies, profiles, and notifications do not silently stop after 20 records.
- Added complete unread counts and prevented late responses from overwriting a screen after navigation.
- Added login network/error feedback, safe return URLs, duplicate-submit guards, and file-preview cleanup.
- Fixed profile updates with no selected avatar, post media-type selection, and event publication recovery when quest generation fails.
- Added instant proof submission feedback and a quest-generation retry control; made event titles accessible by keyboard.
- Connected Following to the following feed and the sidebar people link to a community directory.
- Removed fixed XP claims from recommendation cards that did not correspond to awarded rewards.

### API

- Validated profile field lengths and avatars through a serializer.
- Validated partial event date edits, minimum capacity, and capacity below existing attendance.
- Auto-approved valid event submissions and awarded XP immediately without a host-review endpoint.
- Rejected duplicate quest proof with a validation response to prevent repeated XP awards.
- Made repeated RSVP decisions safe at capacity and avoided duplicate-notification failures.
- Restricted private events and their post/comment APIs to the host and accepted guests.
- Added notification unread counts and made an explicit empty ID list mark nothing as read.
- Validated upload sizes and declared media types; video post uploads become reels.
- Validated generated quest fields/rewards, bounded fallback titles, and ensured different fallback side quests.
- Loaded `.env` as documented, without replacing existing environment variables.

### Expo client

- Added video playback using the SDK-compatible [Expo video player](https://docs.expo.dev/versions/v54.0.0/sdk/video/) and enabled video selection for reels/proof.
- Added working likes, follow/unfollow controls, and a permanent Reels navigation item.
- Added hosted/joined event history, host request controls, and instant quest-proof status.
- Fixed pagination, session-expiry handling, stale chat responses, background polling errors, refresh indicators, and upload/send guards.
- Added field length limits, smaller-screen wrapping, readable navigation labels, font-load fallback, and consistent Android navigation colors.
- Avoided overlapping event/action modals and replaced the four-option Android message alert with a complete action sheet.

## Verification

| Check | Result |
| --- | --- |
| Django system checks | Passed |
| Django API tests | 36 passed, including 9 new regression tests |
| Migration consistency | No changes detected |
| Web JavaScript syntax | Both files passed |
| Stylesheet parsing | All 6 stylesheets passed |
| JSON configuration parsing | All 5 configuration/manifest files passed |
| Expo TypeScript | Passed |
| Android production JS/assets export | Passed |
| iOS production JS/assets export | Passed |

Browser tests covered Home, Explore, Chats, Notifications, Reels, Profile, event detail, and post detail at widths **320, 390, 768, 1024, and 1440 px**. All 40 combinations had document width equal to viewport width. Desktop and phone screenshots were visually inspected; no JavaScript console errors were recorded in the final sweep.

Interactive browser checks passed for login, incorrect-password recovery, registration field visibility, mobile logout, profile edits without a new avatar, post creation, event creation, search, instant proof submission, a 26-message chat plus a new message, and a 24-reply post plus a new reply. At 320 × 740, the chat composer ended at y=670 and the navigation began at y=670, so they did not overlap.

## Comment field follow-up

Fixed a shared width rule that collapsed feed comment inputs. Feed and post-detail reply forms now use full-width, three-line textareas (98 px tall in the browser) and 44 px Reply buttons. Replies preserve line breaks, and native reply inputs have a 96 px minimum height. Updated asset versions so browsers load the fix.

Verified field dimensions and horizontal fit at 320, 390, and 1440 px, submitted multiline replies from both web forms using the isolated audit database, and checked reply-field focus. No browser console errors were recorded. JavaScript syntax, CSS parsing, and native TypeScript checks passed.

## People lists, Home search, and chat presence — September 14

- Added paginated, searchable followers/following endpoints and clickable counts on web and native profiles, including the signed-in user's following count. List entries open profiles. Home now has a people-search icon with loading, empty, and error states. Search accepts display names, usernames, and `@username`; inactive accounts are excluded consistently from lists and counts.
- Replaced the unconditional chat green dot with authenticated per-device presence. Foreground clients renew a 60-second lease every 20 seconds; hiding the browser tab, backgrounding the mobile app, or logging out releases presence. Chat refreshes status every 5 seconds and hides its indicator when status cannot be fetched. Other active devices keep the person online. Presence is included only in authenticated conversation participant data, not public profiles.
- Applied migration `0011_user_presence` to the local project database. UI test accounts and relationships were created only in `/tmp/socialquest-social-feature-check/db.sqlite3`.
- All **43 backend tests passed**; the **7 new regression tests** also passed after adding `@username` and malformed profile-ID coverage. TypeScript and Android/iOS production Hermes exports passed. Migration consistency reports no pending model changes.
- Browser checks passed for Home search, opening a matching profile, all 23 followers across API pages, filtering within followers, following lists, empty search results, and the automatic Online-to-offline transition when a test lease expired. Layouts were inspected at 320, 390, and 1440 px; the final 320 px Home search target is 44 × 44 px with no horizontal document overflow. No browser console errors or warnings were recorded. Native physical-device UI and app-background behavior still require a device smoke test.

## Device notifications — September 15

- Added permission controls to Home and Alerts in both clients, browser Web Push and Expo Push delivery, and a local polling fallback. Registrations belong to the authenticated account; disabling notifications and logout revoke delivery. Chat messages remain separate from the in-app Alerts feed.
- Foreground Chats presence suppresses new and queued message alerts. The browser worker and native foreground handler check again when displaying a notification. Other activity continues to notify.
- Applied `0013_notification_delivery` locally, generated an ignored private VAPID signing key, and started the local `deliver_notifications --watch` worker. Expo receipts, retries, expired subscriptions, and duplicate delivery claims have regression coverage.
- All **62 Django tests** and **6 browser-worker tests** passed. TypeScript, Android/iOS Hermes exports, JavaScript syntax, and migration consistency passed. Provider delivery was tested with mocks; live APNs/FCM delivery was not exercised.
- Inspected permission controls on Home and Alerts at desktop and phone sizes, including 320, 390, and 1440 px. Checked no horizontal overflow and a 44 px browser action height. The preview browser denies notification permission; the UI displays the appropriate settings guidance. No browser console warnings or errors were recorded.
- Added the Expo notifications module/plugin and regenerated native projects with Expo prebuild. An installed custom app must be rebuilt. This repository has no EAS project ID or configured push credentials, so background phone delivery remains pending EAS/APNs/FCM setup. Without it, native notifications use foreground local delivery. Browser push requires HTTPS or localhost; plain HTTP LAN access cannot request permission. Physical-device permission, delivery, and suppression checks remain pending.

## Android Expo Go startup fix — September 16

The reported red screen was caused by `expo-notifications` 57.0.18's package entry point: importing it eagerly loads `DevicePushTokenAutoRegistration.fx`, which registers a push-token listener and throws in Android Expo Go. Checking the environment only when requesting a token was too late.

Added a notification adapter that imports local APIs separately and loads remote push only after checking for a configured project and a runtime outside Expo Go. This preserves local permission, scheduling, notification-tap, and chat-suppression behavior in Expo Go. The SDK-specific import paths are covered by startup regression tests that execute the installed local notification modules with native bridges stubbed.

All **11 startup tests** passed, including **7 notification regression tests** for Android/iOS Expo Go, development builds, denied permissions, missing project IDs, and failed push registration. TypeScript and both Android/iOS development JavaScript exports passed. Physical-device restart and notification display remain to be confirmed; remote background push still requires a configured custom build.

## Verification limits

On September 14, investigating the iPhone's “bad URL” report revealed an invalid generated tunnel hostname, `bt_85kq-anonymous-8081.exp.direct`. The npm startup command now validates the saved Expo hostname seed and replaces invalid values with random hexadecimal characters, preserving other settings and valid existing values. Four startup regression tests pass. The restarted server returned HTTP 200 for its SDK 57 iPhone manifest; all manifest hostnames passed validation and ngrok registered the corrected endpoint. Public access could not be verified from this Mac because its DNS resolved the new `exp.direct` hostname to `0.0.0.0`. The user subsequently reported that the phone still displayed “bad URL,” so the hostname correction alone did not establish a working phone connection.

After the user confirmed both devices share Wi-Fi, the development session was switched to LAN. Django was started on `0.0.0.0:8000` with the computer's Wi-Fi IP explicitly allowed, and Expo was started in LAN mode with `EXPO_PUBLIC_API_URL` pointing to that API. Requests through the Wi-Fi IP returned HTTP 200 for the Django API root, SDK 57 iPhone manifest, and iOS bundle. The bundle contains the correct LAN API URL. A fresh LAN QR code was provided; actual phone launch still requires confirmation on the device.

The LAN QR image was independently decoded to `exp://192.170.14.218:8081`, matching Expo's `/_expo/open` response. The user reported that Safari downloaded the `/status` response, indicating that the phone reaches Metro. The CLI account and manifest username are `harshavrdn`, and the user confirmed the same account in Expo Go, satisfying the documented SDK 57 iOS sign-in requirement. The phone's installed Expo Go version and successful app launch remain unconfirmed; “bad URL” is still unresolved on the physical device.

The mobile app was subsequently upgraded from Expo SDK 54 to **57.0.22**, with React Native **0.86.3**, React **19.2.3**, TypeScript **6.0.3**, and Expo-aligned native modules. Removed the obsolete system-bar setters and props, moved Android navigation-bar settings to its config plugin, and switched media uploads to Expo File objects for compatibility with SDK 57's default fetch implementation. The local ngrok dependency remains available.

SDK 57 verification: **21/21 Expo Doctor checks passed**, TypeScript passed, and production Android/iOS JavaScript and Hermes bundle exports passed. Tunnel startup on port 8082 reported “Tunnel connected” and “Tunnel ready”; the temporary test server was stopped afterward. These are bundle and configuration checks; physical-device uploads, camera/GPS, system-bar appearance, and native app binary compilation were not exercised.

- Native Android/iOS bundles were compiled and type-checked; no physical device or simulator session was used. Camera, GPS, hardware keyboard behavior, and native video playback still need a device smoke test.
- Web responsive emulation was performed in the available Chromium browser. Safari/Firefox and actual mobile keyboards were not exercised.
- Browser media tests used an image fixture; the Reels screen's empty state was checked. Real video playback was not manually exercised.
- The Python 3.9 environment emits the existing urllib3/LibreSSL compatibility warning. Local checks pass; use an OpenSSL-supported Python runtime for production network integrations.
- API privacy checks do not turn Django's development `/media/` serving into protected file storage. Private production media needs access-controlled storage/delivery.
- This was a local functional audit, not a production load test or a guarantee that every possible defect has been eliminated. No deployment was performed.

## Mobile visual refinement — October 4

- Replaced mobile pixel fonts with native system typography and consolidated the stacked theme overrides into `mobile/appStyles.ts`, with shared palette values in `mobile/theme.ts`.
- Refined cards, inputs, avatars, profile stats, event artwork, sheets, navigation, and the post composer with continuous rounded corners, quieter borders, more consistent spacing, and muted lavender accents. Removed the login grid and sharp text shadows.
- Added native-driver press feedback, short screen/composer transitions, and fading photo-like feedback. Animations do not block list rendering and respect Reduce Motion. Transparent modal backdrops fade; Reduce Transparency retains opaque surfaces.
- Home now links to notification setup through a compact prompt when needed; the full permission controls remain in Alerts.
- TypeScript, all 20 app regression checks, all 11 startup checks, and iOS/Android Hermes exports passed.
- Browser-rendered React Native previews used isolated sample data and mocked native services. Inspected Home, login, chat, profile, event detail, and the composer at phone sizes. At 320 px the Home layout had no horizontal overflow and all six navigation targets measured at least 44 × 44 px. Verified Media → Details → Preview preserves the caption.
- No simulator or physical phone was available. This preview does not verify native animation frame rate, the system keyboard, native glass rendering, or video playback. The web client was not restyled.

## Purple pixel theme and mobile player flows — October 4

- Restored gamified purple colors with Press Start 2P headings and Pixelify Sans body/control text while retaining the rounded surfaces, gentle press feedback, and reduced-motion support from the previous refinement.
- Added authenticated profile editing for display name, bio, city, and avatar. Successful saves update the current player and visible post authors; failed saves preserve the form, and a changed session discards stale results.
- New host forms request foreground location and fill the venue plus latitude/longitude. Detection has a deadline, can be retried, and never overwrites a manual edit or a different/closed form. Existing events retain their saved venue. Updated the location permission explanation in Expo configuration and the generated iOS plist.
- Active quests now expose Complete quest to accepted attendees. Photo/reel submission publishes the moment and awards XP through the existing endpoint; completed quests show their earned XP. Saved drafts are keyed separately by quest and regular post. Duplicate taps are guarded, and refresh failures cannot misreport an acknowledged publish as failed.
- Added a read-only event name to post API responses and a quiet event/quest attribution line in posts, reels, and quest composer previews. Backend coverage verifies photo and video completion, attribution integrity, XP, and private-event filtering.
- All 68 Django tests, 31 app regression checks, and 11 startup checks passed. TypeScript and iOS/Android Hermes exports passed. No database migration was needed.
- Inspected isolated React Native browser previews at 320 and 390 px: pixel typography, login, profile editing and saved-name refresh, hosting with simulated GPS and manual venue edits, quest completion entry/composer, and reel attribution. Home had no horizontal overflow at 320 px; every bottom navigation target remained at least 44 × 44 px. No browser console errors were observed. Native services used fixtures; real device GPS, avatar/photo picking, video playback, and modal/keyboard behavior still require a phone smoke test.

## Post times, event group chats, and mobile image zoom — October 7

- Mobile posts and reels now show relative publication times, from Just now through minute/hour/day labels and combined year/day labels. A shared foreground clock refreshes the labels; accessibility text retains the full local timestamp. Invalid dates are omitted and future clock skew displays Just now.
- Added one conversation per event, synchronized to the host plus accepted attendees. RSVP approval and accepted invitations add members; cancellation, denial, and attendance removal revoke access. Event names update group names. Pending/invited outsiders cannot fetch the chat, read its messages, or send messages. Event deletion cascades to its chat/messages, which both clients' event-deletion prompts now explain.
- Added the event group shortcut, group icons/counts, participant roster, and sender names to mobile chat. Polling drops an open event chat when access disappears. Group titles follow the event; direct-chat rename and inbox hiding still work.
- Applied migration 0016 to the local database after a SQLite backup in /tmp. Backfilled all 5 existing events with 5 event conversations; checked that every membership set exactly matches its host and accepted attendees.
- Post photos open in a fullscreen viewer with bounded 1–4× pinch zoom, double-tap zoom, dragging, and accessible zoom/reset buttons. Feed double-tap-to-like remains available. Image sizing is contained without distortion, and loading/failure states are handled.
- All 74 Django tests, 36 app regression tests, and 11 startup tests passed, along with TypeScript, web JavaScript syntax, migration consistency, and iOS/Android Hermes exports. Regression coverage includes timestamps, focal zoom/bounds, feed taps, duplicate group-open taps, revoked access, private events, backfill, and attendance lifecycle changes.
- Inspected isolated native-component browser previews at 320 and 390 px. Verified timestamps, event-to-group navigation, roster, group sender labels, image opening, zoom controls, double-tap, panning, and reset. The viewer fit 320 px without horizontal document overflow. Corrected image-load handling found during preview. No errors appeared in the final browser check; existing React Native Web deprecation/native-driver warnings remain preview-only. The inverted chat content was initially attributed to the browser bridge; the user's subsequent iPhone screenshot showed that this also affected native empty-chat content. See the October 8 correction below. Real multi-touch pinch, native modal transitions, and keyboard behavior still require a physical-device smoke test.

## Upright chats and fullscreen photo clarity — October 8

- Replaced the inverted chat list with chronological, upright rendering. Short conversations remain bottom-aligned. The list follows new messages when already near the bottom or when the user sends a message, and preserves reading position when browsing history. Empty cards also forward normal View styling and measurement props.
- The photo viewer now waits for both the original image dimensions and the available viewport before mounting its image. It no longer treats potentially downsampled native load-event dimensions as the original size. Retina-aware rendering retains more source pixels for zoom, with a 4096-pixel longest-edge budget for ordinary phone viewports. Dimension/loading failures have a retry action.
- All **41 app regression tests**, TypeScript, and Android/iOS production Hermes exports passed. Added coverage for upright-list scrolling, empty-card props, image render resolution, delayed metadata, downsampled load events, and retry after metadata failure. No backend changes or migrations were needed.
- Verified upright empty and populated conversations in the isolated 390 px native-component browser preview, then opened a 50-message conversation and sent a fixture message: the newest message stayed visible above the composer. Verified photo opening and zoom controls; no browser console errors appeared. Native iPhone decoding, physical pinch gestures, and keyboard interaction were not exercised on a device. Existing low-resolution uploads remain limited by the pixels in their stored files.

## Mobile color variety — October 8

- Kept the purple brand and pixel typography, and changed shared cards/fields to neutral dark slate. Added reusable accent palettes: mint for events/completion, sky blue for chat/replies, gold for XP/alerts, rose for reels/likes, and coral for negative status. Labels and icons continue to identify states independently of color.
- Applied accents to navigation and selected tabs, notification icons, chat bubbles/toolbars, profile stats, fallback avatars, location controls, quest rewards, and the post composer. Event fallback artwork now alternates warm plum/coral and teal/blue gradients. Native glass and opaque accessibility fallbacks use the same requested tint.
- TypeScript, all **41 existing app regression tests**, and Android/iOS production Hermes exports passed. Accent text contrast against its matching tinted surface ranges from **6.82:1 to 9.22:1**; muted text on those surfaces is at least **6.67:1**. White primary-button text measures **5.03:1**, and white outgoing-message text **8.85:1**.
- Inspected Home, profile stats, chat, notifications, event details, and quest completion in the isolated native-component browser preview at 390 and 320 px. At 320 px, Home had no horizontal document overflow and all six navigation targets measured 44 px wide. No browser console errors were recorded. Native glass appearance on a physical phone was not exercised; the web client was not changed.

## Mobile event calendar and time input — October 9

- Replaced timestamp text entry in new/edit event forms with labeled date/time cards and a themed month calendar. Hosts select a day, hour, minute shortcut, and AM/PM; one-minute controls retain exact existing times. A persistent confirmation button applies the draft, and Back/Cancel discards it. The hosting form stays mounted to retain its details and scroll position.
- Uses device-local wall time and preserves the existing UTC API conversion. End dates before the start are disabled, equal/earlier end times are rejected with a visible message, and moving a start beyond its end shifts the end to preserve duration. New event defaults round up to five-minute boundaries. Impossible dates and times skipped by daylight saving are rejected.
- All **47 app regression tests**, TypeScript, and final Android/iOS production Hermes exports passed. New coverage includes calendar alignment, leap years, invalid dates, midnight/noon, local-to-UTC round trips, daylight-saving gaps, year-boundary duration preservation, cancellation, exact-minute edits, and end-time validation.
- In an isolated native-component browser preview, selected November 21 at 6:30 PM, confirmed the automatic 8:30 PM end, canceled an invalid end-time draft, published to the fixture API, and reopened editing with the saved schedule intact. Inspected 390 and 320 px layouts; calendar day targets were 44 × 44 px at 320 px, time choices were at least 44 × 44 px, validation stayed visible above confirmation, and no horizontal document overflow or browser console errors occurred. Actual phone interaction remains unverified. No native dependencies, backend changes, or database migrations were added.

## Cohesive mobile palette revision — October 9

- Revised the mobile colors to charcoal surfaces, warm white text, soft lavender accents, and consistent purple primary actions. Inactive navigation and ordinary cards now share neutral colors. Pixel typography, rounded layouts, and existing motion remain intact.
- Reduced large tinted panels across Home, profile stats, chat, notifications, quest details, the post composer, and event scheduling. Gold highlights rewards, sage indicates completion/acceptance, and coral indicates negative status. Event artwork uses subdued violet and slate gradients; outgoing messages use muted plum.
- TypeScript, all **47 app regression tests**, and Android/iOS production Hermes exports passed. White primary-button text measures **5.50:1** contrast, body text on cards **14.23:1**, muted text on cards **7.87:1**, and outgoing-message text **11.55:1**.
- Inspected the actual native components in an isolated browser preview with fixture data: Home, profile, composer, and group chat at 390 px, plus the event calendar at 320 px. The calendar had no horizontal document overflow, and the browser recorded no console errors. Physical-device appearance, native glass, and native animation performance were not exercised. The web client and backend were not changed.

## Mobile theme matched to the website — October 9

- Replaced the charcoal/lavender palette with the active website's dark theme from `web/static/pixelquest.css`: midnight navy, cream text, purple/violet, cyan, lime, gold, pink, and coral. Verified all 14 corresponding shared colors match the website CSS exactly. Solid primary buttons use the website's darker violet for readable white labels.
- Applied the palette through mobile cards, fields, navigation, profile tabs, status indicators, composer, calendar, native glass tints, and image viewer. Event artwork, selected controls, and incoming/outgoing chat bubbles use colors from the website's component styles. Existing rounded geometry, pixel typography, and motion remain unchanged.
- TypeScript, all **47 app regression tests**, and final Android/iOS production Hermes exports passed. Contrast checks measured **6.65:1** for primary-button text, **16.93:1** for body text on cards, **9.20:1** for muted text on cards, and **7.89:1** for selected cyan navigation labels on purple.
- Inspected Home, chat, and profile at 390 px and the composer at 320 px in the isolated native-component browser preview. The composer had no horizontal document overflow, and no browser console errors were recorded. Physical-device rendering and native glass were not exercised. No website, backend, or database changes were needed.

## Departure Mono across web, iOS, and Android — October 9

- Bundled the unmodified Departure Mono v1.500 release from the author's `rektdeckard/departure-mono` repository. Mobile loads the local OTF through Expo Font; both website entry pages preload the local WOFF2. Included the author's README and SIL Open Font License beside each asset. Removed the old Google font requests and mobile font packages.
- Applied the regular face to headings, body text, inputs, navigation, and controls. Disabled browser font synthesis and removed explicit native weight/italic overrides so the single-weight face stays consistent. Increased the website's tiny display-font labels to at least 11 px and adjusted heading sizes. Expanded narrow mobile navigation labels and let web filter widths follow their text to avoid clipping at 320 px.
- TypeScript, **47 app regression tests**, **11 mobile startup/notification tests**, and **8 web tests** passed. Final iOS and Android production Hermes exports include `DepartureMono-Regular.otf`; no old text fonts remain in the exported asset list.
- Verified the real font loaded in isolated previews using fixture data. Inspected website Home at desktop and 320 px widths, the web login form at 320 px, and native-component Home/chat at 390/320 px. At 320 px all six mobile navigation labels fit, their targets measured about 49 × 54 px, and neither Home preview had horizontal document overflow. Corrected the mobile chat subtitle sizing and verified its final rendering. No application console errors were observed. Actual iOS/Android device font rasterization remains unverified; no backend changes or migration were required.

## Final UI alignment and typography pass — October 9

- Standardized mobile screen gutters to 20 px, card padding to 16 px, primary/paired actions to 48 px, and single-line form fields to 52 px. Refined the type hierarchy with 26 px screen titles, 18–22 px section/card titles, 15–16 px body/input text, and smaller labels/metadata. Profile stats now share equal proportions; event and post artwork use consistent aspect ratios.
- Fixed the narrow chat header by placing online presence under the contact name, aligned the message field and toolbar buttons, and kept text inputs above the decorative glass layer. Improved wrapping in person rows, profile identities, rating/invite controls, and paired edit actions. Added persistent event name/description/capacity labels and top-aligned multiline descriptions.
- Aligned composer headers, steps, media controls, caption fields, and footer actions. Narrow layouts omit the redundant header step counter. Native composer steps reset their scroll position while preserving the draft.
- Applied shared web gutter/control/type scales across navigation, feeds, event cards, profile widgets, search, notifications, dialogs, login, and the post studio. Corrected overlapping quest-card text, equalized score widgets, and styled the previously unstyled location action. Updated stylesheet asset versions.
- Verification: TypeScript passed; all **47 app regression tests** and **8 web tests** passed; both active stylesheets parse; iOS and Android production Hermes exports succeeded at `/tmp/socialquest-ui-sanity-export`.
- Used isolated fixture data to inspect actual native components at **320 and 390 px**, with all six main screens fitting and no horizontally clipped controls. All six native navigation targets measured approximately **49 × 54 px at 320 px**. All six website destinations fit **320, 390, 768, 1024, and 1440 px** without horizontal document/control overflow. Inspected login, profile editing, chat, replies, event detail, hosting/calendar, and both post composers; captions were retained through preview. Website chat composer and bottom navigation meet at y=670 in the 320 × 740 viewport without overlapping. Final browser error logs were empty.
- Native services and media playback were mocked in the browser preview. Physical iOS/Android font rendering, keyboard behavior, native glass, and device interactions remain unverified. No backend, database, dependency, or deployment changes were required.

## Separate Events / People search — October 10

- Added a shared search experience on web and mobile, reached from the Home search icon or Events / Explore. Equal-width Events and People tabs retain the query; a 300 ms debounce searches while typing. Added clear controls, result counts, loading/empty/retry states, and paginated Load more. Web tabs support arrow keys, Home/End, and Escape to clear the field. Inputs remain mounted during result updates.
- Added permission-scoped relevance search to the existing events and people APIs. Matching normalizes case, accents, punctuation, and whitespace; every query word must match across the relevant fields. Exact names rank ahead of prefixes and incidental mentions. Alphabetic words of four or more letters tolerate one insertion, deletion, substitution, or adjacent transposition; numeric handles and short terms retain literal matching. Private-event visibility, finished-event history filters, inactive-account exclusion, and follower/following scopes are preserved.
- Search requests cancel and ignore superseded responses on query/tab changes and navigation. Results load one API page at a time, while existing callers retain automatic pagination. Failed additional pages preserve loaded results and retry the same page. Native home recommendations remain independent of search results.
- Verified **84 Django tests**, **54 app regression tests**, **8 web tests**, TypeScript, stylesheet parsing, and production iOS/Android Hermes exports (`/tmp/socialquest-search-export`). Added regression coverage for ranking, typos/accents, combined fields, privacy, numeric usernames, relationship scopes, pagination, stale responses, retry, and navigation.
- Inspected desktop web and **390 / 320 px** web/native component previews using an isolated temporary Django database with synthetic users and events. Verified category changes, typo queries, result/profile navigation, pagination, keyboard tabs, and empty states; no horizontal document overflow or application console errors. Physical-device keyboard and rendering remain unverified.
- No dependency or database migration added. Current search scans eligible text in Python for SQLite portability; an indexed search backend is appropriate at larger scale. Updated web asset versions and README.

## Mobile event details scrolling after publish — October 10

- Replaced the event sheet's nested pressable containers with a dedicated `EventDetailsSheet`. The dismiss backdrop is a sibling of the sheet, so event content has no pressable gesture ancestors. The sheet has an explicit viewport height and a flex-constrained ScrollView, with safe-area padding below the last actions, a visible scroll indicator, and a persistent close button.
- Dismiss the keyboard when closing the hosting form. On iOS, the saved event sheet stays hidden until the editor's native `onDismiss` callback completes, preventing overlapping editor/detail presentations immediately after publishing or saving. Changing the event resets the scroll view identity; data refreshes for the same event retain it.
- TypeScript and **58 app regression tests** passed, including new coverage for bounded long content, independent backdrop gestures, fixed close controls, event scroll identity, and the iOS dismissal guard. iOS and Android production Hermes exports passed (`/tmp/socialquest-event-scroll-export`).
- Published a fresh event with a long description against the isolated sample database in the native-component browser preview. The details opened at offset 0 and scrolled to offset 956.5 (1663 px content within a 707 px viewport), exposing the host controls and Share action. Also reopened an earlier event and verified the close button. Physical iOS/Android touch and modal animations remain unverified.
