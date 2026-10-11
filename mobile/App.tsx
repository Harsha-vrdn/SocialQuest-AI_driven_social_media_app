import {EventDetailsSheet} from './EventDetailsSheet';
import {DiscoverSearch, type SearchKind} from './DiscoverSearch';
import {MessageList} from './MessageList';
import {EventDateTimeField, EventDateTimePicker} from './EventDateTimePicker';
import {dateParts, localDateTimeValue, updateEventSchedule, type EventSchedule} from './eventDateTime';
import {ImageViewer} from './ImageViewer';
import {RelativeTime, RelativeTimeProvider} from './PostTime';
import {ProfileEditor, type ProfileDraft} from './ProfileEditor';
import {locateHostVenue} from './hostingLocation';
import {QuestAttribution} from './QuestAttribution';
import {useFonts} from 'expo-font';
import {getAppStyles, getGlassStyles, getSocialStyles, getNotificationStyles} from './appStyles';
import {ThemeProvider, useTheme} from './ThemeProvider';
import {AppearanceSettings} from './AppearanceSettings';
import {UnreadBadge} from './UnreadBadge';
import {type Accent} from './theme';
import {KeyboardLift} from './KeyboardLift';
import {PlaceSuggestions} from './PlaceSuggestions';
import type {Place} from './placeSearch';
import {MotionProvider, SoftPressable as Pressable, MotionModal as Modal, ScreenTransition, LikeFeedback, Pop, PulseBadge, makeRevealCell} from './Motion';

const FeedCell = makeRevealCell('feed');
const ReelCell = makeRevealCell('reel');
const ChatCell = makeRevealCell('chat');
const AlertCell = makeRevealCell('alert');
import {EventArtwork} from './EventArtwork';
import {LinearGradient} from 'expo-linear-gradient';
import {useDeviceNotifications, DeliveryNotice} from './useDeviceNotifications';
import {PostComposer} from './PostComposer';
import {GlassBackdrop, GlassPreferenceProvider} from './GlassBackdrop';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { NavigationBar } from 'expo-navigation-bar';
import * as ImagePicker from 'expo-image-picker';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import {Ionicons} from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  Share,
  ScrollView,
  Text,
  TextInput,
  type ViewProps,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL || '';
const expoHostUri = String(
  (Constants as any).expoConfig?.hostUri
  || (Constants as any).manifest?.debuggerHost
  || (Constants as any).manifest2?.extra?.expoClient?.hostUri
  || NativeModules.SourceCode?.scriptURL
  || '',
);
const expoHost = expoHostUri.replace(/^.*?:\/\//, '').split(':')[0];
const API_URL = (configuredApiUrl || (expoHost ? 'http://' + expoHost + ':8000/api' : 'http://YOUR_LAN_IP:8000/api')).replace(/\/+$/, '');
type Tab = 'Home' | 'Explore' | 'Chats' | 'Notifications' | 'Reels' | 'Profile';
type User = { id: number; username: string; display_name?: string; bio?: string; city?: string; avatar?: string; xp?: number; karma?: number; follower_count?: number; following_count?: number; is_followed_by_me?: boolean; is_online?: boolean };
type PeoplePanel = { kind: 'search' | 'followers' | 'following' | 'invite'; person?: User; eventId?: number };
type EventItem = { id: number; name: string; description: string; cover_image?: string; location_name: string; latitude?: number | null; longitude?: number | null; starts_at: string; ends_at: string; accepted_count: number; capacity: number; privacy: 'PUBLIC' | 'PRIVATE'; host: User; my_attendance_status?: string | null; is_finished?: boolean; quest_status?: string; recommendation_reason?: string };
type EventEditor = { id?: number; name: string; description: string; location_name: string; latitude?: number | null; longitude?: number | null; starts_at: string; ends_at: string; capacity: string; privacy: 'PUBLIC' | 'PRIVATE' };
type CommentItem = { id: number; parent?: number | null; author: User; body: string; created_at: string };
type Post = { id: number; kind: 'POST' | 'REEL'; body: string; media?: string; location_name?: string; quest_title?: string; event_name?: string; event?: number | null; recommendation_reason?: string; author: User; created_at: string; like_count: number; comment_count: number; liked_by_me?: boolean; recent_comments?: CommentItem[] };
type Quest = { id: number; event: number; event_name?: string; kind: 'MAIN' | 'SIDE'; title: string; instructions: string; xp_reward: number; my_submission?: { status: string } | null };
type Conversation = { id: number; is_group?: boolean; event?: number | null; event_name?: string; title?: string; display_name: string; participants: User[]; unread_count: number; read_through_message_id: number; latest_message?: { id: number; body: string; created_at: string; deleted_for_everyone?: boolean } };
type ChatMessage = { id: number; body: string; sender: User; created_at: string; edited_at?: string | null; deleted_for_everyone?: boolean };
type Reaction = 'LIKE' | 'DISLIKE' | 'NONE';
type RatingItem = { id: number; target: User; reaction: Reaction };
type AttendanceItem = { id: number; user: User; status: string };
type NotificationItem = { id: number; kind: 'EVENT_INVITE' | 'INVITE_ACCEPTED' | 'RSVP' | 'RSVP_ACCEPTED' | 'RSVP_DENIED' | 'EVENT_ENDED' | 'COMMENT_REPLY'; text: string; event?: { id: number; name: string } | null; comment_post_id?: number | null; created_at: string; is_read: boolean };
type PhotoEditorState = { original: ImagePicker.ImagePickerAsset; working: ImagePicker.ImagePickerAsset };
type PhotoOperation = 'rotate-left' | 'rotate-right' | 'mirror';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const rows = <T,>(data: T[] | { results?: T[] } | null | undefined): T[] => Array.isArray(data) ? data : data?.results || [];
const nameOf = (user?: User | null) => user?.display_name || user?.username || 'SocialQuest member';
const initial = (user?: User | null) => nameOf(user).trim().slice(0, 1).toUpperCase();
const dateOf = (date: string) => new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const reactionLabel = (reaction: Reaction) => reaction === 'LIKE' ? '♥ Like' : reaction === 'DISLIKE' ? '× Dislike' : '— None';
const chatEmojis = ['😊', '😂', '❤️', '👍', '🎉', '✨', '👋', '🙌'];
const AUTH_TOKEN_KEY = 'socialquest_auth_token';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const iconLabelRow = {alignItems: 'center', flexDirection: 'row', gap: 5} as const;

function Avatar({ user, large = false }: { user?: User | null; large?: boolean }) {
  const {theme} = useTheme();
  const {accents} = theme;
  const avatarAccents = [accents.purple, accents.sky, accents.rose, accents.mint, accents.gold];
  const styles = getAppStyles(theme);
  const tone = avatarAccents[Math.abs(user?.id || 0) % avatarAccents.length];
  return user?.avatar
    ? <Image accessible accessibilityLabel={nameOf(user) + "'s profile photo"} style={[styles.avatar, large && styles.avatarLarge]} source={{ uri: user.avatar }} />
    : <View style={[styles.avatar, {backgroundColor: tone.surface}, large && styles.avatarLarge]}><Text style={[styles.avatarText, {color: tone.text}, large && styles.avatarLargeText]}>{initial(user)}</Text></View>;
}

function Empty({ icon, title, body, style, loading, ...viewProps }: ViewProps & { icon: string; title: string; body: string; loading?: boolean }) {
  const {theme} = useTheme();
  const {colors} = theme;
  const styles = getAppStyles(theme);
  // Preserve any layout and measurement props supplied by the parent list.
  if (loading) return <View {...viewProps} accessibilityRole="progressbar" accessibilityLabel="Loading" style={[styles.empty, style]}><ActivityIndicator color={colors.accent} /><Text style={styles.emptyBody}>Loading…</Text></View>;
  return <View {...viewProps} style={[styles.empty, style]}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

function GroupAvatar() {
  const {theme} = useTheme();
  const styles = getAppStyles(theme);
  const {colors} = theme;
  return <View style={[styles.avatar, {backgroundColor: colors.accentSoft}]}><Ionicons name="people" size={23} color={colors.accent} /></View>;
}

function InteractivePostImage({ post, onLike }: { post: Post; onLike: (post: Post) => void }) {
  const {theme} = useTheme();
  const {colors} = theme;
  const styles = getAppStyles(theme);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHeart, setShowHeart] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (heartTimer.current) clearTimeout(heartTimer.current);
  }, []);

  const handlePress = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!post.liked_by_me) onLike(post);
      setShowHeart(true);
      if (heartTimer.current) clearTimeout(heartTimer.current);
      heartTimer.current = setTimeout(() => setShowHeart(false), 650);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setViewerOpen(true);
    }, 230);
  };

  return <><Pressable accessibilityRole="button" accessibilityLabel={'Open photo by ' + nameOf(post.author)} accessibilityHint="Open fullscreen to pinch or double-tap to zoom. Double-tap here to like." onPress={handlePress} style={styles.postImageTouch}>
    <Image style={styles.postImage} source={{ uri: post.media }} />
    {showHeart ? <LikeFeedback style={styles.postMediaHeart}><Ionicons name="heart" size={76} color={colors.onMedia} /></LikeFeedback> : null}
  </Pressable>{viewerOpen && post.media ? <ImageViewer key={post.media} uri={post.media} onClose={() => setViewerOpen(false)} /> : null}</>;
}

function PostCard({ post, onLike, mine, onEdit, onDelete, onShare, onComments, onOpenProfile }: { post: Post; onLike: (post: Post) => void; mine: boolean; onEdit: (post: Post) => void; onDelete: (post: Post) => void; onShare: (post: Post) => void; onComments: (post: Post) => void; onOpenProfile: (user: User) => void }) {
  const {theme} = useTheme();
  const {colors} = theme;
  const styles = getAppStyles(theme);
  return <View style={styles.post}><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(post.author) + "'s profile"} style={styles.postHead} onPress={() => onOpenProfile(post.author)}><Avatar user={post.author} /><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.personName}>{nameOf(post.author)}</Text><Text style={styles.personMeta}>@{post.author.username}{post.location_name ? ' · ' + post.location_name : ''}</Text><RelativeTime value={post.created_at} /></View></Pressable>{post.recommendation_reason ? <Text style={styles.recommendationTag}>For you · {post.recommendation_reason}</Text> : null}<QuestAttribution quest={post.quest_title} event={post.event_name} />{post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}{post.media ? post.kind === 'POST' ? <InteractivePostImage post={post} onLike={onLike} /> : <ReelVideo uri={post.media} /> : null}<View style={styles.postFooter}><Pressable style={[iconLabelRow, styles.postAction]} accessibilityRole="button" accessibilityLabel={post.liked_by_me ? "Unlike post" : "Like post"} onPress={() => onLike(post)}><Pop active={!!post.liked_by_me}><Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={18} color={post.liked_by_me ? colors.rose : colors.muted} /></Pop><Text style={[styles.postManageText, post.liked_by_me && { color: colors.rose }]}>{post.like_count}</Text></Pressable><Pressable style={[iconLabelRow, styles.postAction]} accessibilityRole="button" accessibilityLabel="Open comments" onPress={() => onComments(post)}><Ionicons name="chatbubble-outline" size={17} color={colors.muted} /><Text style={styles.postManageText}>{post.comment_count} replies</Text></Pressable><Pressable style={[iconLabelRow, styles.postAction]} accessibilityRole="button" accessibilityLabel="Share post" onPress={() => onShare(post)}><Ionicons name="paper-plane-outline" size={18} color={colors.muted} /><Text style={styles.postManageText}>Share</Text></Pressable>{mine ? <View style={styles.postManage}><Pressable accessibilityRole="button" style={styles.postAction} onPress={() => onEdit(post)}><Text style={styles.postManageText}>Edit</Text></Pressable><Pressable accessibilityRole="button" style={styles.postAction} onPress={() => onDelete(post)}><Text style={styles.postDeleteText}>Delete</Text></Pressable></View> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Open replies" onPress={() => onComments(post)} style={styles.postRepliesLink}><Text style={styles.postRepliesLinkText}>{post.comment_count ? 'View ' + post.comment_count + (post.comment_count === 1 ? ' reply' : ' replies') : 'Start the conversation'}</Text></Pressable></View>;
}

function ReelVideo({ uri }: { uri: string }) {
  const {theme} = useTheme();
  const {colors} = theme;
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: 230, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.mediaBackground }} />;
}

export default function App() {
  return <ThemeProvider><ThemedApp /></ThemeProvider>;
}

function ThemedApp() {
  const {theme} = useTheme();
  const {colors} = theme;
  const barStyle = theme.scheme === 'dark' ? 'light' : 'dark';
  const [fontsLoaded, fontError] = useFonts({DepartureMono: require('./assets/fonts/DepartureMono-Regular.otf')});
  if (!fontsLoaded && !fontError) return <View style={{flex: 1, backgroundColor: colors.background}} />;
  return <SafeAreaProvider><RelativeTimeProvider><MotionProvider><GlassPreferenceProvider><StatusBar style={barStyle} /><NavigationBar style={barStyle} /><SocialQuestApp /></GlassPreferenceProvider></MotionProvider></RelativeTimeProvider></SafeAreaProvider>;
}

