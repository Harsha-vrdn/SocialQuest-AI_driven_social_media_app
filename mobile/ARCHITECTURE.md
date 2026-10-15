# Mobile architecture

`App.tsx` installs the theme, safe-area, relative-time, motion, and glass providers,
then renders navigation and the active screen. It passes each memoized screen only
the state and actions that screen needs.

- `screens/` contains the six tab views. `ExploreScreen` owns its search input.
- Events discovery keeps its Explore/My Events selection inside `DiscoverSearch`.
  My Events uses the paginated `/events/?attending=true` endpoint, preserves text
  search and sorts active/upcoming requests, invitations and accepted plans by
  start time. Going cards have an accent border and badge; Requested/Invited use
  secondary badges. Joining/canceling increments `eventAttendanceRevision`, which
  immediately invalidates displayed event results and cancels obsolete requests.
  Canceling a private event closes its details because access has been revoked.
- `components/` contains reusable UI, including memoized `PostCard`, `EventCard`,
  `ReelItem`, and `ConversationRow`. `ChatComposer` owns message drafts and sending.
- `components/modals/` owns the event editor, post/photo composer, comments, people,
  and edit sheets. Event and post editors own their entire working drafts. The
  comments sheet owns its input, reply/edit targets, and request-version guards.
- `hooks/useSocialQuestController.tsx` coordinates session, navigation, and shared
  feed/event/profile updates. `useChatController.ts` owns conversation polling,
  message polling, read cursors, and the existing outbox lifecycle.
- `types.ts` defines shared API models. `utils/` contains display helpers and the
  identity-preserving reconciliation used for polled API data.

Encrypted chat uploads pass the persisted `expo-file-system` `File` directly to
FormData. SDK 57's default Expo fetch reads its bytes; legacy `{uri, name, type}`
parts fail during multipart encoding before HTTP starts. File preparation errors
are distinguished from connection failures, while retrying preserves the same
ciphertext, attachment ID, caption, and device envelopes. The native upload tests
exercise Expo's installed FormData patch and encoder with the real attachment
client/storage adapter and controlled filesystem/crypto primitives.

The shell keeps sheet visibility and the selected comment post because they
control which other sheets can appear. Small imperative handles open the local
editors or comment thread; they do not expose keystrokes to the shell. Editor
instances are keyed by session, so their drafts and pending request guards cannot
cross accounts. Search and per-conversation draft caches are refs: they preserve
navigation behavior without subscribing the shell to typing.

`useReconciledState` preserves the array and unchanged row objects when polling
returns equivalent JSON data. Changed counts, participants, attachments, edits,
and ordering still update normally. Row comparators check every prop, including
callbacks. `useStableActions` preserves callback identities while forwarding to
the latest committed controller, avoiding obsolete session/selection closures.
Theme context updates still reach memoized UI.

`PostCard` uses a compact profile header and 4:5 media hero with an icon action
bar, like summary, expandable caption, attribution, and comment teaser. Caption
expansion belongs to the caption component; edits reset that draft while count
updates preserve it. Photo source changes reset gesture timers and the viewer.
Feed videos retain native playback controls and start muted, with a separate
audio toggle synchronized to the native player. `postStyles.ts` owns this layout.
Quest-linked posts show a quest indicator in the right-hand action slot; no
unsupported save operation is presented. Consumers can supply `onLikes` to open
a liker view; without it, the count is ordinary text.

Overflow menus expose edit/delete for the owner and share/report for other posts.
Reporting offers reasons through native alerts (at most three actions on
Android), then uses the existing authenticated reports API. Duplicate submissions
are guarded, failures remain retryable, and responses cannot show an alert in a
different login session. `usePostActions` provides the same callbacks in home,
profiles, and event moments.

`ReelsScreen` measures the space between the existing app bars, reserves floating
navigation clearance, and pages by that exact height. A stable 80% viewability
callback selects playback; pages between that threshold remain paused. Rotation
and reordered feed refreshes keep the current reel aligned without moving the
list for count-only updates. App backgrounding, Android focus loss, and shell
modals disable playback.

Each `ReelItem` keeps its own player and gestures. Its inner slide is keyed by
the media source so replacement videos reset buffering and timers safely.
`useReelPlayback` pauses and mutes outgoing players before the next slide plays,
retains explicit user pauses through interruptions, and stops playback before
Expo releases a player. Loading ends after the first frame and resumes during
buffering. Native video controls are replaced by accessible tap controls and
the action rail. `textureView` supports the overlapping pages and overlays on
Android; captions can expand in a bounded scroll area. Gesture timers and
animations are canceled on deactivation or unmount and honor Reduce Motion.

`KeyboardLift`, `GlassBackdrop`, the Motion primitives, `PlaceSuggestions`, native
sheet dismissal, and measured chat occlusion insets stay at their original UI
boundaries. Actionable pressables have semantic roles and explicit accessible
names; gesture-only wrappers are excluded from accessibility focus.