function SocialQuestApp() {
  const {theme} = useTheme();
  const {colors, accents, gradients} = theme;
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const styles = getAppStyles(theme);
  const glassStyles = getGlassStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const notificationStyles = getNotificationStyles(theme);
  const notificationAccent = (kind: NotificationItem['kind']) => kind === 'COMMENT_REPLY' ? accents.purple
    : kind === 'RSVP_ACCEPTED' || kind === 'INVITE_ACCEPTED' ? accents.mint
    : kind === 'RSVP_DENIED' ? accents.danger : accents.purple;
  const [appHeaderHeight, setAppHeaderHeight] = useState(0);
  const [token, setToken] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const usernameInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [me, setMe] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('Home');
  const currentTab = useRef(tab); currentTab.current = tab;
  const presenceSync = useRef<((online: boolean) => Promise<void>) | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const uploadInFlight = useRef(false);
  const photoEditInFlight = useRef(false);
  const likeInFlight = useRef(new Set<number>());
  const sessionToken = useRef(token);
  sessionToken.current = token;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hostedEvents, setHostedEvents] = useState<EventItem[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<EventItem[]>([]);
  const [eventRequests, setEventRequests] = useState<AttendanceItem[]>([]);
  const [messageOptions, setMessageOptions] = useState<ChatMessage | null>(null);
  const sendInFlight = useRef(false);
  const [people, setPeople] = useState<User[]>([]);
  const [following, setFollowing] = useState<User[]>([]);
  const [peoplePanel, setPeoplePanel] = useState<PeoplePanel | null>(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState<User[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const peopleRequestVersion = useRef(0);
  const followInFlight = useRef(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [nearbyActive, setNearbyActive] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Post[]>([]);
  const [query, setQuery] = useState('');
  const [searchKind, setSearchKind] = useState<SearchKind>('events');
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [chatMembersOpen, setChatMembersOpen] = useState(false);
  const openingEventChat = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const activeChatId = useRef<number | null>(null);
  activeChatId.current = activeChat?.id || null;
  const chatRequestVersion = useRef(0);
  const messageRequestVersion = useRef(0);
  const chatReadVersion = useRef(0);
  const visibleChatMessage = useRef({chatId: 0, messageId: 0});
  const chatReadRequests = useRef(new Set<number>());
  const chatReadCursors = useRef(new Map<number, number>());
  const notificationRequestVersion = useRef(0);
  const [message, setMessage] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [chatEditor, setChatEditor] = useState<{ kind: 'conversation' | 'message'; id: number; value: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEditor | null>(null);
  const [eventEditorClosing, setEventEditorClosing] = useState(false);
  const [eventDateField, setEventDateField] = useState<keyof EventSchedule | null>(null);
  const eventEditorVersion = useRef(0);
  const eventLocationRequest = useRef(0);
  const eventSaveInFlight = useRef(false);
  const [eventLocating, setEventLocating] = useState(false);
  const [eventLocationStatus, setEventLocationStatus] = useState('');
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [eventQuests, setEventQuests] = useState<Quest[]>([]);
  const [eventPosts, setEventPosts] = useState<Post[]>([]);
  const [ratingTargets, setRatingTargets] = useState<User[]>([]);
  const [eventRatings, setEventRatings] = useState<RatingItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [moment, setMoment] = useState('');
  const [momentMedia, setMomentMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoEditor, setPhotoEditor] = useState<PhotoEditorState | null>(null);
  const [photoEditorBusy, setPhotoEditorBusy] = useState(false);
  const [momentLocation, setMomentLocation] = useState('');
  const [proofQuest, setProofQuest] = useState<Quest | null>(null);
  const composerDrafts = useRef(new Map<string, {caption: string; media: ImagePicker.ImagePickerAsset | null; location: string}>());
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const activeCommentPostId = useRef<number | null>(null);
  const commentPanelVersion = useRef(0);
  const commentRequestVersion = useRef(0);
  const commentInFlight = useRef(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const commentInputRef = useRef<TextInput>(null);
  const [profilePosts, setProfilePosts] = useState<Post[]>([]);
  const [profilePostsLoading, setProfilePostsLoading] = useState(false);
  const [profilePostsError, setProfilePostsError] = useState('');
  const [profilePostsOwner, setProfilePostsOwner] = useState<number | null>(null);
  const [profileSection, setProfileSection] = useState<'POST' | 'REEL' | 'EVENTS'>('POST');
  const profileUserId = selectedUser?.id || (tab === 'Profile' ? me?.id : undefined);
  const currentProfileId = useRef(profileUserId);
  currentProfileId.current = profileUserId;
  const profileRequestVersion = useRef(0);

  const api = async (path: string, options: any = {}, authToken = token): Promise<any> => {
    const {singlePage = false, ...requestOptions} = options;
    const headers: any = { ...(authToken ? { Authorization: 'Token ' + authToken } : {}), ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(API_URL + path, { ...requestOptions, headers });
    } catch (_) {
      const help = API_URL.includes('YOUR_LAN_IP')
        ? 'Mobile API is not configured. Start Expo with EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000/api.'
        : 'Could not reach ' + API_URL + '. Start Django with python manage.py runserver 0.0.0.0:8000 and keep the phone on the same Wi-Fi.';
      throw new Error(help);
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (authToken && sessionToken.current !== authToken) throw new Error('Session changed.');
    if (response.status === 401 && authToken) {
      activeCommentPostId.current = null; commentPanelVersion.current += 1; commentRequestVersion.current += 1;
      sessionToken.current = ''; setToken(''); setMe(null); setActiveChat(null); setMessages([]);
      void SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      setPosts([]); setReels([]); setEvents([]); setPeople([]); setFollowing([]); setConversations([]); setNotifications([]);
      setSelectedEvent(null); setSelectedUser(null); setComposeOpen(false); setCommentPost(null); setEditingPost(null); setChatEditor(null); setMessageOptions(null);
      throw new Error('Your session expired. Please log in again.');
    }
    if (!response.ok) throw new Error(data?.detail || Object.values(data || {}).flat().join(' ') || 'Something went wrong.');
    if (authToken && sessionToken.current !== authToken) throw new Error('Session changed.');
    if ((!options.method || options.method === 'GET') && Array.isArray(data?.results) && data.next && !singlePage) {
      const next = new URL(data.next);
      const base = new URL(API_URL);
      if (next.origin !== base.origin || !next.pathname.startsWith(base.pathname + '/')) throw new Error('Invalid pagination link.');
      const remaining = await api(next.pathname.slice(base.pathname.length) + next.search, options, authToken);
      data.results.push(...rows(remaining)); data.next = null;
    }
    return data;
  };

  useEffect(() => {
    eventEditorVersion.current += 1; eventLocationRequest.current += 1;
    setEventEditor(null); setEventEditorClosing(false); setEventDateField(null); setEventLocating(false); setProfileEditorOpen(false);
    composerDrafts.current.clear();
  }, [token]);

  const saveProfile = async (draft: ProfileDraft, avatar: ImagePicker.ImagePickerAsset | null) => {
    if (!token || !me) throw new Error('Log in to edit your profile.');
    const ownerId = me.id;
    const data = new FormData();
    data.append('display_name', draft.display_name);
    data.append('bio', draft.bio);
    data.append('city', draft.city);
    if (avatar) data.append('avatar', new File(avatar.uri));
    const updated: User = await api('/people/me/', {method: 'PATCH', body: data});
    if (sessionToken.current !== token || updated.id !== ownerId) return;
    setMe(updated);
    setSelectedUser(current => current?.id === ownerId ? updated : current);
    const updateAuthor = (items: Post[]) => items.map(post => post.author.id === ownerId ? {...post, author: updated} : post);
    setPosts(updateAuthor); setReels(updateAuthor); setEventPosts(updateAuthor); setProfilePosts(updateAuthor);
  };
  const openProfileEditor = () => {
    if (!token || !me) return;
    setSelectedUser(null); setPeoplePanel(null); setProfileEditorOpen(true);
  };

  const loadMe = async () => {
    const person = await api('/people/me/'); setMe(person);
    const [hosted, joined] = await Promise.all([api('/events/?host=' + person.id), api('/events/?participant=' + person.id)]);
    setHostedEvents(rows<EventItem>(hosted)); setJoinedEvents(rows<EventItem>(joined));
  };
  const loadDiscover = async (search = '') => {
    const suffix = search ? '?q=' + encodeURIComponent(search) : '';
    const result = await Promise.all([search ? api('/events/' + suffix) : api('/events/recommended/'), api('/people/' + suffix)]);
    setEvents(rows<EventItem>(result[0]));
    setPeople(rows<User>(result[1]).filter(person => person.id !== me?.id));
  };
  const loadFeed = async () => {
    const result = await Promise.all([api('/posts/for-you/?kind=POST'), api('/posts/for-you/?kind=REEL')]);
    setPosts(rows<Post>(result[0]));
    setReels(rows<Post>(result[1]));
  };
  const loadProfilePosts = async (userId: number) => {
    if (currentProfileId.current !== userId) return;
    const version = ++profileRequestVersion.current;
    const isCurrentProfile = () => currentProfileId.current === userId && profileRequestVersion.current === version;
    setProfilePostsLoading(true);
    setProfilePostsError('');
    try {
      // The recommended feed is capped and ranked. A profile needs every visible
      // post by this author, including reels and older posts (api follows pages).
      const result = rows<Post>(await api('/posts/?author=' + userId));
      if (!isCurrentProfile()) return;
      setProfilePosts(result);
      setProfilePostsOwner(userId);
    } catch (error: any) {
      if (isCurrentProfile()) setProfilePostsError(error.message || 'Could not load this profile’s moments.');
    } finally {
      if (isCurrentProfile()) setProfilePostsLoading(false);
    }
  };
  const refreshVisibleProfile = async () => {
    if (currentProfileId.current) await loadProfilePosts(currentProfileId.current);
  };
  const loadFollowing = async () => setFollowing(rows<User>(await api('/people/following/')));
  const loadChats = async (signal?: AbortSignal) => {
    const version = ++chatRequestVersion.current, readVersion = chatReadVersion.current;
    const chats = rows<Conversation>(await api('/conversations/', signal ? {signal} : {}));
    if (version !== chatRequestVersion.current || readVersion !== chatReadVersion.current) return;
    chats.forEach(chat => chatReadCursors.current.set(chat.id, Math.max(chatReadCursors.current.get(chat.id) || 0, chat.read_through_message_id || 0)));
    setConversations(chats);
    setActiveChat(current => current ? chats.find(chat => chat.id === current.id) || (current.event ? null : current) : null);
  };
  const markChatRead = async (id: number, messageId: number) => {
    if (!messageId || activeChatId.current !== id || currentTab.current !== 'Chats' || AppState.currentState !== 'active') return;
    visibleChatMessage.current = {chatId: id, messageId: Math.max(visibleChatMessage.current.chatId === id ? visibleChatMessage.current.messageId : 0, messageId)};
    if (messageId <= (chatReadCursors.current.get(id) || 0) || chatReadRequests.current.has(id)) return;
    chatReadRequests.current.add(id); chatReadVersion.current++;
    let saved = false;
    try {
      const result = await api('/conversations/' + id + '/mark-read/', {method: 'POST', body: JSON.stringify({message_id: messageId})});
      chatReadCursors.current.set(id, result.read_through_message_id);
      saved = true;
      const update = (chat: Conversation) => chat.id === id ? {...chat, ...result} : chat;
      setConversations(current => current.map(update));
      setActiveChat(current => current ? update(current) : null);
    } catch (_) { /* Keep the badge; the next poll retries what was actually visible. */ }
    finally { chatReadRequests.current.delete(id); chatReadVersion.current++; }
    if (saved) {
      void loadChats().catch(() => {});
      if (visibleChatMessage.current.chatId === id && visibleChatMessage.current.messageId > messageId) void markChatRead(id, visibleChatMessage.current.messageId);
    }
  };
  const loadMessages = async (id: number) => {
    const version = ++messageRequestVersion.current;
    const result = rows<ChatMessage>(await api('/messages/?conversation=' + id));
    if (version !== messageRequestVersion.current || activeChatId.current !== id || currentTab.current !== 'Chats' || AppState.currentState !== 'active') return;
    setMessages(result);
    if (visibleChatMessage.current.chatId === id) void markChatRead(id, visibleChatMessage.current.messageId);
  };
  const loadNotifications = async () => {
    const version = ++notificationRequestVersion.current;
    const result = rows<NotificationItem>(await api('/notifications/'));
    if (version === notificationRequestVersion.current) setNotifications(result);
  };

  const closePeople = () => {
    peopleRequestVersion.current += 1;
    setPeoplePanel(null); setSelectedUser(null); Keyboard.dismiss();
  };
  const loadPeopleList = async (panel: PeoplePanel, search = '') => {
    const version = ++peopleRequestVersion.current;
    setPeopleLoading(true); setPeopleError('');
    try {
      const path = panel.kind === 'search' || panel.kind === 'invite' ? '/people/' : '/people/' + panel.person!.id + '/' + panel.kind + '/';
      const result = rows<User>(await api(path + '?q=' + encodeURIComponent(search.trim())));
      if (version === peopleRequestVersion.current) setPeopleResults(result.filter(person => (panel.kind !== 'search' && panel.kind !== 'invite') || person.id !== me?.id));
    } catch (error: any) {
      if (version === peopleRequestVersion.current) { setPeopleResults([]); setPeopleError(error.message); }
    } finally { if (version === peopleRequestVersion.current) setPeopleLoading(false); }
  };
  const openPeopleList = (kind: PeoplePanel['kind'], person?: User) => {
    const panel = {kind, person};
    setSelectedUser(null); setPeoplePanel(panel); setPeopleQuery(''); setPeopleResults([]);
    void loadPeopleList(panel);
  };
  const openInviteList = (eventId: number) => {
    const panel: PeoplePanel = {kind: 'invite', eventId};
    setSelectedUser(null); setPeoplePanel(panel); setPeopleQuery(''); setPeopleResults([]);
    void loadPeopleList(panel);
  };

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(AUTH_TOKEN_KEY).then(savedToken => {
      if (cancelled || !savedToken) return;
      sessionToken.current = savedToken;
      setToken(savedToken);
    }).catch(() => {}).finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!token) return;
    const sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = Math.floor(Math.random() * 16);
      return (char === 'x' ? random : (random & 3) | 8).toString(16);
    });
    let queue = Promise.resolve();
    const sendPresence = (online: boolean) => {
      queue = queue.catch(() => {}).then(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          if (online && sessionToken.current !== token) return;
          await fetch(API_URL + '/people/presence/', {
            method: online ? 'PUT' : 'DELETE', signal: controller.signal,
            headers: {Authorization: 'Token ' + token, 'Content-Type': 'application/json'},
            body: JSON.stringify({session_id: sessionId, chats_open: online && currentTab.current === 'Chats'}),
          });
        } finally { clearTimeout(timeout); }
      }).catch(() => {});
      return queue;
    };
    presenceSync.current = sendPresence;
    sendPresence(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => sendPresence(state === 'active'));
    const timer = setInterval(() => { if (AppState.currentState === 'active') sendPresence(true); }, 20000);
    return () => { clearInterval(timer); subscription.remove(); sendPresence(false); };
  }, [token]);
  useEffect(() => { presenceSync.current?.(AppState.currentState === 'active'); }, [tab]);
  useEffect(() => {
    if (!token || !appActive) return;
    let cancelled = false;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        await loadChats(controller.signal);
      } catch (_) {
        if (!cancelled) {
          const offline = (chat: Conversation) => ({...chat, participants: chat.participants.map(person => ({...person, is_online: false}))});
          setConversations(current => current.map(offline));
          setActiveChat(current => current ? offline(current) : null);
        }
      } finally { clearTimeout(timeout); pending = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), tab === 'Chats' ? 5000 : 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token, tab, appActive]);

  useEffect(() => {
    if (token) return;
    chatRequestVersion.current++; chatReadVersion.current++;
    chatReadCursors.current.clear(); chatReadRequests.current.clear();
    visibleChatMessage.current = {chatId: 0, messageId: 0};
    setConversations([]); setNotifications([]);
    closePeople();
  }, [token]);
  useEffect(() => {
    if (!token || !selectedUser) return;
    const personId = selectedUser.id;
    let cancelled = false;
    void api('/people/' + personId + '/').then(person => {
      if (!cancelled) setSelectedUser(current => current?.id === personId ? person : current);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [token, selectedUser?.id]);

  useEffect(() => {
    profileRequestVersion.current += 1;
    setProfilePosts([]); setProfilePostsOwner(null); setProfilePostsError('');
    setProfileSection('POST');
    if (token && profileUserId) void loadProfilePosts(profileUserId);
    else setProfilePostsLoading(false);
    return () => { profileRequestVersion.current += 1; };
  }, [token, profileUserId, !!selectedUser]);

  const refresh = async (task: () => Promise<unknown>) => { setRefreshing(true); try { await task(); } catch (error: any) { Alert.alert('Could not refresh', error.message); } finally { setRefreshing(false); } };

  useEffect(() => {
    if (!token) { setAccountLoading(false); return; }
    let current = true;
    setAccountLoading(true);
    void Promise.all([loadMe(), loadDiscover(), loadFeed(), loadChats(), loadNotifications(), loadFollowing()]).catch(error => Alert.alert('Could not load your account', error.message)).finally(() => { if (current) setAccountLoading(false); });
    return () => { current = false; };
  }, [token]);
  // Android Back steps out of the open chat, then to Home, before leaving the app.
  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeChat) { setEmojiPickerOpen(false); Keyboard.dismiss(); setActiveChat(null); return true; }
      if (tab !== 'Home') { setTab('Home'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [token, activeChat, tab]);
  useEffect(() => {
    setMessages([]);
    visibleChatMessage.current = {chatId: activeChat?.id || 0, messageId: 0};
  }, [activeChat?.id]);
  useEffect(() => {
    if (!activeChat) { setMessages([]); setChatMembersOpen(false); return; }
    if (!token || tab !== 'Chats' || !appActive) return;
    void loadMessages(activeChat.id).catch(error => Alert.alert('Could not load chat', error.message));
    const timer = setInterval(() => void loadMessages(activeChat.id).catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [activeChat?.id, token, tab, appActive]);
  useEffect(() => {
    if (!token || !appActive) return;
    void loadNotifications().catch(() => {});
    const timer = setInterval(() => void loadNotifications().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [token, appActive]);

  const authenticate = async () => {
    if (busy) return;
    if (!username.trim() || !password) return Alert.alert('Complete your details', 'Enter a username and password.');
    if (mode === 'register' && !email.trim()) return Alert.alert('Email required', 'Enter an email to create an account.');
    setBusy(true);
    try {
      const body = mode === 'login'
        ? { username: username.trim(), password }
        : { username: username.trim(), password, email: email.trim(), ...(displayName.trim() ? { display_name: displayName.trim() } : {}) };
      const data = await api('/auth/' + mode + '/', { method: 'POST', body: JSON.stringify(body) }, '');
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, data.token);
      sessionToken.current = data.token;
      setToken(data.token);
      setMe(data.user);
      setPassword('');
      setTab('Home');
    } catch (error: any) {
      Alert.alert(mode === 'login' ? 'Could not log in' : 'Could not create account', error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmLogout = () => Alert.alert('Log out?', 'You will need to log in again to see your feed and chats.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: () => void logout() },
  ]);
  const logout = async () => {
    await presenceSync.current?.(false);
    await deviceNotifications.disable();
    try { await api('/auth/logout/', { method: 'POST' }); } catch (_) {}
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => {});
    sessionToken.current = '';
    setToken('');
    setMe(null);
    setPosts([]); setReels([]); setEvents([]); setPeople([]); setFollowing([]); setConversations([]); setNotifications([]);
    setHostedEvents([]); setJoinedEvents([]); setEventRequests([]); setMessageOptions(null); setChatEditor(null);
    activeCommentPostId.current = null; commentPanelVersion.current += 1; commentRequestVersion.current += 1;
    setSelectedEvent(null); setSelectedUser(null); setComposeOpen(false); setCommentPost(null); setEditingPost(null); setProofQuest(null); setMoment(''); setMomentMedia(null);
    setActiveChat(null);
    setMessages([]);
    setTab('Home');
  };

  const openChat = async (person: User) => {
    if (person.id === me?.id) return Alert.alert('Choose someone else', 'You cannot start a chat with yourself.');
    const existing = conversations.find(conversation => conversation.participants.some(participant => participant.id === person.id));
    if (existing) {
      closePeople();
      setActiveChat(existing);
      setTab('Chats');
      return;
    }
    try {
      const conversation = await api('/conversations/direct/', { method: 'POST', body: JSON.stringify({ user_id: person.id }) });
      closePeople();
      setActiveChat(conversation);
      setTab('Chats');
      await loadChats();
    } catch (error: any) { Alert.alert('Could not start chat', error.message); }
  };

  const findNearbyEvents = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location is off', 'Allow location access to rank events close to you. Your location is only used for this nearby search.');
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nearby = await api('/events/recommended/?latitude=' + position.coords.latitude.toFixed(6) + '&longitude=' + position.coords.longitude.toFixed(6));
      setEvents(rows<EventItem>(nearby));
      setQuery('');
      setSearchKind('events');
      setNearbyActive(true);
      setTab('Explore');
    } catch (error: any) { Alert.alert('Nearby events unavailable', error.message || 'We could not check events near you.'); }
  };

  const send = async () => {
    if (!activeChat || !message.trim() || sendInFlight.current) return;
    sendInFlight.current = true;
    const body = message.trim();
    const conversationId = activeChat.id;
    setMessage('');
    setEmojiPickerOpen(false);
    try {
      const sent = await api('/messages/', { method: 'POST', body: JSON.stringify({ conversation: conversationId, body }) });
      if (activeChatId.current === conversationId) setMessages(current => current.some(item => item.id === sent.id) ? current : [...current, sent]);
      // A refresh failure must not turn an acknowledged send into a retry.
      await Promise.allSettled([loadMessages(conversationId), loadChats()]);
    } catch (error: any) {
      if (sessionToken.current === token) {
        if (activeChatId.current === conversationId) setMessage(current => current || body);
        Alert.alert('Message not sent', error.message);
      }
    } finally { sendInFlight.current = false; }
  };

  const openEventChat = async () => {
    if (!selectedEvent || openingEventChat.current) return;
    openingEventChat.current = true;
    try {
      const chat: Conversation = await api('/events/' + selectedEvent.id + '/chat/', {method: 'POST', body: '{}'});
      setConversations(current => [chat, ...current.filter(item => item.id !== chat.id)]);
      setSelectedEvent(null); setTab('Chats'); setActiveChat(chat);
    } catch (error: any) { Alert.alert('Could not open event chat', error.message); }
    finally { openingEventChat.current = false; }
  };

  const showChatOptions = () => {
    if (!activeChat) return;
    Alert.alert('Chat options', activeChat.event ? 'This group includes the host and accepted participants. Its name follows the event.' : 'A chat name is shared with the other participants. Removing a chat only clears it from your inbox.', [
      ...(activeChat.is_group ? [{text: 'View participants', onPress: () => setChatMembersOpen(true)}] : []),
      ...(!activeChat.event ? [{ text: 'Edit chat name', onPress: () => setChatEditor({ kind: 'conversation' as const, id: activeChat.id, value: activeChat.title || '' }) }] : []),
      { text: 'Remove from my inbox', style: 'destructive', onPress: () => void api('/conversations/' + activeChat.id + '/', { method: 'DELETE' }).then(async () => { setActiveChat(null); setMessages([]); await loadChats(); }).catch((error: any) => Alert.alert('Could not remove chat', error.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showMessageOptions = (item: ChatMessage) => {
    if (!item.deleted_for_everyone) setMessageOptions(item);
  };

  const deleteMessage = async (id: number, scope: 'me' | 'everyone') => {
    if (!activeChat) return;
    try {
      await api('/messages/' + id + '/?scope=' + scope, { method: 'DELETE' });
      await Promise.all([loadMessages(activeChat.id), loadChats()]);
    } catch (error: any) { Alert.alert('Could not delete message', error.message); }
  };

  const saveChatEditor = async () => {
    if (!chatEditor) return;
    const value = chatEditor.value.trim();
    if (chatEditor.kind === 'message' && !value) {
      Alert.alert('Message required', 'A message cannot be empty. Delete it instead if you no longer want to keep it.');
      return;
    }
    try {
      if (chatEditor.kind === 'conversation') {
        const conversation = await api('/conversations/' + chatEditor.id + '/', { method: 'PATCH', body: JSON.stringify({ title: value }) });
        setActiveChat(conversation);
        await loadChats();
      } else {
        await api('/messages/' + chatEditor.id + '/', { method: 'PATCH', body: JSON.stringify({ body: value }) });
        if (activeChat) await Promise.all([loadMessages(activeChat.id), loadChats()]);
      }
      setChatEditor(null);
    } catch (error: any) { Alert.alert('Could not save change', error.message); }
  };

  const join = async () => {
    if (!selectedEvent) return;
    try {
      await api('/events/' + selectedEvent.id + '/join/', { method: 'POST', body: '{}' });
      Alert.alert(selectedEvent.my_attendance_status === 'INVITED' ? 'Invitation accepted' : 'Request sent', selectedEvent.my_attendance_status === 'INVITED' ? 'You are going to this adventure.' : 'The host can now review your public XP and karma.');
      await openEvent(selectedEvent.id);
      await loadDiscover();
    } catch (error: any) { Alert.alert('Could not request entry', error.message); }
  };

  const cancelRsvp = async () => {
    if (!selectedEvent) return;
    try {
      await api('/events/' + selectedEvent.id + '/cancel-rsvp/', {method: 'POST', body: '{}'});
      await openEvent(selectedEvent.id);
      await loadDiscover();
    } catch (error: any) { Alert.alert('Could not cancel RSVP', error.message); }
  };

  const invitePerson = async (person: User) => {
    if (!peoplePanel?.eventId) return;
    try {
      await api('/events/' + peoplePanel.eventId + '/invite/', {method: 'POST', body: JSON.stringify({user_id: person.id})});
      Alert.alert('Invitation sent', nameOf(person) + ' can now open and accept this private event.');
    } catch (error: any) { Alert.alert('Could not invite person', error.message); }
  };

  const editDateValue = (value: string) => {
    if (!value) return '';
    return localDateTimeValue(dateParts(new Date(value)));
  };
  const closeEventEditor = () => {
    Keyboard.dismiss();
    // iOS keeps the presenting controller alive through its dismissal animation.
    // Wait for onDismiss before showing the saved event underneath it.
    setEventEditorClosing(Platform.OS === 'ios');
    eventEditorVersion.current += 1; eventLocationRequest.current += 1;
    setEventEditor(null); setEventDateField(null); setEventLocating(false); setEventLocationStatus('');
  };
  const detectEventLocation = async () => {
    const request = ++eventLocationRequest.current;
    const editor = eventEditorVersion.current;
    const isCurrent = () => request === eventLocationRequest.current && editor === eventEditorVersion.current;
    setEventLocating(true); setEventLocationStatus('Finding your location…');
    try {
      const place = await locateHostVenue();
      if (!isCurrent()) return;
      setEventEditor(current => current ? {...current, ...place} : current);
      setEventLocationStatus('Location detected. Check the venue before publishing.');
    } catch (error: any) {
      if (isCurrent()) setEventLocationStatus(error.message || 'Location is unavailable. Enter the venue below.');
    } finally { if (isCurrent()) setEventLocating(false); }
  };
  const changeEventLocation = (value: string) => {
    eventLocationRequest.current += 1;
    setEventLocating(false); setEventLocationStatus('');
    setEventEditor(current => current ? {...current, location_name: value, latitude: null, longitude: null} : current);
  };
  const pickEventPlace = (place: Place) => {
    eventLocationRequest.current += 1;
    setEventLocating(false); setEventLocationStatus('Venue chosen from search. Check it before publishing.');
    setEventEditor(current => current ? {...current, location_name: place.label, latitude: place.latitude, longitude: place.longitude} : current);
    Keyboard.dismiss();
  };
  const openEventEditor = (event?: EventItem) => {
    eventEditorVersion.current += 1; eventLocationRequest.current += 1;
    setEventDateField(null);
    setEventLocating(false); setEventLocationStatus('');
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setEventEditor(event ? {
      id: event.id, name: event.name, description: event.description, location_name: event.location_name,
      latitude: event.latitude ?? null, longitude: event.longitude ?? null,
      starts_at: editDateValue(event.starts_at), ends_at: editDateValue(event.ends_at), capacity: String(event.capacity), privacy: event.privacy,
    } : {name: '', description: '', location_name: '', latitude: null, longitude: null, starts_at: editDateValue(start.toISOString()), ends_at: editDateValue(end.toISOString()), capacity: '12', privacy: 'PUBLIC'});
    if (!event) void detectEventLocation();
  };
  const saveEvent = async () => {
    if (!eventEditor || busy || eventLocating || eventSaveInFlight.current) return;
    const capacity = Number(eventEditor.capacity);
    const starts = new Date(eventEditor.starts_at);
    const ends = new Date(eventEditor.ends_at);
    if (!eventEditor.name.trim() || !eventEditor.description.trim() || !eventEditor.location_name.trim() || !Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts || !Number.isInteger(capacity) || capacity < 2) {
      return Alert.alert('Check event details', 'Add a name, description, venue, an end time after the start, and a whole-number capacity of at least 2.');
    }
    eventSaveInFlight.current = true; setBusy(true);
    try {
      const payload = {...eventEditor, capacity, starts_at: starts.toISOString(), ends_at: ends.toISOString()};
      delete (payload as any).id;
      const saved = await api(eventEditor.id ? '/events/' + eventEditor.id + '/' : '/events/', {method: eventEditor.id ? 'PATCH' : 'POST', body: JSON.stringify(payload)});
      if (!eventEditor.id) await api('/events/' + saved.id + '/generate-quests/', {method: 'POST', body: '{}'}).catch(() => {});
      closeEventEditor();
      await Promise.allSettled([loadMe(), loadDiscover(), openEvent(saved.id)]);
    } catch (error: any) { Alert.alert('Could not save event', error.message); }
    finally { eventSaveInFlight.current = false; setBusy(false); }
  };
  const deleteEvent = () => {
    if (!selectedEvent) return;
    const eventId = selectedEvent.id;
    Alert.alert('Delete this event?', 'The event, its quests, and its group chat messages will be removed. Private moments will stay private.', [
      {text: 'Keep event', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => void api('/events/' + eventId + '/', {method: 'DELETE'}).then(async () => { setSelectedEvent(null); await Promise.all([loadMe(), loadDiscover()]); }).catch((error: any) => Alert.alert('Could not delete event', error.message))},
    ]);
  };

  const openEvent = async (eventId: number) => {
    try {
      const [event, questData, postData] = await Promise.all([
        api('/events/' + eventId + '/'),
        api('/events/' + eventId + '/quests/'),
        api('/posts/?event=' + eventId),
      ]);
      setSelectedEvent(event);
      setEventQuests(rows<Quest>(questData));
      setEventPosts(rows<Post>(postData));
      setEventRequests([]);
      if (event.host.id === me?.id) {
        const requests = await api('/events/' + eventId + '/requests/');
        setEventRequests(rows<AttendanceItem>(requests));
      }
      setRatingTargets([]);
      setEventRatings([]);
      if (event.is_finished && event.my_attendance_status === 'ACCEPTED') {
        const [attendeeData, ratingData] = await Promise.all([
          api('/events/' + eventId + '/attendees/'),
          api('/ratings/?event=' + eventId),
        ]);
        setRatingTargets(rows<AttendanceItem>(attendeeData).map(attendance => attendance.user).filter(person => person.id !== me?.id));
        setEventRatings(rows<RatingItem>(ratingData));
      }
    } catch (error: any) { Alert.alert('Could not open event', error.message); }
  };

  const reviewEventItem = async (id: number, decision: string) => {
    if (!selectedEvent) return;
    try {
      await api('/events/' + selectedEvent.id + '/review-request/', { method: 'POST', body: JSON.stringify({ attendance_id: id, decision }) });
      await openEvent(selectedEvent.id);
    } catch (error: any) { Alert.alert('Could not save review', error.message); }
  };

  const openComposer = (quest: Quest | null) => {
    const draft = composerDrafts.current.get(quest ? 'quest:' + quest.id : 'post');
    setMoment(draft?.caption || ''); setMomentMedia(draft?.media || null); setMomentLocation(draft?.location || '');
    setProofQuest(quest); setComposeOpen(true);
  };
  const closeComposer = (discard: boolean) => {
    const key = proofQuest ? 'quest:' + proofQuest.id : 'post';
    if (discard) composerDrafts.current.delete(key);
    else composerDrafts.current.set(key, {caption: moment, media: momentMedia, location: momentLocation});
    setMoment(''); setMomentMedia(null); setMomentLocation(''); setProofQuest(null); setComposeOpen(false);
  };
  const beginQuestProof = (quest: Quest) => {
    if (!selectedEvent || selectedEvent.quest_status !== 'ACTIVE' || selectedEvent.my_attendance_status !== 'ACCEPTED' || quest.my_submission) return;
    openComposer({...quest, event: selectedEvent.id, event_name: selectedEvent.name});
  };

  const rateAttendee = async (targetId: number, reaction: Reaction) => {
    if (!selectedEvent) return;
    try {
      const rating = await api('/ratings/', { method: 'POST', body: JSON.stringify({ event: selectedEvent.id, target_id: targetId, reaction }) });
      setEventRatings(current => [...current.filter(item => item.target.id !== targetId), rating]);
    } catch (error: any) { Alert.alert('Could not save rating', error.message); }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      notificationRequestVersion.current++;
      try {
        await api('/notifications/mark-read/', { method: 'POST', body: JSON.stringify({ ids: [notification.id] }) });
        setNotifications(current => current.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
      } catch (_) { /* Do not hide an unread indicator when saving fails. */ }
      finally { notificationRequestVersion.current++; }
    }
    try {
      if (notification.comment_post_id) {
        const post = await api('/posts/' + notification.comment_post_id + '/');
        setTab('Home');
        await openComments(post);
      } else if (notification.event) {
        await openEvent(notification.event.id);
        setTab('Explore');
      }
    } catch (error: any) { Alert.alert('Could not open notification', error.message); }
  };
  const markNotificationsRead = async () => {
    const unreadIds = notifications.filter(item => !item.is_read).map(item => item.id);
    if (!unreadIds.length) return;
    notificationRequestVersion.current++;
    try {
      await api('/notifications/mark-read/', { method: 'POST', body: JSON.stringify({ ids: unreadIds }) });
      setNotifications(current => current.map(item => unreadIds.includes(item.id) ? {...item, is_read: true} : item));
    } catch (_) { Alert.alert('Could not mark notifications read', 'Please try again.'); }
    finally { notificationRequestVersion.current++; }
  };

  const choosePhoto = async (videoOnly = false) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photos are off', 'Allow photo access to attach an image to this post.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: videoOnly ? ['videos'] : ['images', 'videos'], allowsEditing: false, quality: 0.82 });
    if (!result.canceled) {
      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? new File(asset.uri).size;
      if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) return Alert.alert('File is too large', 'Choose a photo or video that is 50 MB or smaller.');
      if (asset.type === 'video') setMomentMedia(asset);
      else setPhotoEditor({ original: asset, working: asset });
    }
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera is off', 'Allow camera access to take a photo for this post.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setPhotoEditor({ original: asset, working: asset });
    }
  };
  const saveEditedImage = async (configure: (context: ReturnType<typeof ImageManipulator.manipulate>) => void) => {
    if (!photoEditor || photoEditInFlight.current) return;
    const source = photoEditor.working;
    photoEditInFlight.current = true;
    setPhotoEditorBusy(true);
    try {
      const context = ImageManipulator.manipulate(source.uri);
      configure(context);
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });
      const working: ImagePicker.ImagePickerAsset = {
        ...source,
        assetId: null,
        base64: null,
        exif: null,
        fileName: 'socialquest-photo.jpg',
        fileSize: undefined,
        height: result.height,
        mimeType: 'image/jpeg',
        type: 'image',
        uri: result.uri,
        width: result.width,
      };
      setPhotoEditor(current => current?.working.uri === source.uri ? { ...current, working } : current);
    } catch (_) {
      Alert.alert('Could not edit photo', 'That edit could not be applied. Your original photo is still safe.');
    } finally {
      photoEditInFlight.current = false;
      setPhotoEditorBusy(false);
    }
  };
  const transformPhoto = (operation: PhotoOperation) => void saveEditedImage(context => {
    if (operation === 'rotate-left') context.rotate(-90);
    if (operation === 'rotate-right') context.rotate(90);
    if (operation === 'mirror') context.flip(FlipType.Horizontal);
  });
  const cropPhoto = (ratio: number) => {
    if (!photoEditor) return;
    const { width, height } = photoEditor.working;
    if (!width || !height) return Alert.alert('Crop unavailable', 'We could not read this photo’s dimensions.');
    let cropWidth = width;
    let cropHeight = height;
    if (width / height > ratio) cropWidth = Math.floor(height * ratio);
    else cropHeight = Math.floor(width / ratio);
    void saveEditedImage(context => context.crop({
      originX: Math.floor((width - cropWidth) / 2),
      originY: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    }));
  };
  const tagCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location is off', 'Allow location access only to add an optional place tag to this post.');
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      const label = [place?.district, place?.city, place?.region, place?.country].filter(Boolean).slice(0, 2).join(', ');
      setMomentLocation(label || 'Current location');
    } catch (_) { Alert.alert('Location unavailable', 'We could not look up a place name. You can still post without it.'); }
  };
  const share = async () => {
    if (uploadInFlight.current) return;
    if (proofQuest && !momentMedia) return Alert.alert('Add your quest moment', 'Choose a photo or video reel to complete this quest.');
    if (!proofQuest && !moment.trim() && !momentMedia) return Alert.alert('Add a moment', 'Write a few words or attach a photo before posting.');
    uploadInFlight.current = true; setBusy(true);
    try {
      const uploadMedia = momentMedia;
      const uploadSize = uploadMedia ? (uploadMedia.fileSize ?? new File(uploadMedia.uri).size) : 0;
      if (typeof uploadSize === 'number' && uploadSize > MAX_UPLOAD_BYTES) throw new Error('Choose a photo or video that is 50 MB or smaller.');
      const data = new FormData();
      if (proofQuest) {
        data.append('quest', String(proofQuest.id));
        data.append('caption', moment.trim());
        data.append('media_type', uploadMedia?.type === 'video' ? 'REEL' : 'IMAGE');
      } else {
        data.append('kind', uploadMedia?.type === 'video' ? 'REEL' : 'POST');
        data.append('body', moment.trim());
        if (momentLocation) data.append('location_name', momentLocation);
      }
      if (uploadMedia) data.append('media', new File(uploadMedia.uri));
      await api(proofQuest ? '/submissions/' : '/posts/', { method: 'POST', body: data });
      setMoment('');
      setMomentMedia(null);
      setMomentLocation('');
      const completedQuest = proofQuest;
      composerDrafts.current.delete(completedQuest ? 'quest:' + completedQuest.id : 'post');
      const refreshEventId = completedQuest?.event;
      setProofQuest(null);
      setComposeOpen(false);
      await Promise.allSettled([refreshVisibleProfile(), loadFeed(), loadMe(), ...(refreshEventId ? [openEvent(refreshEventId)] : [])]);
      if (completedQuest) Alert.alert('Quest complete! ✦', '+' + completedQuest.xp_reward + ' XP earned. Your ' + (uploadMedia?.type === 'video' ? 'reel' : 'photo') + ' is now part of ' + (completedQuest.event_name || 'the event') + '.');
    } catch (error: any) { Alert.alert(proofQuest ? 'Could not share quest proof' : 'Could not share moment', error.message); } finally { uploadInFlight.current = false; setBusy(false); }
  };

  const toggleLike = async (post: Post) => {
    if (likeInFlight.current.has(post.id)) return;
    likeInFlight.current.add(post.id);
    try {
      const result = await api('/posts/' + post.id + '/like/', { method: post.liked_by_me ? 'DELETE' : 'POST' });
      const update = (item: Post) => item.id === post.id ? { ...item, liked_by_me: result.liked, like_count: result.like_count } : item;
      setPosts(current => current.map(update)); setReels(current => current.map(update)); setEventPosts(current => current.map(update)); setProfilePosts(current => current.map(update));
    } catch (error: any) { Alert.alert('Could not update like', error.message); }
    finally { likeInFlight.current.delete(post.id); }
  };
  const toggleFollow = async (person: User) => {
    if (followInFlight.current || person.id === me?.id) return;
    followInFlight.current = true; setFollowBusy(true);
    try {
      await api('/people/' + person.id + '/follow/', { method: person.is_followed_by_me ? 'DELETE' : 'POST' });
      const updated: User = await api('/people/' + person.id + '/');
      setSelectedUser(current => current?.id === person.id ? updated : current);
      setPeopleResults(current => current.map(item => item.id === person.id ? updated : item));
      setPeople(current => current.map(item => item.id === person.id ? updated : item));
      await loadFollowing(); await loadMe();
    } catch (error: any) { Alert.alert('Could not update follow', error.message); }
    finally { followInFlight.current = false; setFollowBusy(false); }
  };

  const shareResource = async (title: string, message: string, path: string) => {
    const url = API_URL.replace(/\/api$/, '') + path;
    try {
      // Android combines `url` and `message` in some share targets, which can
      // turn a valid link into `/s/post/8/ caption`. Keep the link in the text
      // body there; iOS can still use its dedicated URL field.
      if (Platform.OS === 'ios') {
        await Share.share({ title, message, url });
      } else {
        await Share.share({ title, message: message + '\n' + url });
      }
    } catch (error: any) {
      if (error?.message) Alert.alert('Could not share', error.message);
    }
  };

  const beginEditPost = (post: Post) => {
    setEditingPost(post);
    setEditBody(post.body || '');
    setEditLocation(post.location_name || '');
  };
  const savePostEdit = async () => {
    if (!editingPost) return;
    try {
      await api('/posts/' + editingPost.id + '/', { method: 'PATCH', body: JSON.stringify({ body: editBody.trim(), location_name: editLocation.trim() }) });
      setEditingPost(null);
      await refreshVisibleProfile();
      await loadFeed();
      if (selectedEvent) await openEvent(selectedEvent.id);
    } catch (error: any) { Alert.alert('Could not save post', error.message); }
  };
  const deletePost = (post: Post) => {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/posts/' + post.id + '/', { method: 'DELETE' }).then(async () => { setProfilePosts(current => current.filter(item => item.id !== post.id)); await refreshVisibleProfile(); await loadFeed(); if (selectedEvent) await openEvent(selectedEvent.id); }).catch((error: any) => Alert.alert('Could not delete post', error.message)) },
    ]);
  };
  const loadComments = async (postId: number) => {
    if (activeCommentPostId.current !== postId) return;
    const version = ++commentRequestVersion.current;
    const result = rows<CommentItem>(await api('/comments/?post=' + postId));
    if (activeCommentPostId.current === postId && version === commentRequestVersion.current) setComments(result);
  };
  const openComments = async (post: Post) => {
    activeCommentPostId.current = post.id;
    const panelVersion = ++commentPanelVersion.current;
    setCommentPost(post);
    setComments(post.recent_comments || []);
    setCommentBody('');
    setEditingComment(null);
    setReplyingTo(null);
    try { await loadComments(post.id); } catch (error: any) {
      if (panelVersion === commentPanelVersion.current) Alert.alert('Could not load comments', error.message);
    }
  };
  const closeComments = () => {
    activeCommentPostId.current = null;
    commentPanelVersion.current += 1; commentRequestVersion.current += 1;
    Keyboard.dismiss();
    setCommentPost(null);
    setCommentBody('');
    setEditingComment(null);
    setReplyingTo(null);
  };
  const replyToComment = (comment: CommentItem) => {
    if (commentInFlight.current) return;
    const mention = '@' + comment.author.username + ' ';
    setEditingComment(null);
    setReplyingTo(comment);
    setCommentBody(current => current.startsWith(mention) ? current : mention + current);
    requestAnimationFrame(() => commentInputRef.current?.focus());
  };
  const clearReplyTarget = () => {
    const mention = replyingTo ? '@' + replyingTo.author.username + ' ' : '';
    if (mention) setCommentBody(current => current.startsWith(mention) ? current.slice(mention.length) : current);
    setReplyingTo(null);
  };
  const updateCommentCount = (postId: number, change: number) => {
    const adjust = (post: Post) => post.id === postId ? { ...post, comment_count: Math.max(0, post.comment_count + change) } : post;
    setPosts(current => current.map(adjust));
    setReels(current => current.map(adjust));
    setEventPosts(current => current.map(adjust));
    setProfilePosts(current => current.map(adjust));
    setCommentPost(current => current?.id === postId ? adjust(current) : current);
  };
  const saveComment = async () => {
    const body = commentBody.trim();
    if (!commentPost || !body || commentInFlight.current) return;
    commentInFlight.current = true; setCommentSubmitting(true);
    const postId = commentPost.id;
    const panelVersion = commentPanelVersion.current;
    const isCurrentPanel = () => activeCommentPostId.current === postId && commentPanelVersion.current === panelVersion;
    let saved = false;
    try {
      const isNewComment = !editingComment;
      if (editingComment) await api('/comments/' + editingComment.id + '/', { method: 'PATCH', body: JSON.stringify({ body }) });
      else await api('/comments/', { method: 'POST', body: JSON.stringify({ post: postId, parent: replyingTo?.id || null, body }) });
      saved = true;
      if (isNewComment) updateCommentCount(postId, 1);
      if (!isCurrentPanel()) return;
      setCommentBody('');
      setEditingComment(null);
      setReplyingTo(null);
      await Promise.all([loadComments(postId), loadNotifications()]);
    } catch (error: any) {
      if (isCurrentPanel()) Alert.alert(saved ? 'Reply saved' : 'Could not save comment', saved ? 'Your reply was saved. Reopen the comments to refresh them.' : error.message);
    } finally { commentInFlight.current = false; setCommentSubmitting(false); }
  };
  const commentThreadIds = (rootId: number) => {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      comments.forEach(comment => {
        if (comment.parent && ids.has(comment.parent) && !ids.has(comment.id)) {
          ids.add(comment.id);
          changed = true;
        }
      });
    }
    return ids;
  };
  const showCommentOptions = (comment: CommentItem) => {
    if (commentInFlight.current || comment.author.id !== me?.id) return;
    const deletedIds = commentThreadIds(comment.id);
    Alert.alert('Your comment', 'Edit it or delete it permanently.', [
      { text: 'Edit', onPress: () => { setReplyingTo(null); setEditingComment(comment); setCommentBody(comment.body); requestAnimationFrame(() => commentInputRef.current?.focus()); } },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/comments/' + comment.id + '/', { method: 'DELETE' }).then(() => { if (commentPost) { setComments(current => current.filter(item => !deletedIds.has(item.id))); updateCommentCount(commentPost.id, -deletedIds.size); } }).catch((error: any) => Alert.alert('Could not delete comment', error.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openDeviceNotification = async (notice: DeliveryNotice) => {
    if (notice.recipient_id !== me?.id) return;
    closePeople(); setSelectedEvent(null); closeComments();
    if (notice.kind === 'MESSAGE' && notice.conversation_id) {
      const conversation = await api('/conversations/' + notice.conversation_id + '/');
      setActiveChat(conversation); setTab('Chats');
    } else if (notice.post_id) {
      const post = await api('/posts/' + notice.post_id + '/');
      setTab('Home'); await openComments(post);
    } else if (notice.event_id) { setTab('Explore'); await openEvent(notice.event_id); }
    else { setTab('Notifications'); await loadNotifications(); }
  };
  const deviceNotifications = useDeviceNotifications({token, userId:me?.id, chatsOpen:tab === 'Chats', api, open:openDeviceNotification});
  const notificationPermissionCard = <View style={notificationStyles.card}><Text style={notificationStyles.copy}>{deviceNotifications.message}</Text><Pressable accessibilityRole="button" disabled={deviceNotifications.busy} style={styles.secondary} onPress={() => void (deviceNotifications.enabled ? deviceNotifications.disable() : deviceNotifications.enable())}><Text style={styles.secondaryText}>{deviceNotifications.busy ? 'Please wait…' : deviceNotifications.enabled ? 'Turn off notifications' : deviceNotifications.settingsNeeded ? 'Open notification settings' : 'Enable notifications'}</Text></Pressable></View>;

  if (!authReady) return <View style={styles.auth}><Text style={styles.authWordBrand}>SocialQuest</Text><ActivityIndicator color={colors.accent} style={{marginTop: 16}} /><Text style={styles.copy}>Restoring your adventure…</Text></View>;

  if (!token) {
    return <View style={styles.auth}>
      <View style={[styles.authArt, { paddingTop: insets.top + 24 }]}>
        <LinearGradient colors={gradients.auth} style={styles.authBackdrop} /><View pointerEvents="none" style={styles.authOrbitLarge} /><View pointerEvents="none" style={styles.authOrbitSmall} />
        <View style={styles.authArtContent}><View style={styles.authWordmark}><View style={styles.bigMark}><Text style={styles.markText}>S</Text></View><Text style={styles.authWordBrand}>SocialQuest</Text></View><Text style={styles.authKicker}>REAL WORLD · REAL PEOPLE</Text><Text style={[styles.authDisplayTitle, width < 360 && styles.authDisplayTitleCompact]}>A little adventure.{`\n`}<Text style={styles.authDisplayTitleAccent}>A real connection.</Text></Text></View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authForm}>
        <ScrollView contentContainerStyle={[styles.authContent, { paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{mode === 'login' ? 'WELCOME IN' : 'START YOUR STORY'}</Text>
          <Text style={styles.authTitle}>{mode === 'login' ? 'Find your people.' : 'Start your story.'}</Text>
          <Text style={styles.authDescription}>{mode === 'login' ? 'Log in and see what your community is up to.' : 'A few details and you are ready for your first quest.'}</Text>
          {mode === 'register' && <><Text style={styles.authLabel}>DISPLAY NAME</Text><TextInput accessibilityLabel="Display name" style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="What should people call you?" placeholderTextColor={colors.muted} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => usernameInput.current?.focus()} /></>}
          <Text style={styles.authLabel}>USERNAME</Text><TextInput ref={usernameInput} accessibilityLabel="Username" style={styles.input} value={username} onChangeText={setUsername} placeholder="your_username" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'login' ? 'username' : 'username-new'} textContentType="username" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => (mode === 'register' ? emailInput : passwordInput).current?.focus()} />
          {mode === 'register' && <><Text style={styles.authLabel}>EMAIL</Text><TextInput ref={emailInput} accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} /></>}
          <Text style={styles.authLabel}>PASSWORD</Text><TextInput ref={passwordInput} accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} textContentType={mode === 'login' ? 'password' : 'newPassword'} returnKeyType="go" onSubmitEditing={authenticate} />
          <Pressable accessibilityRole="button" accessibilityState={{busy, disabled: busy}} style={[styles.primary, iconLabelRow, busy && styles.dim]} onPress={authenticate} disabled={busy}>{busy ? <ActivityIndicator color={colors.onPrimary} /> : null}<Text style={styles.primaryText}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in →' : 'Create my account →'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'login' ? 'register' : 'login')}><Text style={styles.switchText}>{mode === 'login' ? 'New here?  Create an account' : 'Already a member?  Log in'}</Text></Pressable>
          <AppearanceSettings />
          <Text style={styles.authNote}>By continuing, you agree to build a kind, consent-first community.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>;
  }

  const rootComments = comments.filter(comment => !comment.parent || !comments.some(candidate => candidate.id === comment.parent));
  const renderCommentThread = (comment: CommentItem, depth = 0): ReactNode => {
    const childComments = comments.filter(candidate => candidate.parent === comment.id);
    return <View key={comment.id} style={[styles.commentThread, depth > 0 && styles.commentThreadChild]}>
      <Pressable accessibilityRole="button" onLongPress={() => showCommentOptions(comment)} style={[styles.commentCard, depth > 0 && styles.subcommentCard]}>
        <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(comment.author) + "'s profile"} onPress={() => { closeComments(); setSelectedUser(comment.author); }}><Avatar user={comment.author} /></Pressable>
        <View style={styles.commentCopy}>
          <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(comment.author) + "'s profile"} onPress={() => { closeComments(); setSelectedUser(comment.author); }}><Text style={styles.personName}>{nameOf(comment.author)}</Text></Pressable>
          <Text style={styles.commentBody}>{comment.body}</Text>
          <View style={styles.commentActions}>
            <Text style={styles.personMeta}>{dateOf(comment.created_at)}{comment.author.id === me?.id ? ' · hold to manage' : ''}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={'Reply to ' + nameOf(comment.author)} onPress={() => replyToComment(comment)} onLongPress={() => showCommentOptions(comment)} style={styles.commentReply}><Text style={styles.commentReplyText}>Reply</Text></Pressable>
          </View>
        </View>
      </Pressable>
      {childComments.map(child => renderCommentThread(child, depth + 1))}
    </View>;
  };

  const home = <FlatList data={posts} CellRendererComponent={FeedCell} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadFeed)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><View style={socialStyles.homeHeading}><Text style={styles.eyebrow}>YOUR NEXT ADVENTURE</Text><Pressable accessibilityRole="button" accessibilityLabel="Search events or people" style={socialStyles.searchIconButton} onPress={() => { setSearchFocusRequest(value => value + 1); setTab('Explore'); }}><GlassBackdrop /><SearchIcon /></Pressable></View><Text style={styles.homeGreeting}>Hello,</Text><Text style={styles.title}>{nameOf(me)} <Text style={styles.homeSpark}>✦</Text></Text><View style={styles.questFilters}><Pressable accessibilityRole="button" accessibilityState={{selected: true}} style={[styles.questFilter, styles.questFilterActive]} onPress={() => void refresh(loadFeed)}><Text style={[styles.questFilterText, styles.questFilterTextActive]}>For you</Text></Pressable><Pressable accessibilityRole="button" style={styles.questFilter} onPress={() => void findNearbyEvents()}><Text style={styles.questFilterText}>Nearby</Text></Pressable><Pressable accessibilityRole="button" style={styles.questFilter} onPress={() => setTab('Reels')}><Text style={styles.questFilterText}>Reels</Text></Pressable></View><View style={styles.questSectionHeader}><Text style={styles.questSectionTitle}>Recommended quests</Text><Pressable accessibilityRole="button" onPress={() => setTab('Explore')}><Text style={styles.questSeeAll}>See all</Text></Pressable></View><View style={styles.mobileQuestDeck}>{events.slice(0, 2).map((event, index) => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + event.name} key={event.id} style={styles.mobileQuestCard} onPress={() => void openEvent(event.id)}><EventArtwork image={event.cover_image} date={dateOf(event.starts_at)} live={event.quest_status === 'ACTIVE'} alternate={index % 2 === 1} compact /><View style={styles.mobileQuestCopy}><Text numberOfLines={2} style={styles.mobileQuestName}>{event.name}</Text><Text numberOfLines={1} style={styles.mobileQuestMeta}>{event.location_name}</Text><Text style={styles.mobileQuestXp}>{event.accepted_count}/{event.capacity} going</Text></View></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Share a moment" style={styles.homeComposer} onPress={() => openComposer(null)}><Avatar user={me} /><View style={styles.homeComposerCopy}><Text style={styles.homeComposerPrompt}>A moment worth sharing?</Text><View style={socialStyles.homeComposerActionRow}><Ionicons name="add-circle-outline" size={17} color={colors.accent} /><Text style={styles.homeComposerAction}>Share a photo, reel, or thought</Text></View></View></Pressable>{!deviceNotifications.enabled ? <Pressable accessibilityRole="button" accessibilityLabel="Set up notifications" style={styles.notificationNudge} onPress={() => setTab('Notifications')}><Ionicons name="notifications-outline" size={19} color={colors.muted} /><View style={{flex: 1}}><Text style={styles.notificationNudgeTitle}>Stay in the loop</Text><Text style={styles.personMeta}>A heads-up for your next adventure.</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} /></Pressable> : null}</View>} ListEmptyComponent={<Empty loading={accountLoading} icon="✦" title="Your feed is ready." body="Share a moment from your next adventure." />} renderItem={({ item }) => <PostCard onLike={post => void toggleLike(post)} post={item} mine={item.author.id === me?.id} onEdit={beginEditPost} onDelete={deletePost} onShare={post => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + post.id + '/')} onComments={post => void openComments(post)} onOpenProfile={setSelectedUser} />} />;
  const explore = <DiscoverSearch<EventItem, User> api={api} query={query} onQuery={value => { setQuery(value); setNearbyActive(false); }} kind={searchKind} onKind={setSearchKind} focusRequest={searchFocusRequest} refreshKey={events} nearbyEvents={nearbyActive ? events : null} onNearby={() => void findNearbyEvents()} onHost={() => openEventEditor()}
    renderEvent={item => <View style={styles.eventCard}><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + item.name} onPress={() => void openEvent(item.id)}><EventArtwork image={item.cover_image} date={dateOf(item.starts_at)} live={item.quest_status === 'ACTIVE'} alternate={item.id % 2 === 0} /><View style={styles.eventText}><Text style={styles.eventName}>{item.name}</Text><Text style={styles.eventMeta}>{item.location_name} · {item.accepted_count}/{item.capacity} going</Text>{item.recommendation_reason ? <Text style={styles.eventRecommendation}>For you · {item.recommendation_reason}</Text> : null}</View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.host) + "'s profile"} style={styles.eventHostLink} onPress={() => setSelectedUser(item.host)}><Text style={[styles.hostMeta, styles.eventHostLinkText]}>Hosted by {nameOf(item.host)} · ★ {item.host.karma ?? 0}</Text></Pressable></View>}
    renderPerson={person => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(person) + "'s profile"} style={styles.personCard} onPress={() => setSelectedUser(person)}><Avatar user={person} /><View style={socialStyles.personCopy}><Text style={styles.personName}>{nameOf(person)}</Text><Text style={styles.personMeta}>@{person.username}{person.city ? ' · ' + person.city : ''}</Text><Text style={styles.personMeta}>★ {person.karma ?? 0} · {person.xp || 0} XP</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>} />;
  const reelsView = <FlatList data={reels} CellRendererComponent={ReelCell} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadFeed)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>SMALL MOMENTS, ON REPEAT</Text><Text style={styles.title}>Quest <Text style={styles.serif}>reels.</Text></Text><Text style={styles.copy}>Keep the good moments moving.</Text></View>} ListEmptyComponent={<Empty loading={accountLoading} icon="◉" title="No reels yet." body="The next great moment could be yours." />} renderItem={({ item, index }) => <View style={[styles.reel, { height: 'auto', minHeight: 300 }, index % 2 ? styles.reelBlue : styles.reelPurple]}>{item.media ? <ReelVideo uri={item.media} /> : <Ionicons name="play-circle-outline" size={54} color={colors.accent} />}<Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.author) + "'s profile"} onPress={() => setSelectedUser(item.author)}><Text style={styles.reelAuthor}>{nameOf(item.author)}</Text></Pressable><RelativeTime value={item.created_at} /><QuestAttribution quest={item.quest_title} event={item.event_name} /><Text style={styles.reelBody}>{item.body || 'A moment worth keeping.'}</Text><Pressable accessibilityRole="button" style={[styles.reelShare, iconLabelRow]} onPress={() => void shareResource('A SocialQuest reel', 'Come see this community reel on SocialQuest.', '/s/post/' + item.id + '/')}><Ionicons name="paper-plane-outline" size={16} color={colors.accent} /><Text style={styles.reelShareText}>Share</Text></Pressable></View>} />;
  const unreadMessageCount = conversations.reduce((count, chat) => count + (chat.unread_count || 0), 0);
  const activeChatPerson = activeChat?.participants.find(person => person.id !== me?.id);
  const chats = activeChat ? <View style={styles.chatScreen}><View style={[styles.chatHeader, glassStyles.toolbar]}><GlassBackdrop native /><Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" style={styles.chatBackButton} onPress={() => { setEmojiPickerOpen(false); Keyboard.dismiss(); setActiveChat(null); }}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={activeChat.is_group ? 'View group participants' : 'Open ' + nameOf(activeChatPerson) + "'s profile"} style={styles.chatPerson} onPress={() => activeChat.is_group ? setChatMembersOpen(true) : activeChatPerson && setSelectedUser(activeChatPerson)}>{activeChat.is_group ? <GroupAvatar /> : <Avatar user={activeChatPerson} />}<View style={styles.chatIdentity}><Text numberOfLines={2} style={styles.chatTitle}>{activeChat.display_name}</Text><Text style={[styles.chatSubtitle, appActive && !activeChat.is_group && activeChatPerson?.is_online && socialStyles.online]}>{activeChat.is_group ? (activeChat.event ? 'Event group' : 'Group chat') + ' · ' + activeChat.participants.length + ' participants' : appActive && activeChatPerson?.is_online ? '● Online' : 'Direct conversation'}</Text></View></Pressable><UnreadBadge count={activeChat.unread_count || 0} /><Pressable accessibilityRole="button" accessibilityLabel="Manage chat" style={styles.chatMenu} onPress={showChatOptions}><Ionicons name="ellipsis-horizontal" size={23} color={colors.text} /></Pressable></View><KeyboardLift><MessageList key={activeChat.id} currentUserId={me?.id} onReadThrough={id => void markChatRead(activeChat.id, id)} style={styles.messageScroller} data={messages} keyExtractor={item => String(item.id)} contentContainerStyle={styles.messageList} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" onRefresh={() => void refresh(() => loadMessages(activeChat.id))} refreshing={refreshing} ListEmptyComponent={<Empty icon="✦" title="This is a new conversation." body="A thoughtful hello is plenty." />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel="Message options" delayLongPress={300} onLongPress={() => showMessageOptions(item)} style={[styles.bubble, item.sender.id === me?.id && styles.bubbleMine]}>{activeChat.is_group && item.sender.id !== me?.id ? <Text style={styles.groupSender}>{nameOf(item.sender)}</Text> : null}<Text style={[styles.bubbleText, item.sender.id === me?.id && styles.bubbleMineText, item.deleted_for_everyone && styles.bubbleDeletedText]}>{item.deleted_for_everyone ? 'Message deleted' : item.body}</Text>{!item.deleted_for_everyone ? <Text style={[styles.bubbleTime, item.sender.id === me?.id && styles.bubbleMineTime]}>{item.sender.id === me?.id ? 'You · ' : ''}{new Date(item.created_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}{item.edited_at ? ' · edited' : ''}</Text> : null}</Pressable>} />{emojiPickerOpen ? <View style={styles.emojiPicker}>{chatEmojis.map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={'Add ' + emoji} style={styles.emojiChoice} onPress={() => { setMessage(current => current + emoji); setEmojiPickerOpen(false); }}><Text style={styles.emojiChoiceText}>{emoji}</Text></Pressable>)}</View> : null}<View style={[styles.composer, glassStyles.toolbar]}><GlassBackdrop native /><View style={styles.composerMark}><Ionicons name="sparkles-outline" size={20} color={colors.accent} /></View><Pressable accessibilityRole="button" accessibilityLabel="Add an emoji" style={styles.emojiTrigger} onPress={() => setEmojiPickerOpen(current => !current)}><Ionicons name="happy-outline" size={22} color={colors.muted} /></Pressable><TextInput numberOfLines={1} style={styles.messageInput} value={message} onChangeText={setMessage} maxLength={2000} accessibilityLabel="Message" placeholder="Message…" placeholderTextColor={colors.muted} multiline /><Pressable accessibilityRole="button" accessibilityLabel="Hide keyboard" style={styles.keyboardDismiss} onPress={Keyboard.dismiss}><Ionicons name="chevron-down" size={20} color={colors.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Send message" style={styles.send} onPress={send}><Ionicons name="arrow-up" size={22} color={colors.onPrimary} /></Pressable></View></KeyboardLift></View> : <FlatList data={conversations} CellRendererComponent={ChatCell} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadChats)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>YOUR INBOX</Text><View style={styles.chatIntroTitle}><Text style={styles.title}>Messages</Text><UnreadBadge count={unreadMessageCount} /></View><Text style={styles.copy}>Keep the good energy going after you meet.</Text><Text style={[styles.section, { marginTop: 22 }]}>START A NEW CHAT</Text>{following.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contacts}>{following.map(person => <Pressable accessibilityRole="button" key={person.id} style={styles.contact} onPress={() => void openChat(person)} onLongPress={() => setSelectedUser(person)}><Avatar user={person} /><Text numberOfLines={1} style={styles.contactName}>{nameOf(person)}</Text></Pressable>)}</ScrollView> : <Text style={styles.chatFollowHint}>Follow someone to start a chat with them.</Text>}<Text style={styles.section}>CONVERSATIONS</Text></View>} ListEmptyComponent={<Empty loading={accountLoading} icon="✉" title="Your conversations will live here." body="Start with someone you met in Explore." />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'Open chat: ' + item.display_name + (item.unread_count ? ', ' + item.unread_count + ' unread messages' : '')} style={[styles.conversation, item.unread_count > 0 && styles.conversationUnread]} onPress={() => setActiveChat(item)} onLongPress={() => { if (item.is_group) {setActiveChat(item); setChatMembersOpen(true); return;} const person = item.participants.find(person => person.id !== me?.id); if (person) setSelectedUser(person); }}>{item.is_group ? <GroupAvatar /> : <Avatar user={item.participants.find(person => person.id !== me?.id)} />}<View style={styles.conversationCopy}><View style={styles.conversationTop}><Text numberOfLines={1} style={styles.personName}>{item.display_name}</Text><View style={styles.conversationTrailing}><Text style={styles.conversationTime}>{item.latest_message ? dateOf(item.latest_message.created_at) : ''}</Text><UnreadBadge count={item.unread_count || 0} /></View></View><Text numberOfLines={1} style={styles.personMeta}>{item.latest_message?.deleted_for_everyone ? 'Message deleted' : item.latest_message?.body || (item.is_group ? 'Say hello to your event group' : 'Start with a simple hello')}</Text>{item.is_group ? <Text style={styles.personMeta}>{item.participants.length} participants · {item.event ? 'Event group' : 'Group chat'}</Text> : null}{appActive && item.participants.some(person => person.id !== me?.id && person.is_online) ? <Text style={socialStyles.online}>● Online</Text> : null}</View></Pressable>} />;
  const notificationsView = <FlatList data={notifications} CellRendererComponent={AlertCell} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadNotifications)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>STAY IN THE LOOP</Text><Text style={styles.title}>Your <Text style={styles.serif}>notifications.</Text></Text><Text style={styles.copy}>Comment replies, RSVP activity, and host decisions appear here.</Text><Pressable accessibilityRole="button" style={styles.outline} onPress={() => void markNotificationsRead()}><Text style={styles.outlineText}>Mark all read</Text></Pressable>{notificationPermissionCard}</View>} ListEmptyComponent={<Empty loading={accountLoading} icon="✦" title="Nothing new yet." body="Comment replies and RSVP activity will show up here." />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={(item.is_read ? '' : 'Unread notification: ') + item.text} style={[styles.notificationCard, !item.is_read && styles.notificationUnread]} onPress={() => void openNotification(item)}><View style={[styles.notificationIcon, {backgroundColor: notificationAccent(item.kind).surface}]}><Ionicons name={item.kind === 'COMMENT_REPLY' ? 'chatbubble-ellipses-outline' : 'notifications-outline'} size={21} color={notificationAccent(item.kind).text} /></View><View style={styles.notificationCopy}>{!item.is_read ? <Text style={styles.unreadLabel}>● Unread</Text> : null}<Text style={styles.notificationText}>{item.text}</Text><Text style={styles.personMeta}>{item.event?.name || (item.kind === 'COMMENT_REPLY' ? 'Open replies' : 'SocialQuest')} · {dateOf(item.created_at)}</Text></View></Pressable>} />;
  const ownProfileEvents = [...hostedEvents, ...joinedEvents.filter(event => !hostedEvents.some(hosted => hosted.id === event.id))];
  const visibleProfilePosts = profilePostsOwner === profileUserId ? profilePosts : [];
  const filteredProfilePosts = visibleProfilePosts.filter(post => post.kind === profileSection);
  const renderProfilePost = (post: Post) => <PostCard post={post} mine={post.author.id === me?.id}
    onLike={item => void toggleLike(item)} onEdit={beginEditPost} onDelete={deletePost}
    onShare={item => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + item.id + '/')}
    onComments={item => void openComments(item)} onOpenProfile={setSelectedUser} />;
  const profileTabs = (includeEvents: boolean) => <View style={socialStyles.profileTabs}>
    {(['POST', 'REEL', ...(includeEvents ? ['EVENTS'] : [])] as Array<'POST' | 'REEL' | 'EVENTS'>).map(section => {
      const label = section === 'POST' ? 'Posts' : section === 'REEL' ? 'Reels' : 'Events';
      const count = section === 'EVENTS' ? ownProfileEvents.length : visibleProfilePosts.filter(post => post.kind === section).length;
      return <Pressable key={section} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected: profileSection === section}}
        style={[socialStyles.profileTab, profileSection === section && socialStyles.profileTabActive]} onPress={() => setProfileSection(section)}>
        <GlassBackdrop accent={profileSection === section} />
        <Text style={[socialStyles.profileTabText, profileSection === section && socialStyles.profileTabTextActive]}>{label}</Text>
        <Text style={[socialStyles.profileTabCount, profileSection === section && socialStyles.profileTabTextActive]}>{section !== 'EVENTS' && (profilePostsLoading || profilePostsError) ? '—' : count}</Text>
      </Pressable>;
    })}
  </View>;
  const profileLoadNotice = profileSection !== 'EVENTS' && (profilePostsLoading || profilePostsError) ? <View style={socialStyles.profileNotice}>
    <Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{profilePostsLoading ? 'Loading quest moments…' : profilePostsError}</Text>
    {profilePostsError && !profilePostsLoading ? <Pressable accessibilityRole="button" style={[styles.secondary, iconLabelRow]} onPress={() => void refreshVisibleProfile()}><Ionicons name="refresh-outline" size={18} color={colors.text} /><Text style={styles.secondaryText}>Try again</Text></Pressable> : null}
  </View> : null;
  const profileEmpty = !profilePostsLoading && !profilePostsError ? <Empty icon={profileSection === 'REEL' ? '◉' : '✦'}
    title={profileSection === 'REEL' ? 'No reels yet.' : 'No posts yet.'}
    body={profileUserId === me?.id ? 'Share a moment from your next quest. It will appear here.' : 'This adventurer hasn’t shared any visible moments here yet.'} /> : null;
  const profile = <FlatList<Post | EventItem>
    data={profileSection === 'EVENTS' ? ownProfileEvents : filteredProfilePosts}
    keyExtractor={item => ('kind' in item ? 'post-' : 'event-') + item.id}
    contentContainerStyle={[styles.profile, socialStyles.profileList]}
    onRefresh={() => void refresh(async () => { await Promise.all([loadMe(), refreshVisibleProfile()]); })} refreshing={refreshing}
    ListHeaderComponent={<View><View style={styles.profileTop}><Avatar user={me} large /><View style={styles.profileIdentity}><Text style={styles.eyebrow}>YOUR ADVENTURE LOG</Text><Text style={styles.profileName}>{nameOf(me)}</Text><Text style={styles.personMeta}>@{me?.username} · {me?.city || 'Everywhere'}</Text></View></View><Pressable accessibilityRole="button" style={[styles.secondary, iconLabelRow]} onPress={openProfileEditor}><Ionicons name="create-outline" size={18} color={colors.accent} /><Text style={styles.secondaryText}>Edit profile</Text></Pressable><Text style={styles.profileBio}>{me?.bio || 'Here for the little adventures that turn into real stories.'}</Text><View style={styles.scores}><Score tone="gold" label="XP EARNED" value={String(me?.xp || 0)} /><Score tone="mint" label="KARMA" value={String(me?.karma ?? 0)} /></View><View style={socialStyles.followScores}><Score tone="neutral" label="FOLLOWERS ›" value={String(me?.follower_count || 0)} onPress={() => me && openPeopleList('followers', me)} /><Score tone="neutral" label="FOLLOWING ›" value={String(me?.following_count || 0)} onPress={() => me && openPeopleList('following', me)} /></View><Text style={styles.profileHelp}>XP tracks completed quests. Karma comes from fellow guests after events. Both are public and independent.</Text><AppearanceSettings />{profileTabs(true)}{profileLoadNotice}</View>}
    ListEmptyComponent={profileSection === 'EVENTS' ? <Empty icon="⌖" title="Your quest log is ready." body="Events you host or join will appear here." /> : profileEmpty}
    renderItem={({item}) => 'kind' in item ? renderProfilePost(item) : <Pressable accessibilityRole="button" style={styles.personCard} onPress={() => void openEvent(item.id)}><View style={{flex: 1}}><Text style={styles.personName}>{item.name}</Text><Text style={styles.personMeta}>{item.host.id === me?.id ? 'Hosting' : 'Attending'} · {dateOf(item.starts_at)} · {item.location_name}</Text></View></Pressable>}
    ListFooterComponent={<View><Pressable accessibilityRole="button" style={[styles.secondary, iconLabelRow]} onPress={() => me && void shareResource('A SocialQuest profile', 'Meet ' + nameOf(me) + ' on SocialQuest.', '/?view=profile&profile=' + me.id)}><Ionicons name="share-social-outline" size={18} color={colors.text} /><Text style={styles.secondaryText}>Share profile</Text></Pressable><Pressable accessibilityRole="button" style={[styles.logout, iconLabelRow]} onPress={confirmLogout}><Ionicons name="log-out-outline" size={19} color={colors.danger} /><Text style={styles.logoutText}>Log out</Text></Pressable></View>}
  />;
  const unreadCount = notifications.filter(item => !item.is_read).length;
  const mobileTabs: Array<{ tab: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }> = [
    { tab: 'Home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { tab: 'Explore', label: 'Events', icon: 'compass-outline', activeIcon: 'compass' },
    { tab: 'Chats', label: 'Chats', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
    { tab: 'Notifications', label: 'Alerts', icon: 'notifications-outline', activeIcon: 'notifications' },
    { tab: 'Reels', label: 'Reels', icon: 'play-circle-outline', activeIcon: 'play-circle' },
    { tab: 'Profile', label: 'Profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
  ];
  const view = tab === 'Home' ? home : tab === 'Explore' ? explore : tab === 'Chats' ? chats : tab === 'Notifications' ? notificationsView : tab === 'Reels' ? reelsView : profile;

  return <View style={styles.app}>
    <View style={[styles.appHeader, { paddingTop: insets.top + 13 }]} onLayout={({ nativeEvent }) => setAppHeaderHeight(current => current === nativeEvent.layout.height ? current : nativeEvent.layout.height)}><Pressable accessibilityRole="button" style={styles.brandRow} onPress={() => setTab('Home')}><View style={styles.smallMark}><Text style={styles.smallMarkText}>S</Text></View><Text style={styles.appBrand}>socialquest</Text></Pressable><View style={styles.headerRight}><Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={styles.headerAction} onPress={() => setTab('Notifications')}><GlassBackdrop /><Ionicons name="notifications-outline" size={21} color={colors.muted} />{unreadCount ? <PulseBadge style={styles.headerNotificationBadge}>{unreadCount > 9 ? '9+' : unreadCount}</PulseBadge> : null}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Share a moment" style={styles.headerCompose} onPress={() => openComposer(null)}><Ionicons name="add" size={25} color={colors.onPrimary} /></Pressable></View></View>
    <ScreenTransition style={styles.content} transitionKey={tab}>{view}</ScreenTransition>
    <View style={[styles.nav, glassStyles.toolbar, { marginBottom: Math.max(insets.bottom - 14, 8) }]}><GlassBackdrop native radius={24} />{mobileTabs.map(item => <Pressable key={item.tab} accessibilityRole="tab" accessibilityLabel={item.label + (item.tab === 'Chats' && unreadMessageCount ? ', ' + unreadMessageCount + ' unread messages' : item.tab === 'Notifications' && unreadCount ? ', ' + unreadCount + ' unread notifications' : '')} accessibilityState={{selected: tab === item.tab}} style={[styles.navItem, glassStyles.navItem, tab === item.tab && glassStyles.navSelected]} onPress={() => { setTab(item.tab); if (item.tab !== 'Chats') setActiveChat(null); if (item.tab === 'Profile') void refresh(loadMe);  }}><Pop active={tab === item.tab}><Ionicons name={tab === item.tab ? item.activeIcon : item.icon} size={21} color={tab === item.tab ? colors.accent : colors.muted} />{(item.tab === 'Chats' ? unreadMessageCount : item.tab === 'Notifications' ? unreadCount : 0) > 0 ? <PulseBadge style={styles.navBadge}>{Math.min(99, item.tab === 'Chats' ? unreadMessageCount : unreadCount)}{(item.tab === 'Chats' ? unreadMessageCount : unreadCount) > 99 ? '+' : ''}</PulseBadge> : null}</Pop><Text numberOfLines={1} style={[styles.navLabel, tab === item.tab && styles.navActive]}>{item.label}</Text></Pressable>)}</View>

    <Modal visible={chatMembersOpen && !!activeChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setChatMembersOpen(false)}>
      <View style={[styles.app, {paddingTop: Math.max(insets.top, 24)}]}><View style={styles.groupHeader}><Text style={[styles.sheetTitle, {flex: 1}]}>Participants</Text><Pressable accessibilityRole="button" accessibilityLabel="Close participants" style={styles.commentsClose} onPress={() => setChatMembersOpen(false)}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View>
        <Text style={[styles.sheetCopy, {paddingHorizontal: 20}]}>{activeChat?.display_name}</Text><FlatList data={activeChat?.participants || []} contentContainerStyle={styles.list} keyExtractor={person => String(person.id)} renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item) + "'s profile"} style={styles.personCard} onPress={() => {setChatMembersOpen(false); setSelectedUser(item);}}><Avatar user={item} /><View style={{flex: 1}}><Text style={styles.personName}>{nameOf(item)}{item.id === me?.id ? ' (you)' : ''}</Text><Text style={styles.personMeta}>@{item.username}</Text></View></Pressable>} />
      </View>
    </Modal>
    {profileEditorOpen && token && me ? <ProfileEditor key={me.id} user={me} onSave={saveProfile} onClose={() => setProfileEditorOpen(false)} /> : null}
    <Modal visible={!!eventEditor} onDismiss={() => setEventEditorClosing(false)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => {if (!busy) {if (eventDateField) setEventDateField(null); else closeEventEditor();}}}>
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {eventEditor && eventDateField ? <EventDateTimePicker key={eventDateField} label={eventDateField === 'starts_at' ? 'Start time' : 'End time'} value={eventEditor[eventDateField]} minimum={eventDateField === 'ends_at' ? eventEditor.starts_at : undefined} onCancel={() => setEventDateField(null)} onConfirm={value => {
          setEventEditor(current => current && {...current, ...updateEventSchedule(current, eventDateField, value)});
          setEventDateField(null);
        }} /> : null}<ScrollView style={eventDateField ? {display: 'none'} : undefined} contentContainerStyle={[styles.profile, {paddingTop: Math.max(insets.top, 24)}]} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>HOST CONSOLE</Text><Text style={styles.sheetTitle}>{eventEditor?.id ? 'Edit adventure' : 'Host an adventure'}</Text><Text style={styles.sheetCopy}>Choose a place, pick a date, and bring people together. You can change every detail later.</Text>
          <Text style={styles.authLabel}>EVENT NAME</Text><TextInput style={styles.input} accessibilityLabel="Event name" placeholder="Event name" placeholderTextColor={colors.muted} maxLength={120} value={eventEditor?.name || ''} onChangeText={value => setEventEditor(current => current && {...current, name:value})} />
          <Text style={styles.authLabel}>DESCRIPTION</Text><TextInput style={[styles.input, {minHeight:120, textAlignVertical: 'top'}]} accessibilityLabel="Event description" placeholder="What will people do?" placeholderTextColor={colors.muted} maxLength={2000} multiline value={eventEditor?.description || ''} onChangeText={value => setEventEditor(current => current && {...current, description:value})} />
          <Text style={styles.authLabel}>VENUE</Text><Pressable accessibilityRole="button" disabled={busy || eventLocating} style={[styles.outline, iconLabelRow, eventLocating && styles.dim]} onPress={() => void detectEventLocation()}><Ionicons name="locate-outline" size={18} color={colors.accent} /><Text style={styles.outlineText}>{eventLocating ? 'Detecting location…' : 'Detect my location'}</Text></Pressable>{eventLocationStatus ? <Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{eventLocationStatus}</Text> : null}
          <TextInput style={styles.input} accessibilityLabel="Event location" placeholder="Venue or address" placeholderTextColor={colors.muted} maxLength={160} value={eventEditor?.location_name || ''} onChangeText={changeEventLocation} />
          <PlaceSuggestions query={eventEditor?.location_name || ''} active={eventEditor?.latitude == null && eventEditor?.longitude == null} maxLength={160} onPick={pickEventPlace} />
          <Text style={styles.authLabel}>WHEN</Text>
          <EventDateTimeField label="Starts at" disabled={busy} value={eventEditor?.starts_at || ''} onPress={() => {Keyboard.dismiss(); setEventDateField('starts_at');}} />
          <EventDateTimeField label="Ends at" disabled={busy} value={eventEditor?.ends_at || ''} onPress={() => {Keyboard.dismiss(); setEventDateField('ends_at');}} />
          <Text style={styles.personMeta}>Times are local to your device. If you move the start beyond the end, the end adjusts to keep the same duration.</Text>
          <Text style={styles.authLabel}>CAPACITY</Text><TextInput style={styles.input} accessibilityLabel="Capacity" placeholder="Capacity" placeholderTextColor={colors.muted} keyboardType="number-pad" value={eventEditor?.capacity || ''} onChangeText={value => setEventEditor(current => current && {...current, capacity:value})} />
          <View style={styles.ratingActions}>{(['PUBLIC', 'PRIVATE'] as const).map(privacy => <Pressable accessibilityRole="button" key={privacy} style={[styles.ratingChoice, eventEditor?.privacy === privacy && styles.ratingChoiceSelected]} onPress={() => setEventEditor(current => current && {...current, privacy})}><Text style={[styles.ratingChoiceText, eventEditor?.privacy === privacy && styles.ratingChoiceSelectedText]}>{privacy === 'PUBLIC' ? 'Public event' : 'Invite only'}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="button" disabled={busy || eventLocating} style={[styles.primary, (busy || eventLocating) && styles.dim]} onPress={() => void saveEvent()}><Text style={styles.primaryText}>{busy ? 'Saving…' : eventEditor?.id ? 'Save event' : 'Publish and generate quests'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={closeEventEditor}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>

    <PostComposer
      visible={composeOpen}
      editingPhoto={!!photoEditor}
      busy={busy}
      media={momentMedia}
      caption={moment}
      location={momentLocation}
      author={me}
      quest={proofQuest}
      onCaption={setMoment}
      onLocation={setMomentLocation}
      onLibrary={videoOnly => void choosePhoto(videoOnly)}
      onCamera={() => void takePhoto()}
      onEdit={() => momentMedia && setPhotoEditor({original: momentMedia, working: momentMedia})}
      onRemove={() => setMomentMedia(null)}
      onLocate={() => void tagCurrentLocation()}
      onClose={closeComposer}
      onPublish={() => void share()}
    />
    <Modal visible={!!photoEditor} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !photoEditorBusy && setPhotoEditor(null)}>
      <View style={[styles.photoEditorScreen, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.photoEditorHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel photo edits" disabled={photoEditorBusy} style={styles.photoEditorHeaderAction} onPress={() => setPhotoEditor(null)}><Text style={styles.photoEditorCancel}>Cancel</Text></Pressable>
          <Text style={styles.photoEditorTitle}>EDIT PHOTO</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Use edited photo" disabled={photoEditorBusy} style={[styles.photoEditorHeaderAction, styles.photoEditorDoneButton, photoEditorBusy && styles.dim]} onPress={() => { if (photoEditor) setMomentMedia(photoEditor.working); setPhotoEditor(null); }}><Text style={styles.photoEditorDone}>Done</Text></Pressable>
        </View>
        <View style={styles.photoEditorStage}>
          {photoEditor ? <Image accessible accessibilityLabel="Photo being edited" key={photoEditor.working.uri} style={styles.photoEditorImage} source={{ uri: photoEditor.working.uri }} resizeMode="contain" /> : null}
          <View pointerEvents="none" style={styles.cropGrid}><View style={[styles.cropGridLine, styles.cropGridVerticalOne]} /><View style={[styles.cropGridLine, styles.cropGridVerticalTwo]} /><View style={[styles.cropGridLine, styles.cropGridHorizontalOne]} /><View style={[styles.cropGridLine, styles.cropGridHorizontalTwo]} /></View>
          {photoEditorBusy ? <View style={styles.photoEditorLoading}><Text style={styles.photoEditorLoadingText}>APPLYING EDIT…</Text></View> : null}
        </View>
        <ScrollView style={styles.photoEditorControls} contentContainerStyle={styles.photoEditorControlsContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.photoEditorHint}>Center-crop for the feed, then rotate or mirror until the frame feels right.</Text>
          <Text style={styles.photoEditorSectionLabel}>ASPECT RATIO</Text>
          <View style={styles.photoEditorRow}>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => setPhotoEditor(current => current ? { ...current, working: current.original } : current)}><Text style={styles.photoEditorControlIcon}>↺</Text><Text style={styles.photoEditorControlText}>Original</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(1)}><View style={styles.ratioSquare} /><Text style={styles.photoEditorControlText}>Square</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(4 / 5)}><View style={styles.ratioPortrait} /><Text style={styles.photoEditorControlText}>Portrait</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(16 / 9)}><View style={styles.ratioLandscape} /><Text style={styles.photoEditorControlText}>Wide</Text></Pressable>
          </View>
          <Text style={styles.photoEditorSectionLabel}>TRANSFORM</Text>
          <View style={styles.photoEditorRow}>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => transformPhoto('rotate-left')}><Text style={styles.photoEditorControlIcon}>↶</Text><Text style={styles.photoEditorControlText}>Left</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => transformPhoto('rotate-right')}><Text style={styles.photoEditorControlIcon}>↷</Text><Text style={styles.photoEditorControlText}>Right</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => transformPhoto('mirror')}><Text style={styles.photoEditorControlIcon}>⇆</Text><Text style={styles.photoEditorControlText}>Mirror</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
    <Modal visible={(!!selectedUser || !!peoplePanel) && !commentPost && !editingPost && !composeOpen} transparent animationType="slide" onRequestClose={closePeople}>
      <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable feedback="none" style={styles.overlay} onPress={closePeople}>
          <Pressable feedback="none" style={[styles.sheet, socialStyles.peopleSheet]} onPress={event => event.stopPropagation()}>
            <View style={socialStyles.peopleHeading}>
              {selectedUser && peoplePanel ? <Pressable accessibilityRole="button" accessibilityLabel="Back to people list" style={[socialStyles.closeButton, iconLabelRow]} onPress={() => { setSelectedUser(null); void loadPeopleList(peoplePanel, peopleQuery); }}><Ionicons name="chevron-back" size={18} color={colors.text} /><Text style={styles.secondaryText}>Back</Text></Pressable> : peoplePanel?.person ? <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" style={[socialStyles.closeButton, iconLabelRow]} onPress={() => { const owner = peoplePanel.person!; setPeoplePanel(null); setSelectedUser(owner); }}><Ionicons name="chevron-back" size={18} color={colors.text} /><Text style={styles.secondaryText}>Profile</Text></Pressable> : <View />}
              <Pressable accessibilityRole="button" accessibilityLabel="Close people" style={[socialStyles.closeButton, iconLabelRow]} onPress={closePeople}><Text style={styles.secondaryText}>Close</Text><Ionicons name="close" size={19} color={colors.text} /></Pressable>
            </View>
            {selectedUser ? <FlatList<Post>
              data={filteredProfilePosts} keyExtractor={post => String(post.id)} keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false} contentContainerStyle={socialStyles.profileList}
              onRefresh={() => void refresh(refreshVisibleProfile)} refreshing={refreshing}
              ListHeaderComponent={<View>
              <Avatar user={selectedUser} large />
              <Text style={styles.sheetTitle}>{nameOf(selectedUser)}</Text>
              <Text style={styles.sheetCopy}>@{selectedUser.username} · {selectedUser.city || 'Everywhere'}</Text>
              <View style={styles.userScoreLine}><Text style={styles.personName}>★ {selectedUser.karma ?? 0} karma</Text><Text style={styles.personName}>✦ {selectedUser.xp || 0} XP</Text></View>
              <View style={socialStyles.followScores}>
                <Score tone="neutral" label="FOLLOWERS ›" value={String(selectedUser.follower_count || 0)} onPress={() => openPeopleList('followers', selectedUser)} />
                <Score tone="neutral" label="FOLLOWING ›" value={String(selectedUser.following_count || 0)} onPress={() => openPeopleList('following', selectedUser)} />
              </View>
              <Text style={styles.sheetCopy}>{selectedUser.bio || 'Here to turn small plans into meaningful stories.'}</Text>
              {selectedUser.id !== me?.id ? <>
                <Pressable accessibilityRole="button" disabled={followBusy} style={[styles.secondary, followBusy && styles.dim]} onPress={() => void toggleFollow(selectedUser)}><Text style={styles.secondaryText}>{followBusy ? 'Updating…' : selectedUser.is_followed_by_me ? 'Following · Unfollow' : 'Follow'}</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void openChat(selectedUser)}><View style={iconLabelRow}><Text style={styles.primaryText}>Send a message</Text><Ionicons name="paper-plane-outline" size={18} color={colors.onPrimary} /></View></Pressable>
              </> : <Pressable accessibilityRole="button" style={styles.secondary} onPress={openProfileEditor}><Text style={styles.secondaryText}>Edit profile</Text></Pressable>}
              <Pressable accessibilityRole="button" style={[styles.secondary, iconLabelRow]} onPress={() => void shareResource('A SocialQuest profile', 'Meet ' + nameOf(selectedUser) + ' on SocialQuest.', '/?view=profile&profile=' + selectedUser.id)}><Ionicons name="share-social-outline" size={18} color={colors.text} /><Text style={styles.secondaryText}>Share profile</Text></Pressable>
            {profileTabs(false)}{profileLoadNotice}</View>}
              ListEmptyComponent={profileEmpty} renderItem={({item}) => renderProfilePost(item)}
            /> : peoplePanel ? <>
              <Text style={styles.sheetTitle}>{peoplePanel.kind === 'invite' ? 'Invite people' : peoplePanel.kind === 'search' ? 'Search people' : peoplePanel.kind === 'followers' ? 'Followers' : 'Following'}</Text>
              {peoplePanel.person ? <Text style={styles.personMeta}>@{peoplePanel.person.username}</Text> : null}
              <View style={styles.searchRow}>
                <TextInput accessibilityLabel="Search people" style={styles.searchInput} value={peopleQuery} onChangeText={setPeopleQuery} placeholder="Name or username" placeholderTextColor={colors.muted} maxLength={100} autoCapitalize="none" autoCorrect={false} autoFocus={peoplePanel.kind === 'search'} returnKeyType="search" onSubmitEditing={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }} />
                <Pressable accessibilityRole="button" accessibilityLabel="Search" style={[styles.searchButton, {minWidth: 44, minHeight: 44}]} onPress={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }}><SearchIcon /></Pressable>
              </View>
              <FlatList style={socialStyles.peopleList} data={peopleLoading ? [] : peopleResults} keyboardShouldPersistTaps="handled" keyExtractor={person => String(person.id)} ListEmptyComponent={<View style={socialStyles.peopleEmpty}><Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{peopleLoading ? 'Loading people…' : peopleError || (peopleQuery.trim() ? 'No matching people. Try another name or username.' : peoplePanel.kind === 'followers' ? 'No followers yet.' : peoplePanel.kind === 'following' ? 'Not following anyone yet.' : 'No other members yet.')}</Text>{peopleError ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void loadPeopleList(peoplePanel, peopleQuery)}><Text style={styles.secondaryText}>Try again</Text></Pressable> : null}</View>} renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={(peoplePanel.kind === 'invite' ? 'Invite ' : 'Open ') + nameOf(item)} style={styles.personCard} onPress={() => { Keyboard.dismiss(); if (peoplePanel.kind === 'invite') void invitePerson(item); else setSelectedUser(item); }}><Avatar user={item} /><View style={socialStyles.personCopy}><Text style={styles.personName}>{nameOf(item)}</Text><Text style={styles.personMeta}>@{item.username}{item.is_followed_by_me ? ' · Following' : ''}</Text></View><Text style={styles.secondaryText}>{peoplePanel.kind === 'invite' ? 'Invite' : '›'}</Text></Pressable>} />
            </> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    <EventDetailsSheet visible={!!selectedEvent && !eventEditor && !eventEditorClosing && !composeOpen && !selectedUser && !peoplePanel && !commentPost && !editingPost} eventId={selectedEvent?.id} onClose={() => setSelectedEvent(null)}>
      {selectedEvent && <>
        <Text style={styles.eyebrow}>{dateOf(selectedEvent.starts_at).toUpperCase()} · {selectedEvent.location_name}</Text>
        <Text style={styles.sheetTitle}>{selectedEvent.name}</Text>
        <Text style={styles.sheetCopy}>{selectedEvent.description}</Text>
        <Pressable accessibilityRole="button" style={styles.eventHost} onPress={() => setSelectedUser(selectedEvent.host)}><Avatar user={selectedEvent.host} /><Text style={styles.hostMeta}>Hosted by {nameOf(selectedEvent.host)} · ★ {selectedEvent.host.karma ?? 0}</Text></Pressable>
        {selectedEvent.host.id === me?.id || selectedEvent.my_attendance_status === 'ACCEPTED' ? <Pressable accessibilityRole="button" accessibilityLabel="Open event group chat" style={[styles.secondary, iconLabelRow]} onPress={() => void openEventChat()}><Ionicons name="people-outline" size={20} color={colors.accent} /><Text style={styles.secondaryText}>Event group chat</Text></Pressable> : null}
        <View style={styles.questNotice}><Text style={styles.section}>QUEST WINDOW</Text><Text style={styles.questNoticeText}>{selectedEvent.quest_status === 'ACTIVE' ? 'Quests are live! Post a photo or reel to complete a quest and earn XP. ✦' : selectedEvent.is_finished ? 'The quest window has ended. Nicely done everyone! 🎉' : 'Quests unlock when this event starts. Stay ready! ⚔️'}</Text></View>
        <View style={styles.eventQuestList}>
          <Text style={styles.section}>THE QUEST LINE · {eventQuests.length}</Text>
          {eventQuests.length ? eventQuests.map(quest => <View key={quest.id} style={styles.eventQuest}>
            <Text style={styles.eventQuestKind}>{quest.kind === 'MAIN' ? '✦ MAIN QUEST' : 'SIDE QUEST'} · +{quest.xp_reward} XP</Text>
            <Text style={styles.eventQuestTitle}>{quest.title}</Text>
            <Text style={styles.eventQuestCopy}>{quest.instructions}</Text>
            {quest.my_submission ? <Text style={styles.questProofState}>✓ Completed · +{quest.xp_reward} XP</Text> : selectedEvent.quest_status === 'ACTIVE' && selectedEvent.my_attendance_status === 'ACCEPTED' ? <><Pressable accessibilityRole="button" accessibilityLabel={'Complete quest: ' + quest.title} style={[styles.questProofButton, iconLabelRow]} onPress={() => beginQuestProof(quest)}><Ionicons name="checkmark-circle-outline" size={18} color={colors.onPrimary} /><Text style={styles.questProofButtonText}>Complete quest</Text></Pressable><Text style={styles.personMeta}>Share a photo or reel to earn +{quest.xp_reward} XP.</Text></> : <Text style={styles.personMeta}>{selectedEvent.quest_status === 'EXPIRED' ? 'Quest ended' : selectedEvent.my_attendance_status !== 'ACCEPTED' ? 'Join this event to complete quests.' : 'Unlocks when the event begins.'}</Text>}
          </View>) : <Text style={styles.muted}>{selectedEvent.quest_status === 'SCHEDULED' ? 'Quests unlock when the event starts.' : 'Your quest list will appear here.'}</Text>}
        </View>
        <View style={styles.eventMoments}>
          <Text style={styles.section}>QUEST MOMENTS · {eventPosts.length}</Text>
          <Text style={styles.sheetCopy}>Snaps from people who actually showed up and did the thing. 🏆</Text>
          {eventPosts.length ? eventPosts.map(post => <PostCard onLike={post => void toggleLike(post)} key={post.id} post={post} mine={post.author.id === me?.id} onEdit={beginEditPost} onDelete={deletePost} onShare={item => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + item.id + '/')} onComments={item => void openComments(item)} onOpenProfile={setSelectedUser} />) : <Text style={styles.muted}>No snaps yet — be the first to complete a quest! 📸</Text>}
        </View>
        {selectedEvent.is_finished && selectedEvent.my_attendance_status === 'ACCEPTED' ? <View style={styles.ratingPanel}>
          <Text style={styles.ratingTitle}>RATE YOUR FELLOW GUESTS</Text>
          <Text style={styles.ratingCopy}>Only accepted attendees can be rated. Like adds 1 karma, dislike subtracts 1, and none adds 0.</Text>
          {ratingTargets.length ? ratingTargets.map(person => {
            const selectedReaction = eventRatings.find(rating => rating.target.id === person.id)?.reaction;
            return <View key={person.id} style={styles.ratingPerson}>
              <Pressable accessibilityRole="button" style={styles.ratingProfile} onPress={() => setSelectedUser(person)}><Avatar user={person} /><View style={styles.ratingPersonCopy}><Text style={styles.personName}>{nameOf(person)}</Text><Text style={styles.personMeta}>{selectedReaction ? 'Your response: ' + reactionLabel(selectedReaction) : 'Choose a response'}</Text></View></Pressable>
              <View style={styles.ratingActions}>{(['LIKE', 'DISLIKE', 'NONE'] as Reaction[]).map(reaction => <Pressable accessibilityRole="button" key={reaction} style={[styles.ratingChoice, selectedReaction === reaction && styles.ratingChoiceSelected]} onPress={() => void rateAttendee(person.id, reaction)}><Text style={[styles.ratingChoiceText, selectedReaction === reaction && styles.ratingChoiceSelectedText]}>{reactionLabel(reaction)}</Text></Pressable>)}</View>
            </View>;
          }) : <Text style={styles.ratingEmpty}>No other accepted attendees are available to rate.</Text>}
        </View> : null}
        {selectedEvent.host.id === me?.id ? <View style={styles.eventQuestList}>
          <Text style={styles.section}>HOST CONSOLE</Text>
          <View style={styles.ratingActions}><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={() => openInviteList(selectedEvent.id)}><Text style={styles.ratingChoiceText}>Invite people</Text></Pressable><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={() => openEventEditor(selectedEvent)}><Text style={styles.ratingChoiceText}>Edit event</Text></Pressable><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={deleteEvent}><Text style={styles.postDeleteText}>Delete</Text></Pressable></View>
          {eventRequests.filter(request => request.status === 'PENDING').map(request => <View key={request.id} style={styles.eventQuest}>
            <Text style={styles.personName}>{nameOf(request.user)}</Text><Text style={styles.personMeta}>{request.user.xp || 0} XP · {request.user.karma ?? 0} karma</Text>
            {!selectedEvent.is_finished ? <View style={styles.ratingActions}><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'DENIED')}><Text style={styles.ratingChoiceText}>Decline</Text></Pressable><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'ACCEPTED')}><Text style={styles.ratingChoiceText}>Accept</Text></Pressable></View> : <Text style={styles.muted}>Requests closed</Text>}
          </View>)}
        </View> : null}
        <View style={styles.eventActionRow}><Pressable accessibilityRole="button" style={[styles.eventShare, iconLabelRow]} onPress={() => void shareResource('A SocialQuest adventure', 'Join me at ' + selectedEvent.name + ' on SocialQuest.', '/?view=event&event=' + selectedEvent.id)}><Ionicons name="paper-plane-outline" size={17} color={colors.text} /><Text style={styles.eventShareText}>Share</Text></Pressable>{selectedEvent.host.id === me?.id ? <View style={styles.hostPill}><Text style={styles.hostPillText}>You are hosting</Text></View> : selectedEvent.is_finished ? <View style={styles.hostPill}><Text style={styles.hostPillText}>Requests closed</Text></View> : selectedEvent.my_attendance_status === 'INVITED' ? <View style={styles.inviteActions}><Pressable accessibilityRole="button" style={styles.ratingChoice} onPress={() => void cancelRsvp()}><Text style={styles.ratingChoiceText}>Decline</Text></Pressable><Pressable accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={join}><Text style={styles.primaryText}>Accept invite</Text></Pressable></View> : selectedEvent.my_attendance_status === 'PENDING' || selectedEvent.my_attendance_status === 'ACCEPTED' ? <Pressable accessibilityRole="button" style={styles.hostPill} onPress={() => void cancelRsvp()}><Text style={styles.hostPillText}>{selectedEvent.my_attendance_status.toLowerCase()} · cancel</Text></Pressable> : <Pressable accessibilityRole="button" style={[styles.primary, styles.eventJoin]} onPress={join}><Text style={styles.primaryText}>{selectedEvent.my_attendance_status ? 'Request again' : 'Request to join'}</Text></Pressable>}</View>
      </>}
    </EventDetailsSheet>
    <Modal visible={!!commentPost} transparent animationType="slide" onRequestClose={closeComments}>
      <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <Pressable feedback="none" style={styles.overlay} onPress={closeComments}>
          <Pressable feedback="none" style={[styles.sheet, styles.commentsSheet]} onPress={event => event.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.commentsHeader}>
              <View style={styles.commentsHeaderCopy}>
                <Text style={styles.sheetTitle}>Replies</Text>
                <Text numberOfLines={1} style={styles.commentPostPreview}>{commentPost ? nameOf(commentPost.author) + ' · ' + (commentPost.body || 'Shared a moment') : ''}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close replies" onPress={closeComments} style={styles.commentsClose}><Ionicons name="close" size={23} color={colors.text} /></Pressable>
            </View>
            <Text style={styles.sheetCopy}>{comments.length ? 'Join the conversation.' : 'Be the first to leave a thoughtful reply.'}</Text>
            <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">
              {comments.length ? rootComments.map(comment => renderCommentThread(comment)) : <View style={styles.commentEmpty}><Text style={styles.muted}>No replies yet.</Text><Text style={styles.commentEmptyCopy}>A good conversation starts with one kind thought.</Text></View>}
            </ScrollView>
            {editingComment ? <View style={styles.commentEditing}><Text style={styles.commentEditingText}>Editing your reply</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancel comment edit" onPress={() => { setEditingComment(null); setCommentBody(''); }}><Text style={styles.commentEditingCancel}>Cancel</Text></Pressable></View> : null}
            {replyingTo ? <View style={styles.commentEditing}><Text numberOfLines={1} style={styles.commentEditingText}>Replying to @{replyingTo.author.username}</Text><Pressable accessibilityRole="button" accessibilityLabel="Stop replying to this comment" onPress={clearReplyTarget}><Ionicons name="close-circle-outline" size={21} color={colors.danger} /></Pressable></View> : null}
            <View style={styles.commentComposer}>
              <Avatar user={me} />
              <TextInput accessibilityLabel={editingComment ? 'Edit your reply' : 'Write a reply'} numberOfLines={3} ref={commentInputRef} style={styles.commentInput} maxLength={500} value={commentBody} onChangeText={setCommentBody} editable={!commentSubmitting} placeholder={editingComment ? 'Edit your reply' : 'Add a reply…'} placeholderTextColor={colors.muted} multiline returnKeyType="default" blurOnSubmit={false} />
              <Pressable accessibilityRole="button" accessibilityLabel={commentSubmitting ? 'Saving reply' : editingComment ? 'Save reply' : 'Post reply'} disabled={commentSubmitting || !commentBody.trim()} onPress={() => void saveComment()} style={[styles.commentSend, (commentSubmitting || !commentBody.trim()) && styles.commentSendDisabled]}>{commentSubmitting ? <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /> : <Ionicons name={editingComment ? 'checkmark' : 'arrow-up'} size={22} color={(commentSubmitting || !commentBody.trim()) ? colors.muted : colors.onPrimary} />}</Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={!!messageOptions} transparent animationType="slide" onRequestClose={() => setMessageOptions(null)}><Pressable feedback="none" style={styles.overlay} onPress={() => setMessageOptions(null)}><Pressable feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}><Text style={styles.sheetTitle}>Message options</Text>{messageOptions && <>
      {messageOptions.sender.id === me?.id ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { setChatEditor({ kind: 'message', id: messageOptions.id, value: messageOptions.body }); setMessageOptions(null); }}><Text style={styles.secondaryText}>Edit message</Text></Pressable> : null}
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'me'); setMessageOptions(null); }}><Text style={styles.secondaryText}>Delete for me</Text></Pressable>
      {messageOptions.sender.id === me?.id ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'everyone'); setMessageOptions(null); }}><Text style={styles.postDeleteText}>Delete for everyone</Text></Pressable> : null}
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setMessageOptions(null)}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
    </>}</Pressable></Pressable></Modal>
    <Modal visible={!!chatEditor} transparent animationType="slide" onRequestClose={() => setChatEditor(null)}><Pressable feedback="none" style={styles.overlay} onPress={() => setChatEditor(null)}><Pressable feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}><View style={styles.handle} /><Text style={styles.sheetTitle}>{chatEditor?.kind === 'conversation' ? 'Name this chat.' : 'Edit your message.'}</Text><Text style={styles.sheetCopy}>{chatEditor?.kind === 'conversation' ? 'This name is visible to everyone in the chat.' : 'Your updated message will be marked as edited.'}</Text><TextInput accessibilityLabel={chatEditor?.kind === 'conversation' ? 'Chat name' : 'Message text'} style={styles.momentInput} maxLength={chatEditor?.kind === 'conversation' ? 100 : 2000} value={chatEditor?.value || ''} onChangeText={value => setChatEditor(current => current ? { ...current, value } : current)} placeholder={chatEditor?.kind === 'conversation' ? 'Chat name (optional)' : 'Write your message'} multiline={chatEditor?.kind === 'message'} autoFocus /><View style={styles.editActions}><Pressable accessibilityRole="button" style={styles.cancelEdit} onPress={() => setChatEditor(null)}><Text style={styles.cancelEditText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={() => void saveChatEditor()}><Text style={styles.primaryText}>Save changes</Text></Pressable></View></Pressable></Pressable></Modal>
    <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}><Pressable feedback="none" style={styles.overlay} onPress={() => setEditingPost(null)}><Pressable feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}><View style={styles.handle} /><Text style={styles.sheetTitle}>Edit your moment.</Text><TextInput accessibilityLabel="Post caption" style={styles.momentInput} maxLength={1200} value={editBody} onChangeText={setEditBody} placeholder="What happened?" multiline /><TextInput accessibilityLabel="Post location" style={styles.editLocation} maxLength={120} value={editLocation} onChangeText={setEditLocation} placeholder="Location (optional)" /><View style={styles.editActions}><Pressable accessibilityRole="button" style={styles.cancelEdit} onPress={() => setEditingPost(null)}><Text style={styles.cancelEditText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={savePostEdit}><Text style={styles.primaryText}>Save changes</Text></Pressable></View></Pressable></Pressable></Modal>
  </View>;
}

function Score({ label, value, onPress, tone = 'purple' }: { label: string; value: string; onPress?: () => void; tone?: Accent }) {
  const {theme} = useTheme();
  const {accents} = theme;
  const styles = getAppStyles(theme);
  const accent = accents[tone];
  const cardStyle = [styles.score, {backgroundColor: accent.surface, borderColor: accent.border}];
  const content = <><Text style={[styles.scoreValue, {color: accent.text}]}>{value}</Text><Text style={styles.scoreLabel}>{label}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={value + ' ' + label.replace(' ›', '').toLowerCase()} style={cardStyle} onPress={onPress}>{content}</Pressable> : <View style={cardStyle}>{content}</View>;
}

function SearchIcon() {
  const {theme} = useTheme();
  const {colors} = theme;
  return <Ionicons name="search-outline" size={22} color={colors.text} accessible={false} />;
}