Android's bottom navigation uses an opaque, full-width dock. Its bottom padding
includes the complete reported safe-area inset, so both gesture navigation and
three-button navigation sit on the same surface without overlapping tab targets.
iOS retains its rounded glass navigation. The theme also colors the outer gesture
root and safe-area provider, and system bar icons mount even while fonts load.
`plugins/withAndroidSystemBars.cjs` preserves edge-to-edge on older Android versions
and installs matching day/night native window backgrounds, transparent system
bars/dividers, and disabled contrast scrims across Expo prebuilds. Rebuild a custom
Android client after changing these native resources; a Metro reload cannot update
the window theme or Gradle flags.

Android gesture surfaces use Metro's `.android.tsx` resolution:

- `SlidingTabs.android` and `DetailSheet.android` use
  Gesture Handler recognizers and Reanimated UI worklets. The shared
  `useNativeSwipeDismiss` handles thresholds, velocity conversion, cancellation,
  reduced motion, and stale completion guards. Only start/end notifications and
  navigation cross to JS; no pointer-move callbacks call React setters.
- `ImageViewer.android` uses `useNativePhotoGestures` for simultaneous pan/pinch,
  focal double-tap zoom, and downward dismissal. The original raster sizing and
  zoom bounds are shared with the iOS viewer. Zoom labels update at interaction
  boundaries, with guards against queued updates from replaced/resized images.
- `GestureRoot.android` installs the app root. Android modal surfaces also have
  their own `GestureHandlerRootView`; header gestures do not wrap sheet content.
  System cancellation, Android Back, and accessible close/zoom controls remain
  available. Profile and event sheets retain downward header dismissal. Android's
  `SwipeBackView` is a plain themed view: it installs no horizontal gesture and
  mounts no inbox preview. The visible Back button and system Back return to the
  inbox; Expo config explicitly disables OS predictive-back animations. iOS keeps
  its existing native page sheets and interactive chat preview.

`SoftPressable` owns no pressed React state. Static controls bind scale to a
native Animated node; native Pressable evaluates custom pressed styles/children.
Custom style callbacks provide their own pressed feedback, since core Animated
cannot bind a native node hidden inside a style callback. Tab labels and their
accessible selected state change only when navigation commits.
Mounting the navigation again after leaving a conversation places its indicator
directly on Chats. Initial layout, resizing, and slot reordering snap to the
selected tab; only actual selection changes and drag completion animate. Android
tracks the indicator in tab units so its first visible frame uses the correct
position even before the width has been measured.

Android retains `adjustResize`. React Native's modal window already applies it,
so sheets and comments no longer apply a second JS keyboard resize. `KeyboardLift`
listens to Android did-show/did-hide events and animates only measured residual
overlap, avoiding a double lift after native resizing. Keyboard occlusion stays
conservative through hide animations, and live Reduce Motion changes cancel the
fallback animation. Modals enable hardware acceleration by default. These changes
do not replace or bypass the existing Reduce Transparency checks.

Gesture Handler 2.32, Reanimated 4.5.1, and Worklets 0.10.1 match the installed Expo
57 native module manifest. Expo's Babel preset configures the Worklets plugin;
the native gesture test compiles the actual worklets with that preset. After
installing dependencies, rebuild existing custom Android clients with
`npx expo run:android`, then restart Metro with `npx expo start --dev-client --clear`.
A JS reload alone cannot add these modules to an existing custom binary.
Matching SDK 57 Expo Go already includes the native libraries.

See the [Gesture Handler installation guide](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/fundamentals/installation/)
and [Expo 57 Reanimated setup](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/).

Run from `mobile/`:

```sh
npx tsc --noEmit
npm run test:app
```

The existing source-level regression harness uses `scripts/native-source.cjs` to
find handlers and UI expressions across the extracted modules. Its behavioral
assertions remain intact. `architecture.test.cjs` checks polling identity,
callback freshness, memo invalidation, local chat drafts, and accessibility.
`reels.test.cjs` checks paging geometry, visible-player handoff, focus and modal
interruptions, buffering, manual pauses, tap timing, and action-rail access.
`posts.test.cjs` checks card actions, overflow/reporting flows, local caption
expansion, photo gestures and cleanup, native audio state, and compact times.
`native-gestures.test.cjs` exercises the actual Android handlers with a controlled
UI runtime and delayed JS delivery, including zero per-move JS notifications and
React writes, cancellation, keyboard overlap, native sheet boundaries, raster
sizing, accessibility, and Expo worklet compilation. Production Android Hermes
export is also verified. Frame-rate and IME/device profiling still need a device
or emulator; unit tests and bundling do not measure actual frame times.
