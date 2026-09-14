import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { File } from 'expo-file-system';
import { NavigationBar } from 'expo-navigation-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { PixelifySans_400Regular, PixelifySans_700Bold } from '@expo-google-fonts/pixelify-sans';
import { useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
type PeoplePanel = { kind: 'search' | 'followers' | 'following'; person?: User };
type EventItem = { id: number; name: string; description: string; cover_image?: string; location_name: string; starts_at: string; ends_at: string; accepted_count: number; capacity: number; host: User; my_attendance_status?: string | null; is_finished?: boolean; quest_status?: string; recommendation_reason?: string };
type CommentItem = { id: number; author: User; body: string; created_at: string };
type Post = { id: number; kind: 'POST' | 'REEL'; body: string; media?: string; location_name?: string; quest_title?: string; recommendation_reason?: string; author: User; created_at: string; like_count: number; comment_count: number; liked_by_me?: boolean; recent_comments?: CommentItem[] };
type Quest = { id: number; kind: 'MAIN' | 'SIDE'; title: string; instructions: string; xp_reward: number; my_submission?: { status: string } | null };
type Conversation = { id: number; title?: string; display_name: string; participants: User[]; latest_message?: { body: string; created_at: string; deleted_for_everyone?: boolean } };
type ChatMessage = { id: number; body: string; sender: User; created_at: string; edited_at?: string | null; deleted_for_everyone?: boolean };
type Reaction = 'LIKE' | 'DISLIKE' | 'NONE';
type RatingItem = { id: number; target: User; reaction: Reaction };
type AttendanceItem = { id: number; user: User; status: string };
type ProofItem = { id: number; quest_title: string; xp_reward: number; participant: User; media: string; media_type: string; caption: string; status: string };
type NotificationItem = { id: number; kind: 'RSVP' | 'RSVP_ACCEPTED' | 'RSVP_DENIED' | 'MESSAGE' | 'EVENT_ENDED'; text: string; event?: { id: number; name: string } | null; conversation_id?: number | null; created_at: string; is_read: boolean };

const rows = <T,>(data: T[] | { results?: T[] } | null | undefined): T[] => Array.isArray(data) ? data : data?.results || [];
const nameOf = (user?: User | null) => user?.display_name || user?.username || 'SocialQuest member';
const initial = (user?: User | null) => nameOf(user).trim().slice(0, 1).toUpperCase();
const dateOf = (date: string) => new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const reactionLabel = (reaction: Reaction) => reaction === 'LIKE' ? '♥ Like' : reaction === 'DISLIKE' ? '× Dislike' : '— None';
const chatEmojis = ['😊', '😂', '❤️', '👍', '🎉', '✨', '👋', '🙌'];
const PIXEL_FONT = 'PressStart2P_400Regular';
const COPY_FONT = 'PixelifySans_400Regular';
const COPY_FONT_BOLD = 'PixelifySans_700Bold';
let activeStyles: any;

function Avatar({ user, large = false }: { user?: User | null; large?: boolean }) {
  const styles = activeStyles;
  return user?.avatar
    ? <Image style={[styles.avatar, large && styles.avatarLarge]} source={{ uri: user.avatar }} />
    : <View style={[styles.avatar, large && styles.avatarLarge]}><Text style={[styles.avatarText, large && styles.avatarLargeText]}>{initial(user)}</Text></View>;
}

function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  const styles = activeStyles;
  return <View style={styles.empty}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

function PostCard({ post, onLike, mine, onEdit, onDelete, onShare, onComments, onOpenProfile }: { post: Post; onLike: (post: Post) => void; mine: boolean; onEdit: (post: Post) => void; onDelete: (post: Post) => void; onShare: (post: Post) => void; onComments: (post: Post) => void; onOpenProfile: (user: User) => void }) {
  const styles = activeStyles;
  return <View style={styles.post}><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(post.author) + "'s profile"} style={styles.postHead} onPress={() => onOpenProfile(post.author)}><Avatar user={post.author} /><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.personName}>{nameOf(post.author)}</Text><Text style={styles.personMeta}>@{post.author.username}{post.location_name ? ' · ' + post.location_name : ''}</Text></View></Pressable>{post.recommendation_reason ? <Text style={styles.recommendationTag}>For you · {post.recommendation_reason}</Text> : null}{post.quest_title ? <Text style={styles.questPostTag}>✦ Quest proof · {post.quest_title}</Text> : null}{post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}{post.media ? post.kind === 'POST' ? <Image style={styles.postImage} source={{ uri: post.media }} /> : <ReelVideo uri={post.media} /> : null}<View style={styles.postFooter}><Pressable accessibilityRole="button" accessibilityLabel={post.liked_by_me ? "Unlike post" : "Like post"} onPress={() => onLike(post)}><Text style={[styles.postManageText, post.liked_by_me && { color: "#ff68b4" }]}>♥ {post.like_count}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open comments" onPress={() => onComments(post)}><Text style={styles.postManageText}>◌ {post.comment_count} replies</Text></Pressable><Pressable onPress={() => onShare(post)}><Text style={styles.postManageText}>↗ Share</Text></Pressable>{mine ? <View style={styles.postManage}><Pressable onPress={() => onEdit(post)}><Text style={styles.postManageText}>Edit</Text></Pressable><Pressable onPress={() => onDelete(post)}><Text style={styles.postDeleteText}>Delete</Text></Pressable></View> : null}</View></View>;
}

function ReelVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: 230, backgroundColor: '#050916' }} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, PixelifySans_400Regular, PixelifySans_700Bold });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#071022' }} />;
  return <SafeAreaProvider><NavigationBar style="light" /><SocialQuestApp /></SafeAreaProvider>;
}

function SocialQuestApp() {
  const insets = useSafeAreaInsets();
  const darkMode = true;
  const styles = darkStyles;
  activeStyles = styles;
  const [token, setToken] = useState('');
  const [me, setMe] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('Home');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const uploadInFlight = useRef(false);
  const likeInFlight = useRef(new Set<number>());
  const sessionToken = useRef(token);
  sessionToken.current = token;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hostedEvents, setHostedEvents] = useState<EventItem[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<EventItem[]>([]);
  const [eventRequests, setEventRequests] = useState<AttendanceItem[]>([]);
  const [eventProofs, setEventProofs] = useState<ProofItem[]>([]);
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const activeChatId = useRef<number | null>(null);
  activeChatId.current = activeChat?.id || null;
  const [message, setMessage] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [chatEditor, setChatEditor] = useState<{ kind: 'conversation' | 'message'; id: number; value: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [eventQuests, setEventQuests] = useState<Quest[]>([]);
  const [eventPosts, setEventPosts] = useState<Post[]>([]);
  const [ratingTargets, setRatingTargets] = useState<User[]>([]);
  const [eventRatings, setEventRatings] = useState<RatingItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [moment, setMoment] = useState('');
  const [momentMedia, setMomentMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [momentLocation, setMomentLocation] = useState('');
  const [proofQuest, setProofQuest] = useState<Quest | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);

  const api = async (path: string, options: any = {}, authToken = token): Promise<any> => {
    const headers: any = { ...(authToken ? { Authorization: 'Token ' + authToken } : {}), ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(API_URL + path, { ...options, headers });
    } catch (_) {
      const help = API_URL.includes('YOUR_LAN_IP')
        ? 'Mobile API is not configured. Start Expo with EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000/api.'
        : 'Could not reach ' + API_URL + '. Start Django with python manage.py runserver 0.0.0.0:8000 and keep the phone on the same Wi-Fi.';
      throw new Error(help);
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (authToken && sessionToken.current !== authToken) throw new Error('Session changed.');
    if (response.status === 401 && authToken) {
      sessionToken.current = ''; setToken(''); setMe(null); setActiveChat(null); setMessages([]);
      setPosts([]); setReels([]); setEvents([]); setPeople([]); setFollowing([]); setConversations([]); setNotifications([]);
      setSelectedEvent(null); setSelectedUser(null); setComposeOpen(false); setCommentPost(null); setEditingPost(null); setChatEditor(null); setMessageOptions(null);
      throw new Error('Your session expired. Please log in again.');
    }
    if (!response.ok) throw new Error(data?.detail || Object.values(data || {}).flat().join(' ') || 'Something went wrong.');
    if (authToken && sessionToken.current !== authToken) throw new Error('Session changed.');
    if ((!options.method || options.method === 'GET') && Array.isArray(data?.results) && data.next) {
      const next = new URL(data.next);
      const base = new URL(API_URL);
      if (next.origin !== base.origin || !next.pathname.startsWith(base.pathname + '/')) throw new Error('Invalid pagination link.');
      const remaining = await api(next.pathname.slice(base.pathname.length) + next.search, options, authToken);
      data.results.push(...rows(remaining)); data.next = null;
    }
    return data;
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
  const loadFollowing = async () => setFollowing(rows<User>(await api('/people/following/')));
  const loadChats = async () => setConversations(rows<Conversation>(await api('/conversations/')));
  const loadMessages = async (id: number) => { const result = rows<ChatMessage>(await api('/messages/?conversation=' + id)); if (activeChatId.current === id) setMessages(result); };
  const loadNotifications = async () => setNotifications(rows<NotificationItem>(await api('/notifications/')));

  const closePeople = () => {
    peopleRequestVersion.current += 1;
    setPeoplePanel(null); setSelectedUser(null); Keyboard.dismiss();
  };
  const loadPeopleList = async (panel: PeoplePanel, search = '') => {
    const version = ++peopleRequestVersion.current;
    setPeopleLoading(true); setPeopleError('');
    try {
      const path = panel.kind === 'search' ? '/people/' : '/people/' + panel.person!.id + '/' + panel.kind + '/';
      const result = rows<User>(await api(path + '?q=' + encodeURIComponent(search.trim())));
      if (version === peopleRequestVersion.current) setPeopleResults(result.filter(person => panel.kind !== 'search' || person.id !== me?.id));
    } catch (error: any) {
      if (version === peopleRequestVersion.current) { setPeopleResults([]); setPeopleError(error.message); }
    } finally { if (version === peopleRequestVersion.current) setPeopleLoading(false); }
  };
  const openPeopleList = (kind: PeoplePanel['kind'], person?: User) => {
    const panel = {kind, person};
    setSelectedUser(null); setPeoplePanel(panel); setPeopleQuery(''); setPeopleResults([]);
    void loadPeopleList(panel);
  };

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
            body: JSON.stringify({session_id: sessionId}),
          });
        } finally { clearTimeout(timeout); }
      }).catch(() => {});
    };
    sendPresence(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => sendPresence(state === 'active'));
    const timer = setInterval(() => { if (AppState.currentState === 'active') sendPresence(true); }, 20000);
    return () => { clearInterval(timer); subscription.remove(); sendPresence(false); };
  }, [token]);
  useEffect(() => {
    if (!token || tab !== 'Chats' || !appActive) return;
    let cancelled = false;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const chats = rows<Conversation>(await api('/conversations/', {signal: controller.signal}));
        if (!cancelled) {
          setConversations(chats);
          setActiveChat(current => current ? chats.find(chat => chat.id === current.id) || current : null);
        }
      } catch (_) {
        if (!cancelled) {
          const offline = (chat: Conversation) => ({...chat, participants: chat.participants.map(person => ({...person, is_online: false}))});
          setConversations(current => current.map(offline));
          setActiveChat(current => current ? offline(current) : null);
        }
      } finally { clearTimeout(timeout); pending = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token, tab, appActive]);

  useEffect(() => {
    if (token) return;
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

  const refresh = async (task: () => Promise<unknown>) => { setRefreshing(true); try { await task(); } catch (error: any) { Alert.alert('Could not refresh', error.message); } finally { setRefreshing(false); } };

  useEffect(() => {
    if (!token) return;
    void Promise.all([loadMe(), loadDiscover(), loadFeed(), loadChats(), loadNotifications(), loadFollowing()]).catch(error => Alert.alert('Could not load your account', error.message));
  }, [token]);
  useEffect(() => {
    if (!activeChat || !token || tab !== 'Chats') return;
    setMessages([]);
    void loadMessages(activeChat.id).catch(error => Alert.alert('Could not load chat', error.message));
    const timer = setInterval(() => void loadMessages(activeChat.id).catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [activeChat?.id, token, tab]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void loadNotifications().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [token]);

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

  const logout = async () => {
    try { await api('/auth/logout/', { method: 'POST' }); } catch (_) {}
    sessionToken.current = '';
    setToken('');
    setMe(null);
    setPosts([]); setReels([]); setEvents([]); setPeople([]); setFollowing([]); setConversations([]); setNotifications([]);
    setHostedEvents([]); setJoinedEvents([]); setEventRequests([]); setEventProofs([]); setMessageOptions(null); setChatEditor(null);
    setSelectedEvent(null); setSelectedUser(null); setComposeOpen(false); setCommentPost(null); setEditingPost(null); setProofQuest(null); setMoment(''); setMomentMedia(null);
    setActiveChat(null);
    setMessages([]);
    setTab('Home');
  };

  const search = async () => {
    try { setNearbyActive(false); await loadDiscover(query.trim()); } catch (error: any) { Alert.alert('Search unavailable', error.message); }
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
      setNearbyActive(true);
      setTab('Explore');
    } catch (error: any) { Alert.alert('Nearby events unavailable', error.message || 'We could not check events near you.'); }
  };

  const send = async () => {
    if (!activeChat || !message.trim() || sendInFlight.current) return;
    sendInFlight.current = true;
    const body = message.trim();
    setMessage('');
    setEmojiPickerOpen(false);
    try {
      await api('/messages/', { method: 'POST', body: JSON.stringify({ conversation: activeChat.id, body }) });
      await Promise.all([loadMessages(activeChat.id), loadChats()]);
    } catch (error: any) {
      setMessage(current => current || body);
      Alert.alert('Message not sent', error.message);
    } finally { sendInFlight.current = false; }
  };

  const showChatOptions = () => {
    if (!activeChat) return;
    Alert.alert('Chat options', 'A chat name is shared with the other participant. Removing a chat only clears it from your inbox.', [
      { text: 'Edit chat name', onPress: () => setChatEditor({ kind: 'conversation', id: activeChat.id, value: activeChat.title || '' }) },
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
      Alert.alert('Request sent', 'The host can now review your public XP and karma.');
      const updated = await api('/events/' + selectedEvent.id + '/');
      setSelectedEvent(updated);
      await loadDiscover(query.trim());
    } catch (error: any) { Alert.alert('Could not request entry', error.message); }
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
      setEventRequests([]); setEventProofs([]);
      if (event.host.id === me?.id) {
        const [requests, proofs] = await Promise.all([api('/events/' + eventId + '/requests/'), api('/events/' + eventId + '/submissions/')]);
        setEventRequests(rows<AttendanceItem>(requests)); setEventProofs(rows<ProofItem>(proofs));
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

  const reviewEventItem = async (id: number, decision: string, proof = false) => {
    if (!selectedEvent) return;
    try {
      await api(proof ? '/submissions/' + id + '/review/' : '/events/' + selectedEvent.id + '/review-request/', { method: 'POST', body: JSON.stringify(proof ? { decision } : { attendance_id: id, decision }) });
      await openEvent(selectedEvent.id);
    } catch (error: any) { Alert.alert('Could not save review', error.message); }
  };

  const beginQuestProof = (quest: Quest) => {
    setProofQuest(quest);
    setMoment('');
    setMomentMedia(null);
    setMomentLocation('');
    setComposeOpen(true);
  };

  const rateAttendee = async (targetId: number, reaction: Reaction) => {
    if (!selectedEvent) return;
    try {
      const rating = await api('/ratings/', { method: 'POST', body: JSON.stringify({ event: selectedEvent.id, target_id: targetId, reaction }) });
      setEventRatings(current => [...current.filter(item => item.target.id !== targetId), rating]);
    } catch (error: any) { Alert.alert('Could not save rating', error.message); }
  };

  const openNotification = async (notification: NotificationItem) => {
    try {
      if (notification.event) {
        await openEvent(notification.event.id);
        setTab('Explore');
      } else if (notification.conversation_id) {
        const chats = await api('/conversations/');
        const conversation = rows<Conversation>(chats).find(item => item.id === notification.conversation_id);
        if (conversation) {
          setActiveChat(conversation);
          setTab('Chats');
        }
      }
    } catch (error: any) { Alert.alert('Could not open notification', error.message); }
  };
  const markNotificationsRead = async () => {
    const unreadIds = notifications.filter(item => !item.is_read).map(item => item.id);
    if (!unreadIds.length) return;
    try {
      await api('/notifications/mark-read/', { method: 'POST', body: JSON.stringify({ ids: unreadIds }) });
      setNotifications(current => current.map(item => ({ ...item, is_read: true })));
    } catch (_) {}
  };

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photos are off', 'Allow photo access to attach an image to this post.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsEditing: false, quality: 0.82 });
    if (!result.canceled) setMomentMedia(result.assets[0]);
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera is off', 'Allow camera access to take a photo for this post.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.82 });
    if (!result.canceled) setMomentMedia(result.assets[0]);
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
    if (proofQuest && !momentMedia) return Alert.alert('Add quest proof', 'Attach a photo or reel to complete this quest.');
    if (!proofQuest && !moment.trim() && !momentMedia) return Alert.alert('Add a moment', 'Write a few words or attach a photo before posting.');
    if (momentMedia?.fileSize && momentMedia.fileSize > 50 * 1024 * 1024) return Alert.alert('File too large', 'Choose a photo or video smaller than 50 MB.');
    uploadInFlight.current = true; setBusy(true);
    try {
      const data = new FormData();
      if (proofQuest) {
        data.append('quest', String(proofQuest.id));
        data.append('caption', moment.trim());
        data.append('media_type', momentMedia?.type === 'video' ? 'REEL' : 'IMAGE');
      } else {
        data.append('kind', momentMedia?.type === 'video' ? 'REEL' : 'POST');
        data.append('body', moment.trim());
        if (momentLocation) data.append('location_name', momentLocation);
      }
      if (momentMedia) data.append('media', new File(momentMedia.uri));
      await api(proofQuest ? '/submissions/' : '/posts/', { method: 'POST', body: data });
      setMoment('');
      setMomentMedia(null);
      setMomentLocation('');
      const refreshEventId = proofQuest && selectedEvent?.id;
      setProofQuest(null);
      setComposeOpen(false);
      if (refreshEventId) await openEvent(refreshEventId);
      else await loadFeed();
    } catch (error: any) { Alert.alert(proofQuest ? 'Could not share quest proof' : 'Could not share moment', error.message); } finally { uploadInFlight.current = false; setBusy(false); }
  };

  const toggleLike = async (post: Post) => {
    if (likeInFlight.current.has(post.id)) return;
    likeInFlight.current.add(post.id);
    try {
      const result = await api('/posts/' + post.id + '/like/', { method: post.liked_by_me ? 'DELETE' : 'POST' });
      const update = (item: Post) => item.id === post.id ? { ...item, liked_by_me: result.liked, like_count: result.like_count } : item;
      setPosts(current => current.map(update)); setReels(current => current.map(update)); setEventPosts(current => current.map(update));
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
      await loadFeed();
      if (selectedEvent) await openEvent(selectedEvent.id);
    } catch (error: any) { Alert.alert('Could not save post', error.message); }
  };
  const deletePost = (post: Post) => {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/posts/' + post.id + '/', { method: 'DELETE' }).then(async () => { await loadFeed(); if (selectedEvent) await openEvent(selectedEvent.id); }).catch((error: any) => Alert.alert('Could not delete post', error.message)) },
    ]);
  };
  const loadComments = async (postId: number) => setComments(rows<CommentItem>(await api('/comments/?post=' + postId)));
  const openComments = async (post: Post) => {
    setCommentPost(post);
    setComments(post.recent_comments || []);
    setCommentBody('');
    setEditingComment(null);
    try { await loadComments(post.id); } catch (error: any) { Alert.alert('Could not load comments', error.message); }
  };
  const updateCommentCount = (postId: number, change: number) => {
    const adjust = (post: Post) => post.id === postId ? { ...post, comment_count: Math.max(0, post.comment_count + change) } : post;
    setPosts(current => current.map(adjust));
    setEventPosts(current => current.map(adjust));
    setCommentPost(current => current?.id === postId ? adjust(current) : current);
  };
  const saveComment = async () => {
    const body = commentBody.trim();
    if (!commentPost || !body) return;
    try {
      const isNewComment = !editingComment;
      if (editingComment) await api('/comments/' + editingComment.id + '/', { method: 'PATCH', body: JSON.stringify({ body }) });
      else await api('/comments/', { method: 'POST', body: JSON.stringify({ post: commentPost.id, body }) });
      setCommentBody('');
      setEditingComment(null);
      if (isNewComment) updateCommentCount(commentPost.id, 1);
      await loadComments(commentPost.id);
    } catch (error: any) { Alert.alert('Could not save comment', error.message); }
  };
  const showCommentOptions = (comment: CommentItem) => {
    if (comment.author.id !== me?.id) return;
    Alert.alert('Your comment', 'Edit it or delete it permanently.', [
      { text: 'Edit', onPress: () => { setEditingComment(comment); setCommentBody(comment.body); } },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/comments/' + comment.id + '/', { method: 'DELETE' }).then(() => { if (commentPost) { setComments(current => current.filter(item => item.id !== comment.id)); updateCommentCount(commentPost.id, -1); } }).catch((error: any) => Alert.alert('Could not delete comment', error.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!token) {
    return <View style={styles.auth}>
      <StatusBar style="light" />
      <View style={[styles.authArt, { paddingTop: insets.top + 24 }]}>
        <View pointerEvents="none" style={styles.authGrid}>{Array.from({ length: 18 }, (_, index) => <View key={'row-' + index} style={[styles.authGridRow, { top: index * 16 }]} />)}{Array.from({ length: 16 }, (_, index) => <View key={'column-' + index} style={[styles.authGridColumn, { left: index * 24 }]} />)}</View>
        <View pointerEvents="none" style={styles.authGlow} /><View pointerEvents="none" style={styles.authOrbitLarge} /><View pointerEvents="none" style={styles.authOrbitSmall} />
        <View style={styles.authArtContent}><View style={styles.authWordmark}><View style={styles.bigMark}><Text style={styles.markText}>S</Text></View><Text style={styles.authWordBrand}>SocialQuest</Text></View><Text style={styles.authKicker}>REAL WORLD · REAL PEOPLE</Text><Text style={styles.authDisplayTitle}>Social{`\n`}<Text style={styles.authDisplayTitleAccent}>Quest.</Text></Text><Text style={styles.authSword}>⚔</Text></View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authForm}>
        <ScrollView contentContainerStyle={[styles.authContent, { paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{mode === 'login' ? 'WELCOME IN' : 'START YOUR STORY'}</Text>
          <Text style={styles.authTitle}>{mode === 'login' ? 'Find your people.' : 'Start your story.'}</Text>
          <Text style={styles.authDescription}>{mode === 'login' ? 'Log in and see what your community is up to.' : 'A few details and you are ready for your first quest.'}</Text>
          {mode === 'register' && <><Text style={styles.authLabel}>DISPLAY NAME</Text><TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="What should people call you?" placeholderTextColor="#8491ad" autoCapitalize="words" /></>}
          <Text style={styles.authLabel}>USERNAME</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="your_username" placeholderTextColor="#8491ad" autoCapitalize="none" />
          {mode === 'register' && <><Text style={styles.authLabel}>EMAIL</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#8491ad" keyboardType="email-address" autoCapitalize="none" /></>}
          <Text style={styles.authLabel}>PASSWORD</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#8491ad" secureTextEntry autoCapitalize="none" onSubmitEditing={authenticate} />
          <Pressable style={[styles.primary, busy && styles.dim]} onPress={authenticate} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in →' : 'Create my account →'}</Text></Pressable>
          <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}><Text style={styles.switchText}>{mode === 'login' ? 'New here?  Create an account' : 'Already a member?  Log in'}</Text></Pressable>
          <Text style={styles.authNote}>By continuing, you agree to build a kind, consent-first community.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>;
  }

  const home = <FlatList data={posts} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadFeed)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><View style={socialStyles.homeHeading}><Text style={styles.eyebrow}>YOUR NEXT ADVENTURE</Text><Pressable accessibilityRole="button" accessibilityLabel="Search people" style={socialStyles.searchIconButton} onPress={() => openPeopleList('search')}><SearchIcon /></Pressable></View><Text style={styles.homeGreeting}>Hello,</Text><Text style={styles.title}>{nameOf(me)} <Text style={styles.homeSpark}>✦</Text></Text><View style={styles.questFilters}><Pressable style={[styles.questFilter, styles.questFilterActive]} onPress={() => void refresh(loadFeed)}><Text style={[styles.questFilterText, styles.questFilterTextActive]}>For you</Text></Pressable><Pressable style={styles.questFilter} onPress={() => void findNearbyEvents()}><Text style={styles.questFilterText}>Nearby</Text></Pressable><Pressable style={styles.questFilter} onPress={() => setTab('Reels')}><Text style={styles.questFilterText}>Reels</Text></Pressable></View><View style={styles.questSectionHeader}><Text style={styles.questSectionTitle}>Recommended quests</Text><Pressable onPress={() => setTab('Explore')}><Text style={styles.questSeeAll}>See all</Text></Pressable></View><View style={styles.mobileQuestDeck}>{events.slice(0, 2).map((event, index) => <Pressable key={event.id} style={styles.mobileQuestCard} onPress={() => void openEvent(event.id)}><View style={[styles.mobileQuestArt, index % 2 ? styles.mobileQuestArtAlt : null]}>{event.cover_image ? <Image style={styles.mobileQuestCover} source={{ uri: event.cover_image }} /> : <Text style={styles.mobileQuestIcon}>✦</Text>}<Text style={styles.mobileQuestDate}>{dateOf(event.starts_at).toUpperCase()}</Text><Text style={styles.mobileQuestStatus}>{event.quest_status === 'ACTIVE' ? 'LIVE NOW' : 'QUEST READY'}</Text></View><View style={styles.mobileQuestCopy}><Text numberOfLines={1} style={styles.mobileQuestName}>{event.name}</Text><Text numberOfLines={1} style={styles.mobileQuestMeta}>{event.location_name} · {event.accepted_count}/{event.capacity} joined</Text><Text style={styles.mobileQuestXp}>{event.accepted_count}/{event.capacity} going</Text></View></Pressable>)}</View><Pressable style={styles.homeComposer} onPress={() => { setProofQuest(null); setComposeOpen(true); }}><Avatar user={me} /><View style={styles.homeComposerCopy}><Text style={styles.homeComposerPrompt}>What happened on your quest today?</Text><Text style={styles.homeComposerAction}>＋ Add photo / reel     Share a moment</Text></View></Pressable></View>} ListEmptyComponent={<Empty icon="✦" title="Your feed is ready." body="Share a moment from your next adventure." />} renderItem={({ item }) => <PostCard onLike={post => void toggleLike(post)} post={item} mine={item.author.id === me?.id} onEdit={beginEditPost} onDelete={deletePost} onShare={post => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + post.id + '/')} onComments={post => void openComments(post)} onOpenProfile={setSelectedUser} />} />;
  const explore = <FlatList data={events} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(() => loadDiscover(query.trim()))} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>MAKE A PLAN</Text><Text style={styles.title}>Find your next <Text style={styles.serif}>story.</Text></Text><Text style={styles.copy}>Search events, places, hosts, and people.</Text><Pressable style={[styles.nearbyButton, nearbyActive && styles.nearbyButtonActive]} onPress={() => void findNearbyEvents()}><Text style={[styles.nearbyButtonText, nearbyActive && styles.nearbyButtonTextActive]}>⌖ {nearbyActive ? 'Showing events near you' : 'Find events near me'}</Text></Pressable><View style={styles.searchRow}><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search events or people" returnKeyType="search" onSubmitEditing={search} /><Pressable style={styles.searchButton} onPress={search}><Text style={styles.searchText}>Search</Text></Pressable></View>{query.trim() ? <View style={styles.matches}><Text style={styles.section}>PEOPLE · {people.length}</Text>{people.length ? people.map(person => <Pressable key={person.id} style={styles.personCard} onPress={() => setSelectedUser(person)}><Avatar user={person} /><View><Text style={styles.personName}>{nameOf(person)}</Text><Text style={styles.personMeta}>@{person.username} · ★ {person.karma ?? 0} · {person.xp || 0} XP</Text></View></Pressable>) : <Text style={styles.muted}>No matching people.</Text>}</View> : null}</View>} ListEmptyComponent={<Empty icon="⌖" title="No matching events." body="Try a place, event name, or host." />} renderItem={({ item }) => <View style={styles.eventCard}><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + item.name} onPress={() => void openEvent(item.id)}><View style={styles.eventArt}><Text style={styles.eventDate}>{dateOf(item.starts_at).toUpperCase()}</Text><Text style={styles.eventIcon}>✦</Text><Text style={styles.eventBadge}>{item.quest_status === 'ACTIVE' ? 'QUEST LIVE' : 'QUEST READY'}</Text></View><View style={styles.eventText}><Text style={styles.eventName}>{item.name}</Text><Text style={styles.eventMeta}>{item.location_name} · {item.accepted_count}/{item.capacity} going</Text>{item.recommendation_reason ? <Text style={styles.eventRecommendation}>For you · {item.recommendation_reason}</Text> : null}</View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.host) + "'s profile"} style={styles.eventHostLink} onPress={() => setSelectedUser(item.host)}><Text style={[styles.hostMeta, styles.eventHostLinkText]}>Hosted by {nameOf(item.host)} · ★ {item.host.karma ?? 0}</Text></Pressable></View>} />;
  const reelsView = <FlatList data={reels} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadFeed)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>SMALL MOMENTS, ON REPEAT</Text><Text style={styles.title}>Quest <Text style={styles.serif}>reels.</Text></Text><Text style={styles.copy}>Keep the good moments moving.</Text></View>} ListEmptyComponent={<Empty icon="◉" title="No reels yet." body="The next great moment could be yours." />} renderItem={({ item, index }) => <View style={[styles.reel, { height: 'auto', minHeight: 300 }, index % 2 ? styles.reelBlue : styles.reelPurple]}>{item.media ? <ReelVideo uri={item.media} /> : <Text style={styles.reelIcon}>◉</Text>}<Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.author) + "'s profile"} onPress={() => setSelectedUser(item.author)}><Text style={styles.reelAuthor}>{nameOf(item.author)}</Text></Pressable><Text style={styles.reelBody}>{item.body || 'A moment worth keeping.'}</Text><Pressable style={styles.reelShare} onPress={() => void shareResource('A SocialQuest reel', 'Come see this community reel on SocialQuest.', '/s/post/' + item.id + '/')}><Text style={styles.reelShareText}>↗ Share</Text></Pressable></View>} />;
  const activeChatPerson = activeChat?.participants.find(person => person.id !== me?.id);
  const chats = activeChat ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={styles.chatScreen}><View style={styles.chatHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" style={styles.chatBackButton} onPress={() => { setEmojiPickerOpen(false); Keyboard.dismiss(); setActiveChat(null); }}><Text style={styles.back}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(activeChatPerson) + "'s profile"} style={styles.chatPerson} onPress={() => activeChatPerson && setSelectedUser(activeChatPerson)}><Avatar user={activeChatPerson} /><View style={styles.chatIdentity}><Text style={styles.chatTitle}>{activeChat.display_name}</Text><Text style={styles.chatSubtitle}>Direct conversation</Text></View></Pressable>{appActive && activeChatPerson?.is_online ? <Text style={socialStyles.online}>● Online</Text> : null}<Pressable accessibilityRole="button" accessibilityLabel="Manage chat" style={styles.chatMenu} onPress={showChatOptions}><Text style={styles.chatMenuText}>•••</Text></Pressable></View><FlatList style={styles.messageScroller} inverted data={[...messages].reverse()} keyExtractor={item => String(item.id)} contentContainerStyle={styles.messageList} onRefresh={() => void refresh(() => loadMessages(activeChat.id))} refreshing={refreshing} ListEmptyComponent={<Empty icon="✦" title="This is a new conversation." body="A thoughtful hello is plenty." />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel="Message options" delayLongPress={300} onLongPress={() => showMessageOptions(item)} style={[styles.bubble, item.sender.id === me?.id && styles.bubbleMine]}><Text style={[styles.bubbleText, item.sender.id === me?.id && styles.bubbleMineText, item.deleted_for_everyone && styles.bubbleDeletedText]}>{item.deleted_for_everyone ? 'Message deleted' : item.body}</Text>{!item.deleted_for_everyone ? <Text style={[styles.bubbleTime, item.sender.id === me?.id && styles.bubbleMineTime]}>{item.sender.id === me?.id ? 'You · ' : ''}{new Date(item.created_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}{item.edited_at ? ' · edited' : ''}</Text> : null}</Pressable>} />{emojiPickerOpen ? <View style={styles.emojiPicker}>{chatEmojis.map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={'Add ' + emoji} style={styles.emojiChoice} onPress={() => { setMessage(current => current + emoji); setEmojiPickerOpen(false); }}><Text style={styles.emojiChoiceText}>{emoji}</Text></Pressable>)}</View> : null}<View style={styles.composer}><View style={styles.composerMark}><Text style={styles.composerMarkText}>✦</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add an emoji" style={styles.emojiTrigger} onPress={() => setEmojiPickerOpen(current => !current)}><Text style={styles.emojiTriggerText}>☺</Text></Pressable><TextInput style={styles.messageInput} value={message} onChangeText={setMessage} maxLength={2000} accessibilityLabel="Message" placeholder="Write a thoughtful message…" placeholderTextColor={darkMode ? '#bda895' : '#858695'} multiline /><Pressable accessibilityRole="button" accessibilityLabel="Hide keyboard" style={styles.keyboardDismiss} onPress={Keyboard.dismiss}><Text style={styles.keyboardDismissText}>⌄</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Send message" style={styles.send} onPress={send}><Text style={styles.sendText}>↑</Text></Pressable></View></KeyboardAvoidingView> : <FlatList data={conversations} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadChats)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>YOUR INBOX</Text><View style={styles.chatIntroTitle}><Text style={styles.title}>Messages</Text><View style={styles.chatCount}><Text style={styles.chatCountText}>{conversations.length}</Text></View></View><Text style={styles.copy}>Keep the good energy going after you meet.</Text><Text style={[styles.section, { marginTop: 22 }]}>START A NEW CHAT</Text>{following.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contacts}>{following.map(person => <Pressable key={person.id} style={styles.contact} onPress={() => void openChat(person)} onLongPress={() => setSelectedUser(person)}><Avatar user={person} /><Text numberOfLines={1} style={styles.contactName}>{nameOf(person)}</Text></Pressable>)}</ScrollView> : <Text style={styles.chatFollowHint}>Follow someone to start a chat with them.</Text>}<Text style={styles.section}>CONVERSATIONS</Text></View>} ListEmptyComponent={<Empty icon="✉" title="Your conversations will live here." body="Start with someone you met in Explore." />} renderItem={({ item }) => <Pressable style={styles.conversation} onPress={() => setActiveChat(item)} onLongPress={() => { const person = item.participants.find(person => person.id !== me?.id); if (person) setSelectedUser(person); }}><Avatar user={item.participants.find(person => person.id !== me?.id)} /><View style={styles.conversationCopy}><View style={styles.conversationTop}><Text numberOfLines={1} style={styles.personName}>{item.display_name}</Text><Text style={styles.conversationTime}>{item.latest_message ? dateOf(item.latest_message.created_at) : ''}</Text></View><Text numberOfLines={1} style={styles.personMeta}>{item.latest_message?.deleted_for_everyone ? 'Message deleted' : item.latest_message?.body || 'Start with a simple hello'}</Text>{appActive && item.participants.some(person => person.id !== me?.id && person.is_online) ? <Text style={socialStyles.online}>● Online</Text> : null}</View></Pressable>} />;
  const notificationsView = <FlatList data={notifications} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} onRefresh={() => void refresh(loadNotifications)} refreshing={refreshing} ListHeaderComponent={<View style={styles.intro}><Text style={styles.eyebrow}>STAY IN THE LOOP</Text><Text style={styles.title}>Your <Text style={styles.serif}>notifications.</Text></Text><Text style={styles.copy}>RSVP activity, host decisions, and new messages appear here.</Text><Pressable style={styles.outline} onPress={() => void markNotificationsRead()}><Text style={styles.outlineText}>Mark all read</Text></Pressable></View>} ListEmptyComponent={<Empty icon="✦" title="Nothing new yet." body="RSVP activity and messages will show up here." />} renderItem={({ item }) => <Pressable style={[styles.notificationCard, !item.is_read && styles.notificationUnread]} onPress={() => void openNotification(item)}><View style={styles.notificationIcon}><Text style={styles.personName}>{item.kind === 'MESSAGE' ? '✉' : '✦'}</Text></View><View style={styles.notificationCopy}><Text style={styles.notificationText}>{item.text}</Text><Text style={styles.personMeta}>{item.event?.name || (item.kind === 'MESSAGE' ? 'Open chat' : 'SocialQuest')} · {dateOf(item.created_at)}</Text></View></Pressable>} />;
  const profile = <ScrollView contentContainerStyle={styles.profile}><View style={styles.profileTop}><Avatar user={me} large /><View><Text style={styles.eyebrow}>YOUR ADVENTURE LOG</Text><Text style={styles.profileName}>{nameOf(me)}</Text><Text style={styles.personMeta}>@{me?.username} · {me?.city || 'Everywhere'}</Text></View></View><Text style={styles.profileBio}>{me?.bio || 'Here for the little adventures that turn into real stories.'}</Text><View style={styles.scores}><Score label="XP EARNED" value={String(me?.xp || 0)} /><Score label="KARMA" value={String(me?.karma ?? 0)} /></View><View style={socialStyles.followScores}><Score label="FOLLOWERS ›" value={String(me?.follower_count || 0)} onPress={() => me && openPeopleList('followers', me)} /><Score label="FOLLOWING ›" value={String(me?.following_count || 0)} onPress={() => me && openPeopleList('following', me)} /></View><Text style={styles.profileHelp}>XP tracks completed quests. Karma comes from fellow guests after events. Both are public and independent.</Text><Text style={[styles.section, { marginTop: 24 }]}>YOUR EVENTS</Text>{[...hostedEvents, ...joinedEvents.filter(event => !hostedEvents.some(hosted => hosted.id === event.id))].map(event => <Pressable key={event.id} style={styles.personCard} onPress={() => void openEvent(event.id)}><View style={{ flex: 1 }}><Text style={styles.personName}>{event.name}</Text><Text style={styles.personMeta}>{event.host.id === me?.id ? 'Hosting' : 'Attending'} · {dateOf(event.starts_at)} · {event.location_name}</Text></View></Pressable>)}<Pressable style={styles.secondary} onPress={() => me && void shareResource('A SocialQuest profile', 'Meet ' + nameOf(me) + ' on SocialQuest.', '/?view=profile&profile=' + me.id)}><Text style={styles.secondaryText}>↗ Share profile</Text></Pressable><Pressable style={styles.logout} onPress={logout}><Text style={styles.logoutText}>↪ Log out</Text></Pressable></ScrollView>;
  const unreadCount = notifications.filter(item => !item.is_read).length;
  const mobileTabs: Array<{ tab: Tab; label: string; icon: string }> = [
    { tab: 'Home', label: 'Home', icon: '⌂' },
    { tab: 'Explore', label: 'Events', icon: '⌖' },
    { tab: 'Chats', label: 'Chats', icon: '✉' },
    { tab: 'Notifications', label: 'Alerts', icon: '♢' },
    { tab: 'Reels', label: 'Reels', icon: '◉' },
    { tab: 'Profile', label: 'Profile', icon: '♙' },
  ];
  const view = tab === 'Home' ? home : tab === 'Explore' ? explore : tab === 'Chats' ? chats : tab === 'Notifications' ? notificationsView : tab === 'Reels' ? reelsView : profile;

  return <View style={styles.app}>
    <StatusBar style="light" />
    <View style={[styles.appHeader, { paddingTop: insets.top + 13 }]}><Pressable style={styles.brandRow} onPress={() => setTab('Home')}><View style={styles.smallMark}><Text style={styles.smallMarkText}>S</Text></View><Text style={styles.appBrand}>socialquest</Text></Pressable><View style={styles.headerRight}><Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={styles.headerAction} onPress={() => { setTab('Notifications'); void markNotificationsRead(); }}><Text style={styles.headerActionText}>♢</Text>{unreadCount ? <Text style={styles.headerNotificationBadge}>{unreadCount > 9 ? '9+' : unreadCount}</Text> : null}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Share a moment" style={styles.headerCompose} onPress={() => { setProofQuest(null); setComposeOpen(true); }}><Text style={styles.headerComposeText}>＋</Text></Pressable></View></View>
    <View style={styles.content}>{view}</View>
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>{mobileTabs.map(item => <Pressable key={item.tab} style={styles.navItem} onPress={() => { setTab(item.tab); if (item.tab !== 'Chats') setActiveChat(null); if (item.tab === 'Profile') void refresh(loadMe); if (item.tab === 'Notifications') void markNotificationsRead(); }}><View><Text style={[styles.navIcon, tab === item.tab && styles.navActive]}>{item.icon}</Text>{item.tab === 'Notifications' && unreadCount ? <Text style={styles.navBadge}>{unreadCount > 9 ? '9+' : unreadCount}</Text> : null}</View><Text numberOfLines={1} style={[styles.navLabel, tab === item.tab && styles.navActive]}>{item.label}</Text></Pressable>)}</View>

    <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setComposeOpen(false); }}>
      <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <Pressable style={styles.overlay} onPress={() => { Keyboard.dismiss(); setComposeOpen(false); }}>
        <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
          <View style={styles.handle} />
          <Pressable accessibilityRole="button" accessibilityLabel="Hide keyboard" style={styles.sheetKeyboardDismiss} onPress={Keyboard.dismiss}><Text style={styles.sheetKeyboardDismissText}>⌄ Hide keyboard</Text></Pressable>
          <Text style={styles.sheetTitle}>{proofQuest ? 'Share quest proof.' : 'Share a moment.'}</Text>
          <Text style={styles.sheetCopy}>{proofQuest ? proofQuest.title + ' · Add the photo or reel that shows you completed it. This will appear in the event’s Quest moments.' : 'A few honest words, a photo, or an optional place tag can help someone else feel less alone.'}</Text>
          <TextInput style={styles.momentInput} maxLength={proofQuest ? 280 : 1200} value={moment} onChangeText={setMoment} placeholder={proofQuest ? 'What made this moment memorable?' : 'What happened today?'} multiline />
          <View style={styles.mediaActions}>
            <Pressable style={styles.mediaAction} onPress={() => void choosePhoto()}><Text style={styles.mediaActionText}>▧ Photo / video library</Text></Pressable>
            <Pressable style={styles.mediaAction} onPress={() => void takePhoto()}><Text style={styles.mediaActionText}>◉ Camera</Text></Pressable>
            <Pressable style={styles.mediaAction} onPress={() => void tagCurrentLocation()}><Text style={styles.mediaActionText}>⌖ Tag location</Text></Pressable>
          </View>
          {momentMedia ? <View style={styles.attachment}>{momentMedia.type === 'video' ? <Text style={styles.attachmentTitle}>◉ Video</Text> : <Image style={styles.attachmentImage} source={{ uri: momentMedia.uri }} />}<View><Text style={styles.attachmentTitle}>{momentMedia.type === 'video' ? 'Video attached' : 'Photo attached'}</Text><Pressable onPress={() => setMomentMedia(null)}><Text style={styles.removeAttachment}>Remove</Text></Pressable></View></View> : null}
          {momentLocation && !proofQuest ? <View style={styles.locationTag}><Text style={styles.locationTagText}>⌖ {momentLocation}</Text><Pressable onPress={() => setMomentLocation('')}><Text style={styles.removeAttachment}>Remove</Text></Pressable></View> : null}
          <Pressable disabled={busy} style={[styles.primary, busy && styles.dim]} onPress={share}><Text style={styles.primaryText}>{proofQuest ? 'Share quest proof →' : 'Share with the community →'}</Text></Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={!!selectedUser || !!peoplePanel} transparent animationType="slide" onRequestClose={closePeople}>
      <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.overlay} onPress={closePeople}>
          <Pressable style={[styles.sheet, socialStyles.peopleSheet]} onPress={event => event.stopPropagation()}>
            <View style={socialStyles.peopleHeading}>
              {selectedUser && peoplePanel ? <Pressable accessibilityRole="button" accessibilityLabel="Back to people list" style={socialStyles.closeButton} onPress={() => { setSelectedUser(null); void loadPeopleList(peoplePanel, peopleQuery); }}><Text style={styles.secondaryText}>‹ Back</Text></Pressable> : peoplePanel?.person ? <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" style={socialStyles.closeButton} onPress={() => { const owner = peoplePanel.person!; setPeoplePanel(null); setSelectedUser(owner); }}><Text style={styles.secondaryText}>‹ Profile</Text></Pressable> : <View />}
              <Pressable accessibilityRole="button" accessibilityLabel="Close people" style={socialStyles.closeButton} onPress={closePeople}><Text style={styles.secondaryText}>Close ×</Text></Pressable>
            </View>
            {selectedUser ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Avatar user={selectedUser} large />
              <Text style={styles.sheetTitle}>{nameOf(selectedUser)}</Text>
              <Text style={styles.sheetCopy}>@{selectedUser.username} · {selectedUser.city || 'Everywhere'}</Text>
              <View style={styles.userScoreLine}><Text style={styles.personName}>★ {selectedUser.karma ?? 0} karma</Text><Text style={styles.personName}>✦ {selectedUser.xp || 0} XP</Text></View>
              <View style={socialStyles.followScores}>
                <Score label="FOLLOWERS ›" value={String(selectedUser.follower_count || 0)} onPress={() => openPeopleList('followers', selectedUser)} />
                <Score label="FOLLOWING ›" value={String(selectedUser.following_count || 0)} onPress={() => openPeopleList('following', selectedUser)} />
              </View>
              <Text style={styles.sheetCopy}>{selectedUser.bio || 'Here to turn small plans into meaningful stories.'}</Text>
              {selectedUser.id !== me?.id ? <>
                <Pressable accessibilityRole="button" disabled={followBusy} style={[styles.secondary, followBusy && styles.dim]} onPress={() => void toggleFollow(selectedUser)}><Text style={styles.secondaryText}>{followBusy ? 'Updating…' : selectedUser.is_followed_by_me ? 'Following · Unfollow' : 'Follow'}</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void openChat(selectedUser)}><Text style={styles.primaryText}>Send a message →</Text></Pressable>
              </> : null}
              <Pressable style={styles.secondary} onPress={() => void shareResource('A SocialQuest profile', 'Meet ' + nameOf(selectedUser) + ' on SocialQuest.', '/?view=profile&profile=' + selectedUser.id)}><Text style={styles.secondaryText}>↗ Share profile</Text></Pressable>
            </ScrollView> : peoplePanel ? <>
              <Text style={styles.sheetTitle}>{peoplePanel.kind === 'search' ? 'Search people' : peoplePanel.kind === 'followers' ? 'Followers' : 'Following'}</Text>
              {peoplePanel.person ? <Text style={styles.personMeta}>@{peoplePanel.person.username}</Text> : null}
              <View style={styles.searchRow}>
                <TextInput accessibilityLabel="Search people" style={styles.searchInput} value={peopleQuery} onChangeText={setPeopleQuery} placeholder="Name or username" placeholderTextColor="#aeb7cc" maxLength={100} autoCapitalize="none" autoCorrect={false} autoFocus={peoplePanel.kind === 'search'} returnKeyType="search" onSubmitEditing={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }} />
                <Pressable accessibilityRole="button" accessibilityLabel="Search" style={[styles.searchButton, {minWidth: 44, minHeight: 44}]} onPress={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }}><SearchIcon /></Pressable>
              </View>
              <FlatList style={socialStyles.peopleList} data={peopleLoading ? [] : peopleResults} keyboardShouldPersistTaps="handled" keyExtractor={person => String(person.id)} ListEmptyComponent={<View style={socialStyles.peopleEmpty}><Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{peopleLoading ? 'Loading people…' : peopleError || (peopleQuery.trim() ? 'No matching people. Try another name or username.' : peoplePanel.kind === 'followers' ? 'No followers yet.' : peoplePanel.kind === 'following' ? 'Not following anyone yet.' : 'No other members yet.')}</Text>{peopleError ? <Pressable style={styles.secondary} onPress={() => void loadPeopleList(peoplePanel, peopleQuery)}><Text style={styles.secondaryText}>Try again</Text></Pressable> : null}</View>} renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item) + "'s profile"} style={styles.personCard} onPress={() => { Keyboard.dismiss(); setSelectedUser(item); }}><Avatar user={item} /><View style={socialStyles.personCopy}><Text style={styles.personName}>{nameOf(item)}</Text><Text style={styles.personMeta}>@{item.username}{item.is_followed_by_me ? ' · Following' : ''}</Text></View><Text style={styles.secondaryText}>›</Text></Pressable>} />
            </> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={!!selectedEvent && !composeOpen && !selectedUser && !peoplePanel && !commentPost && !editingPost} transparent animationType="slide" onRequestClose={() => setSelectedEvent(null)}>
      <Pressable style={styles.overlay} onPress={() => setSelectedEvent(null)}>
        <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
          {selectedEvent && <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.handle} />
            <Text style={styles.eyebrow}>{dateOf(selectedEvent.starts_at).toUpperCase()} · {selectedEvent.location_name}</Text>
            <Text style={styles.sheetTitle}>{selectedEvent.name}</Text>
            <Text style={styles.sheetCopy}>{selectedEvent.description}</Text>
            <Pressable style={styles.eventHost} onPress={() => setSelectedUser(selectedEvent.host)}><Avatar user={selectedEvent.host} /><Text style={styles.hostMeta}>Hosted by {nameOf(selectedEvent.host)} · ★ {selectedEvent.host.karma ?? 0}</Text></Pressable>
            <View style={styles.questNotice}><Text style={styles.section}>QUEST WINDOW</Text><Text style={styles.questNoticeText}>{selectedEvent.quest_status === 'ACTIVE' ? 'Quests are live. Join the event and upload proof to earn XP.' : selectedEvent.is_finished ? 'The quest window has ended.' : 'Quests unlock when this event starts.'}</Text></View>
            <View style={styles.eventQuestList}>
              <Text style={styles.section}>THE QUEST LINE · {eventQuests.length}</Text>
              {eventQuests.length ? eventQuests.map(quest => <View key={quest.id} style={styles.eventQuest}>
                <Text style={styles.eventQuestKind}>{quest.kind === 'MAIN' ? '✦ MAIN QUEST' : 'SIDE QUEST'} · +{quest.xp_reward} XP</Text>
                <Text style={styles.eventQuestTitle}>{quest.title}</Text>
                <Text style={styles.eventQuestCopy}>{quest.instructions}</Text>
                {selectedEvent.quest_status === 'ACTIVE' && selectedEvent.my_attendance_status === 'ACCEPTED' ? quest.my_submission ? <Text style={styles.questProofState}>Proof {quest.my_submission.status.toLowerCase()}</Text> : <Pressable style={styles.questProofButton} onPress={() => beginQuestProof(quest)}><Text style={styles.questProofButtonText}>Upload proof</Text></Pressable> : null}
              </View>) : <Text style={styles.muted}>{selectedEvent.quest_status === 'SCHEDULED' ? 'Quests unlock when the event starts.' : 'Your quest list will appear here.'}</Text>}
            </View>
            <View style={styles.eventMoments}>
              <Text style={styles.section}>QUEST MOMENTS · {eventPosts.length}</Text>
              <Text style={styles.sheetCopy}>Proofs shared by people who joined this adventure.</Text>
              {eventPosts.length ? eventPosts.map(post => <PostCard onLike={post => void toggleLike(post)} key={post.id} post={post} mine={post.author.id === me?.id} onEdit={beginEditPost} onDelete={deletePost} onShare={item => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + item.id + '/')} onComments={item => void openComments(item)} onOpenProfile={setSelectedUser} />) : <Text style={styles.muted}>Quest proofs will appear here as participants complete their quests.</Text>}
            </View>
            {selectedEvent.is_finished && selectedEvent.my_attendance_status === 'ACCEPTED' ? <View style={styles.ratingPanel}>
              <Text style={styles.ratingTitle}>RATE YOUR FELLOW GUESTS</Text>
              <Text style={styles.ratingCopy}>Only accepted attendees can be rated. Like adds 1 karma, dislike subtracts 1, and none adds 0.</Text>
              {ratingTargets.length ? ratingTargets.map(person => {
                const selectedReaction = eventRatings.find(rating => rating.target.id === person.id)?.reaction;
                return <View key={person.id} style={styles.ratingPerson}>
                  <Pressable style={styles.ratingProfile} onPress={() => setSelectedUser(person)}><Avatar user={person} /><View style={styles.ratingPersonCopy}><Text style={styles.personName}>{nameOf(person)}</Text><Text style={styles.personMeta}>{selectedReaction ? 'Your response: ' + reactionLabel(selectedReaction) : 'Choose a response'}</Text></View></Pressable>
                  <View style={styles.ratingActions}>{(['LIKE', 'DISLIKE', 'NONE'] as Reaction[]).map(reaction => <Pressable key={reaction} style={[styles.ratingChoice, selectedReaction === reaction && styles.ratingChoiceSelected]} onPress={() => void rateAttendee(person.id, reaction)}><Text style={[styles.ratingChoiceText, selectedReaction === reaction && styles.ratingChoiceSelectedText]}>{reactionLabel(reaction)}</Text></Pressable>)}</View>
                </View>;
              }) : <Text style={styles.ratingEmpty}>No other accepted attendees are available to rate.</Text>}
            </View> : null}
            {selectedEvent.host.id === me?.id ? <View style={styles.eventQuestList}>
              <Text style={styles.section}>HOST CONSOLE</Text>
              {eventRequests.filter(request => request.status === 'PENDING').map(request => <View key={request.id} style={styles.eventQuest}>
                <Text style={styles.personName}>{nameOf(request.user)}</Text><Text style={styles.personMeta}>{request.user.xp || 0} XP · {request.user.karma ?? 0} karma</Text>
                {!selectedEvent.is_finished ? <View style={styles.ratingActions}><Pressable style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'DENIED')}><Text style={styles.ratingChoiceText}>Decline</Text></Pressable><Pressable style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'ACCEPTED')}><Text style={styles.ratingChoiceText}>Accept</Text></Pressable></View> : <Text style={styles.muted}>Requests closed</Text>}
              </View>)}
              <Text style={styles.section}>REVIEW QUEST PROOF</Text>
              {eventProofs.length ? eventProofs.map(proof => <View key={proof.id} style={styles.eventQuest}>
                <Text style={styles.eventQuestTitle}>{proof.quest_title}</Text><Text style={styles.personMeta}>{nameOf(proof.participant)} · {proof.xp_reward} XP</Text>
                {proof.media_type === 'REEL' ? <ReelVideo uri={proof.media} /> : <Image style={styles.postImage} source={{ uri: proof.media }} />}
                <Text style={styles.sheetCopy}>{proof.caption}</Text><Text style={styles.questProofState}>Proof {proof.status.toLowerCase()}</Text>
                {proof.status !== 'APPROVED' ? <View style={styles.ratingActions}><Pressable style={styles.ratingChoice} onPress={() => void reviewEventItem(proof.id, 'REJECTED', true)}><Text style={styles.ratingChoiceText}>Reject</Text></Pressable><Pressable style={styles.ratingChoice} onPress={() => void reviewEventItem(proof.id, 'APPROVED', true)}><Text style={styles.ratingChoiceText}>Approve</Text></Pressable></View> : null}
              </View>) : <Text style={styles.muted}>No proof submitted yet.</Text>}
            </View> : null}
            <View style={styles.eventActionRow}><Pressable style={styles.eventShare} onPress={() => void shareResource('A SocialQuest adventure', 'Join me at ' + selectedEvent.name + ' on SocialQuest.', '/?view=event&event=' + selectedEvent.id)}><Text style={styles.eventShareText}>↗ Share</Text></Pressable>{selectedEvent.host.id === me?.id ? <View style={styles.hostPill}><Text style={styles.hostPillText}>You are hosting</Text></View> : selectedEvent.my_attendance_status ? <View style={styles.hostPill}><Text style={styles.hostPillText}>{selectedEvent.my_attendance_status.toLowerCase()}</Text></View> : selectedEvent.is_finished ? <View style={styles.hostPill}><Text style={styles.hostPillText}>Requests closed</Text></View> : <Pressable style={[styles.primary, styles.eventJoin]} onPress={join}><Text style={styles.primaryText}>Request to join</Text></Pressable>}</View>
          </ScrollView>}
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={!!commentPost} transparent animationType="slide" onRequestClose={() => setCommentPost(null)}><Pressable style={styles.overlay} onPress={() => setCommentPost(null)}><Pressable style={styles.sheet} onPress={event => event.stopPropagation()}><View style={styles.handle} /><Text style={styles.sheetTitle}>Replies.</Text><Text style={styles.sheetCopy}>{commentPost?.body ? 'Keep the conversation kind and thoughtful.' : 'Leave a thoughtful reply.'}</Text><ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent} keyboardShouldPersistTaps="handled">{comments.length ? comments.map(comment => <Pressable key={comment.id} accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(comment.author) + "'s profile"} onPress={() => setSelectedUser(comment.author)} onLongPress={() => showCommentOptions(comment)} style={styles.commentCard}><Avatar user={comment.author} /><View style={styles.commentCopy}><Text style={styles.personName}>{nameOf(comment.author)}</Text><Text style={styles.commentBody}>{comment.body}</Text><Text style={styles.personMeta}>{dateOf(comment.created_at)}{comment.author.id === me?.id ? ' · hold to manage' : ''}</Text></View></Pressable>) : <Text style={styles.muted}>Be the first to reply.</Text>}</ScrollView><TextInput style={styles.commentInput} maxLength={500} value={commentBody} onChangeText={setCommentBody} placeholder={editingComment ? 'Edit your reply' : 'Add a kind reply…'} multiline /><View style={styles.editActions}>{editingComment ? <Pressable style={styles.cancelEdit} onPress={() => { setEditingComment(null); setCommentBody(''); }}><Text style={styles.cancelEditText}>Cancel edit</Text></Pressable> : null}<Pressable style={styles.primary} onPress={() => void saveComment()}><Text style={styles.primaryText}>{editingComment ? 'Save reply' : 'Reply'}</Text></Pressable></View></Pressable></Pressable></Modal>
    <Modal visible={!!messageOptions} transparent animationType="slide" onRequestClose={() => setMessageOptions(null)}><Pressable style={styles.overlay} onPress={() => setMessageOptions(null)}><Pressable style={styles.sheet} onPress={event => event.stopPropagation()}><Text style={styles.sheetTitle}>Message options</Text>{messageOptions && <>
      {messageOptions.sender.id === me?.id ? <Pressable style={styles.secondary} onPress={() => { setChatEditor({ kind: 'message', id: messageOptions.id, value: messageOptions.body }); setMessageOptions(null); }}><Text style={styles.secondaryText}>Edit message</Text></Pressable> : null}
      <Pressable style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'me'); setMessageOptions(null); }}><Text style={styles.secondaryText}>Delete for me</Text></Pressable>
      {messageOptions.sender.id === me?.id ? <Pressable style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'everyone'); setMessageOptions(null); }}><Text style={styles.postDeleteText}>Delete for everyone</Text></Pressable> : null}
      <Pressable style={styles.secondary} onPress={() => setMessageOptions(null)}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
    </>}</Pressable></Pressable></Modal>
    <Modal visible={!!chatEditor} transparent animationType="slide" onRequestClose={() => setChatEditor(null)}><Pressable style={styles.overlay} onPress={() => setChatEditor(null)}><Pressable style={styles.sheet} onPress={event => event.stopPropagation()}><View style={styles.handle} /><Text style={styles.sheetTitle}>{chatEditor?.kind === 'conversation' ? 'Name this chat.' : 'Edit your message.'}</Text><Text style={styles.sheetCopy}>{chatEditor?.kind === 'conversation' ? 'This name is visible to everyone in the chat.' : 'Your updated message will be marked as edited.'}</Text><TextInput style={styles.momentInput} maxLength={chatEditor?.kind === 'conversation' ? 100 : 2000} value={chatEditor?.value || ''} onChangeText={value => setChatEditor(current => current ? { ...current, value } : current)} placeholder={chatEditor?.kind === 'conversation' ? 'Chat name (optional)' : 'Write your message'} multiline={chatEditor?.kind === 'message'} autoFocus /><View style={styles.editActions}><Pressable style={styles.cancelEdit} onPress={() => setChatEditor(null)}><Text style={styles.cancelEditText}>Cancel</Text></Pressable><Pressable style={styles.primary} onPress={() => void saveChatEditor()}><Text style={styles.primaryText}>Save changes</Text></Pressable></View></Pressable></Pressable></Modal>
    <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}><Pressable style={styles.overlay} onPress={() => setEditingPost(null)}><Pressable style={styles.sheet} onPress={event => event.stopPropagation()}><View style={styles.handle} /><Text style={styles.sheetTitle}>Edit your moment.</Text><TextInput style={styles.momentInput} maxLength={1200} value={editBody} onChangeText={setEditBody} placeholder="What happened?" multiline /><TextInput style={styles.editLocation} maxLength={120} value={editLocation} onChangeText={setEditLocation} placeholder="Location (optional)" /><View style={styles.editActions}><Pressable style={styles.cancelEdit} onPress={() => setEditingPost(null)}><Text style={styles.cancelEditText}>Cancel</Text></Pressable><Pressable style={styles.primary} onPress={savePostEdit}><Text style={styles.primaryText}>Save changes</Text></Pressable></View></Pressable></Pressable></Modal>
  </View>;
}

function Score({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const styles = activeStyles;
  const content = <><Text style={styles.scoreValue}>{value}</Text><Text style={styles.scoreLabel}>{label}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={value + ' ' + label.replace(' ›', '').toLowerCase()} style={styles.score} onPress={onPress}>{content}</Pressable> : <View style={styles.score}>{content}</View>;
}

function SearchIcon() {
  return <View style={socialStyles.searchIcon} accessible={false}><View style={socialStyles.searchLens} /><View style={socialStyles.searchHandle} /></View>;
}

const socialStyles = StyleSheet.create({
  homeHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  searchIconButton: {minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#536c9d', backgroundColor: '#152444'},
  searchIcon: {width: 22, height: 22},
  searchLens: {width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: '#f8f5e8'},
  searchHandle: {width: 10, height: 2, backgroundColor: '#f8f5e8', transform: [{rotate: '45deg'}], position: 'absolute', left: 12, top: 16},
  online: {color: '#9cec4c', fontSize: 12, marginTop: 3},
  followScores: {flexDirection: 'row', gap: 8, marginTop: 12},
  peopleSheet: {height: '82%'},
  peopleHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  closeButton: {minHeight: 44, minWidth: 44, justifyContent: 'center'},
  peopleList: {marginTop: 16, flex: 1},
  peopleEmpty: {paddingVertical: 24},
  personCopy: {flex: 1, minWidth: 0},
});

const lightStyles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#f7f5ee' },
  auth: { flex: 1, backgroundColor: '#f7f5ee' },
  authHero: { backgroundColor: '#0a1020', minHeight: 210, padding: 28, paddingTop: 38, position: 'relative' },
  themeToggle: { borderColor: '#ffffff66', borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', right: 20, top: 20 },
  themeToggleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bigMark: { alignItems: 'center', backgroundColor: '#d8ff59', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  markText: { color: '#0a1020', fontFamily: 'Georgia', fontSize: 27, fontStyle: 'italic', fontWeight: '700' },
  authBrand: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1.8, marginTop: 13 },
  tagline: { color: '#aab2c6', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 6 },
  authForm: { flex: 1 },
  authContent: { padding: 27, paddingBottom: 50 },
  eyebrow: { color: '#ec745f', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  authTitle: { color: '#0a1020', fontSize: 37, fontWeight: '800', letterSpacing: -1.8, lineHeight: 42, marginTop: 13 },
  authDescription: { color: '#666779', fontSize: 17, lineHeight: 25, marginBottom: 15, marginTop: 11 },
  input: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, color: '#0a1020', fontSize: 17, marginTop: 10, paddingHorizontal: 14, paddingVertical: 13 },
  primary: { alignItems: 'center', backgroundColor: '#0a1020', borderRadius: 10, flex: 1, justifyContent: 'center', marginTop: 16, padding: 15 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dim: { opacity: 0.55 },
  switchText: { color: '#d65849', fontSize: 14, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  appHeader: { alignItems: 'center', backgroundColor: '#f7f5ee', borderBottomColor: '#e2dfd6', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  smallMark: { alignItems: 'center', backgroundColor: '#0a1020', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
  smallMarkText: { color: '#d8ff59', fontFamily: 'Georgia', fontSize: 19, fontStyle: 'italic', fontWeight: '700' },
  appBrand: { flexShrink: 1, color: '#0a1020', fontSize: 21, fontWeight: '800', letterSpacing: -1.1 },
  headerRight: { flexDirection: 'row', gap: 9 },
  headerTheme: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerThemeText: { color: '#0a1020', fontSize: 17 },
  headerChat: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerProfile: { alignItems: 'center', backgroundColor: '#d8ff59', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  headerProfileText: { color: '#0a1020', fontSize: 13, fontWeight: '800' },
  content: { flex: 1 },
  list: { gap: 13, padding: 19, paddingBottom: 25 },
  intro: { paddingTop: 9 },
  title: { color: '#0a1020', fontSize: 37, fontWeight: '800', letterSpacing: -1.8, lineHeight: 41, marginTop: 10 },
  serif: { fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '400' },
  copy: { color: '#686979', fontSize: 16, lineHeight: 24, marginTop: 10 },
  outline: { alignSelf: 'flex-start', borderColor: '#0a1020', borderRadius: 20, borderWidth: 1, marginTop: 16, paddingHorizontal: 14, paddingVertical: 10 },
  outlineText: { color: '#0a1020', fontSize: 14, fontWeight: '800' },
  secondary: { alignItems: 'center', borderColor: '#0a1020', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, padding: 14 },
  secondaryText: { color: '#0a1020', fontSize: 15, fontWeight: '800' },
  avatar: { alignItems: 'center', backgroundColor: '#8673e8', borderRadius: 18, height: 36, justifyContent: 'center', overflow: 'hidden', width: 36 },
  avatarLarge: { borderRadius: 32, height: 64, width: 64 },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  avatarLargeText: { fontSize: 25 },
  post: { backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 13, borderWidth: 1, padding: 14 },
  postHead: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  personName: { flexShrink: 1, color: '#0a1020', fontSize: 15, fontWeight: '800' },
  personMeta: { flexShrink: 1, color: '#747484', fontSize: 13, marginTop: 2 },
  recommendationTag: { alignSelf: 'flex-start', backgroundColor: '#e5efff', borderRadius: 12, color: '#3f5f8f', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 8, paddingVertical: 5 },
  questPostTag: { alignSelf: 'flex-start', backgroundColor: '#eff7d7', borderRadius: 12, color: '#506319', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 8, paddingVertical: 5 },
  postBody: { color: '#242635', fontSize: 17, lineHeight: 25, marginTop: 13 },
  postImage: { borderRadius: 9, height: 190, marginTop: 13, width: '100%' },
  postFooter: { flexWrap: 'wrap', borderTopColor: '#ece9e1', borderTopWidth: 1, flexDirection: 'row', gap: 20, marginTop: 14, paddingTop: 11 },
  postManage: { borderLeftColor: '#e0ddd4', borderLeftWidth: 1, flexDirection: 'row', gap: 10, marginLeft: 'auto', paddingLeft: 10 },
  postManageText: { color: '#0a1020', fontSize: 13, fontWeight: '800' },
  postDeleteText: { color: '#c74d41', fontSize: 13, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 17 },
  searchInput: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 11 },
  searchButton: { alignItems: 'center', backgroundColor: '#0a1020', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 13 },
  searchText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  matches: { marginTop: 20 },
  section: { color: '#747484', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  personCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 7, padding: 10 },
  muted: { color: '#858695', fontSize: 14 },
  eventCard: { backgroundColor: '#fff', borderColor: '#dedbd2', borderWidth: 1, overflow: 'hidden' },
  eventArt: { alignItems: 'center', backgroundColor: '#8673e8', height: 148, justifyContent: 'center' },
  eventDate: { backgroundColor: '#fff', color: '#0a1020', fontSize: 11, fontWeight: '800', left: 10, padding: 7, position: 'absolute', top: 10 },
  eventIcon: { color: '#fff', fontSize: 49 },
  eventBadge: { backgroundColor: '#d8ff59', bottom: 10, color: '#0a1020', fontSize: 9, fontWeight: '800', left: 10, padding: 7, position: 'absolute' },
  eventText: { padding: 14 },
  eventName: { color: '#0a1020', fontSize: 23, fontWeight: '800', letterSpacing: -0.8 },
  eventMeta: { color: '#686979', fontSize: 14, marginTop: 5 },
  hostMeta: { color: '#4a4b5c', fontSize: 14, fontWeight: '600', marginTop: 12 },
  eventHostLink: { borderTopColor: '#ece9e1', borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  eventHostLinkText: { marginTop: 0 },
  eventRecommendation: { color: '#3f5f8f', fontSize: 12, fontWeight: '800', marginTop: 8 },
  nearbyButton: { alignSelf: 'flex-start', borderColor: '#0a1020', borderRadius: 17, borderWidth: 1, marginTop: 16, paddingHorizontal: 12, paddingVertical: 8 },
  nearbyButtonActive: { backgroundColor: '#d8ff59', borderColor: '#d8ff59' },
  nearbyButtonText: { color: '#0a1020', fontSize: 12, fontWeight: '800' },
  nearbyButtonTextActive: { color: '#0a1020' },
  reel: { borderRadius: 15, height: 250, justifyContent: 'flex-end', padding: 17 },
  reelPurple: { backgroundColor: '#6958c1' },
  reelBlue: { backgroundColor: '#397e91' },
  reelIcon: { color: '#d8ff59', fontSize: 32, marginBottom: 'auto' },
  reelAuthor: { color: '#fff', fontSize: 15, fontWeight: '800' },
  reelBody: { color: '#eef0ff', fontSize: 16, lineHeight: 23, marginTop: 5 },
  reelShare: { alignSelf: 'flex-start', borderColor: '#ffffff88', borderRadius: 14, borderWidth: 1, marginTop: 12, paddingHorizontal: 10, paddingVertical: 7 },
  reelShareText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  contacts: { gap: 13, paddingBottom: 22 },
  chatFollowHint: { color: '#686979', fontSize: 14, lineHeight: 20, paddingBottom: 22 },
  contact: { alignItems: 'center', width: 60 },
  contactName: { color: '#383a49', fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'center', width: 60 },
  chatIntroTitle: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  chatCount: { alignItems: 'center', backgroundColor: '#d8ff59', borderRadius: 12, height: 24, justifyContent: 'center', minWidth: 24, paddingHorizontal: 7 },
  chatCountText: { color: '#0a1020', fontSize: 11, fontWeight: '900' },
  conversation: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 8, padding: 12 },
  conversationCopy: { flex: 1 },
  conversationTop: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  conversationTime: { color: '#858695', fontSize: 10, fontWeight: '700' },
  notificationCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  notificationUnread: { borderColor: '#ec745f', backgroundColor: '#fff5f2' },
  notificationIcon: { alignItems: 'center', backgroundColor: '#d8ff59', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  notificationCopy: { flex: 1 },
  notificationText: { color: '#0a1020', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  chatScreen: { flex: 1 },
  chatHeader: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e2dfd6', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 15, paddingVertical: 13 },
  chatBackButton: { alignItems: 'center', backgroundColor: '#f2efe8', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  back: { color: '#d65849', fontSize: 27, fontWeight: '500', lineHeight: 29, marginTop: -3 },
  chatPerson: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  chatIdentity: { flex: 1, minWidth: 0 },
  chatTitle: { color: '#0a1020', flex: 1, fontSize: 18, fontWeight: '800' },
  chatSubtitle: { color: '#858695', fontSize: 11, fontWeight: '700', marginTop: 2 },
  chatPresence: { color: '#5da454', fontSize: 11, paddingHorizontal: 3 },
  chatMenu: { alignItems: 'center', backgroundColor: '#f2efe8', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  chatMenuText: { color: '#0a1020', fontSize: 15, fontWeight: '900', letterSpacing: 1, marginTop: -6 },
  messageList: { backgroundColor: '#f7f5ee', flexGrow: 1, gap: 10, padding: 16, paddingTop: 20 },
  bubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 15, borderBottomLeftRadius: 4, borderWidth: 1, maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 10 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#d8ff59', borderColor: '#d8ff59', borderBottomLeftRadius: 15, borderBottomRightRadius: 4 },
  bubbleText: { color: '#0a1020', fontSize: 16, lineHeight: 23 },
  bubbleMineText: { color: '#0a1020' },
  bubbleDeletedText: { color: '#747484', fontStyle: 'italic' },
  bubbleTime: { color: '#666779', fontSize: 11, marginTop: 5 },
  bubbleMineTime: { color: '#5f4b2e' },
  composer: { alignItems: 'center', backgroundColor: '#fff', borderTopColor: '#e2dfd6', borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  composerMark: { alignItems: 'center', backgroundColor: '#fff3ef', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  composerMarkText: { color: '#d65849', fontSize: 16 },
  emojiTrigger: { alignItems: 'center', justifyContent: 'center', height: 34, width: 28 },
  emojiTriggerText: { color: '#d65849', fontSize: 20 },
  emojiPicker: { alignItems: 'center', backgroundColor: '#fff', borderTopColor: '#e2dfd6', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  emojiChoice: { alignItems: 'center', backgroundColor: '#f7f5ee', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  emojiChoiceText: { fontSize: 18 },
  messageInput: { backgroundColor: '#f7f5ee', borderColor: '#dedbd2', borderRadius: 21, borderWidth: 1, flex: 1, fontSize: 16, maxHeight: 80, paddingHorizontal: 14, paddingVertical: 10 },
  send: { alignItems: 'center', backgroundColor: '#0a1020', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  sendText: { color: '#d8ff59', fontSize: 21, fontWeight: '700' },
  profile: { padding: 21, paddingTop: 30 },
  profileTop: { flexWrap: 'wrap', alignItems: 'center', flexDirection: 'row', gap: 13 },
  profileName: { color: '#0a1020', fontSize: 28, fontWeight: '800', letterSpacing: -1.2, marginTop: 6 },
  profileBio: { color: '#4d4e5d', fontSize: 17, lineHeight: 25, marginTop: 23 },
  scores: { flexDirection: 'row', gap: 8, marginTop: 24 },
  score: { backgroundColor: '#fff', borderColor: '#dedbd2', borderWidth: 1, flex: 1, padding: 12 },
  scoreValue: { color: '#0a1020', fontSize: 25, fontWeight: '800' },
  scoreLabel: { color: '#747484', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 5 },
  profileHelp: { color: '#686979', fontSize: 15, lineHeight: 22, marginTop: 25 },
  logout: { alignItems: 'center', borderColor: '#cf5548', borderRadius: 9, borderWidth: 1, marginTop: 25, padding: 14 },
  logoutText: { color: '#c74d41', fontSize: 15, fontWeight: '800' },
  nav: { backgroundColor: '#fff', borderTopColor: '#e2dfd6', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, paddingTop: 9 },
  navItem: { alignItems: 'center', flex: 1, minWidth: 0 },
  navBadge: { backgroundColor: '#d65849', borderRadius: 8, color: '#fff', fontSize: 8, fontWeight: '800', minWidth: 15, overflow: 'hidden', paddingHorizontal: 3, position: 'absolute', right: -9, textAlign: 'center', top: -5 },
  navIcon: { color: '#898996', fontSize: 18, lineHeight: 20 },
  navLabel: { color: '#898996', fontSize: 10, fontWeight: '700', marginTop: 3 },
  navActive: { color: '#0a1020', fontWeight: '800' },
  empty: { alignItems: 'center', borderColor: '#d8d5cc', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, marginTop: 15, padding: 27 },
  emptyIcon: { color: '#8673e8', fontSize: 30 },
  emptyTitle: { color: '#0a1020', fontSize: 17, fontWeight: '800', marginTop: 7 },
  emptyBody: { color: '#747484', fontSize: 15, lineHeight: 22, marginTop: 5, textAlign: 'center' },
  overlay: { backgroundColor: '#090d1a99', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#f7f5ee', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', padding: 22, paddingBottom: 34 },
  handle: { alignSelf: 'center', backgroundColor: '#c9c6bd', borderRadius: 3, height: 4, marginBottom: 20, width: 36 },
  sheetTitle: { color: '#0a1020', fontSize: 30, fontWeight: '800', letterSpacing: -1.4, marginTop: 9 },
  sheetCopy: { color: '#686979', fontSize: 16, lineHeight: 24, marginTop: 9 },
  momentInput: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, fontSize: 17, height: 120, marginTop: 18, padding: 13, textAlignVertical: 'top' },
  commentList: { marginTop: 16, maxHeight: 280 },
  commentListContent: { gap: 9, paddingBottom: 8 },
  commentCard: { alignItems: 'flex-start', backgroundColor: '#fff', borderColor: '#e0ddd4', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  commentCopy: { flex: 1 },
  commentBody: { color: '#242635', fontSize: 15, lineHeight: 21, marginTop: 4 },
  commentInput: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, fontSize: 16, marginTop: 10, maxHeight: 180, minHeight: 96, paddingHorizontal: 13, paddingVertical: 10, textAlignVertical: 'top' },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  mediaAction: { backgroundColor: '#ece9e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  mediaActionText: { color: '#0a1020', fontSize: 13, fontWeight: '800' },
  attachment: { alignItems: 'center', backgroundColor: '#efede6', borderRadius: 10, flexDirection: 'row', gap: 10, marginTop: 12, padding: 9 },
  attachmentImage: { borderRadius: 6, height: 46, width: 46 },
  attachmentTitle: { color: '#0a1020', fontSize: 13, fontWeight: '800' },
  removeAttachment: { color: '#c74d41', fontSize: 13, fontWeight: '800', marginTop: 4 },
  locationTag: { alignItems: 'center', backgroundColor: '#eff6d0', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10 },
  locationTagText: { color: '#303620', flex: 1, fontSize: 13, fontWeight: '700' },
  editLocation: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, fontSize: 16, marginTop: 10, paddingHorizontal: 13, paddingVertical: 12 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelEdit: { alignItems: 'center', borderColor: '#0a1020', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', marginTop: 16, padding: 15 },
  cancelEditText: { color: '#0a1020', fontSize: 15, fontWeight: '800' },
  userScoreLine: { flexDirection: 'row', gap: 12, marginTop: 16 },
  eventHost: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 18 },
  questNotice: { backgroundColor: '#d8ff59', marginTop: 19, padding: 15 },
  questNoticeText: { color: '#313622', fontSize: 15, lineHeight: 22 },
  eventQuestList: { marginTop: 20 },
  eventQuest: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, marginTop: 8, padding: 13 },
  eventQuestKind: { color: '#d65849', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  eventQuestTitle: { color: '#0a1020', fontSize: 17, fontWeight: '800', marginTop: 6 },
  eventQuestCopy: { color: '#686979', fontSize: 14, lineHeight: 20, marginTop: 5 },
  questProofButton: { alignSelf: 'flex-start', backgroundColor: '#0a1020', borderRadius: 16, marginTop: 11, paddingHorizontal: 11, paddingVertical: 8 },
  questProofButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  questProofState: { alignSelf: 'flex-start', backgroundColor: '#eff7d7', borderRadius: 12, color: '#506319', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 9, paddingVertical: 6, textTransform: 'capitalize' },
  eventMoments: { gap: 9, marginTop: 22 },
  ratingPanel: { backgroundColor: '#fff', borderColor: '#dedbd2', borderRadius: 10, borderWidth: 1, marginTop: 18, padding: 14 },
  ratingTitle: { color: '#0a1020', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  ratingCopy: { color: '#686979', fontSize: 14, lineHeight: 20, marginTop: 6 },
  ratingPerson: { alignItems: 'center', borderTopColor: '#e6e3db', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 13, paddingTop: 12 },
  ratingProfile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9, minWidth: 100 },
  ratingPersonCopy: { flex: 1, minWidth: 100 },
  ratingActions: { flexDirection: 'row', gap: 5, paddingLeft: 45, width: '100%' },
  ratingChoice: { backgroundColor: '#f1efe9', borderColor: '#dedbd2', borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  ratingChoiceSelected: { backgroundColor: '#d8ff59', borderColor: '#d8ff59' },
  ratingChoiceText: { color: '#3c3c48', fontSize: 12, fontWeight: '800' },
  ratingChoiceSelectedText: { color: '#0a1020' },
  ratingEmpty: { color: '#686979', fontSize: 14, lineHeight: 20, marginTop: 12 },
  eventActionRow: { flexDirection: 'row', marginTop: 20 },
  eventShare: { alignItems: 'center', borderColor: '#0a1020', borderRadius: 9, borderWidth: 1, flex: 1, justifyContent: 'center', marginRight: 8, padding: 14 },
  eventShareText: { color: '#0a1020', fontSize: 14, fontWeight: '800' },
  eventJoin: { marginTop: 0 },
  hostPill: { alignItems: 'center', backgroundColor: '#d8ff59', borderRadius: 9, flex: 1, padding: 14 },
  hostPillText: { color: '#0a1020', fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  homeGreeting: { color: '#55576a', fontSize: 17, fontWeight: '600', marginTop: 7 },
  homeSpark: { color: '#a16cff', fontSize: 22 },
  questFilters: { flexDirection: 'row', gap: 8, marginTop: 18 },
  questFilter: { backgroundColor: '#efedf5', borderColor: '#dfdce8', borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  questFilterActive: { backgroundColor: '#7d59ec', borderColor: '#7d59ec' },
  questFilterText: { color: '#5e6072', fontSize: 11, fontWeight: '800' },
  questFilterTextActive: { color: '#fff' },
  questSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  questSectionTitle: { color: '#0a1020', fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  questSeeAll: { color: '#8b5cf6', fontSize: 11, fontWeight: '800' },
  mobileQuestDeck: { gap: 11, marginTop: 12 },
  mobileQuestCard: { backgroundColor: '#fff', borderColor: '#e1dfe8', borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  mobileQuestArt: { alignItems: 'center', backgroundColor: '#6650bd', height: 134, justifyContent: 'center' },
  mobileQuestArtAlt: { backgroundColor: '#9a4f87' },
  mobileQuestDate: { backgroundColor: '#ffffffeb', borderRadius: 5, color: '#1a1725', fontSize: 10, fontWeight: '800', left: 11, paddingHorizontal: 7, paddingVertical: 5, position: 'absolute', top: 11 },
  mobileQuestIcon: { color: '#fff', fontSize: 42 },
  mobileQuestStatus: { backgroundColor: '#a3ff64', borderRadius: 5, bottom: 11, color: '#172016', fontSize: 9, fontWeight: '900', left: 11, paddingHorizontal: 7, paddingVertical: 5, position: 'absolute' },
  mobileQuestCopy: { padding: 13 },
  mobileQuestName: { color: '#0a1020', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  mobileQuestMeta: { color: '#6f7181', fontSize: 12, marginTop: 4 },
  mobileQuestXp: { color: '#00a87b', fontSize: 11, fontWeight: '900', marginTop: 9 },
});

const darkStyles: any = {
  ...lightStyles,
  app: [lightStyles.app, { backgroundColor: '#21140f' }],
  auth: [lightStyles.auth, { backgroundColor: '#21140f' }],
  authHero: [lightStyles.authHero, { backgroundColor: '#1a0f0b' }],
  bigMark: [lightStyles.bigMark, { backgroundColor: '#e6b56b' }],
  markText: [lightStyles.markText, { color: '#2a180f' }],
  authBrand: [lightStyles.authBrand, { color: '#f8ede0' }],
  tagline: [lightStyles.tagline, { color: '#c8b3a1' }],
  authTitle: [lightStyles.authTitle, { color: '#f8ede0' }],
  authDescription: [lightStyles.authDescription, { color: '#c8b3a1' }],
  input: [lightStyles.input, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  primary: [lightStyles.primary, { backgroundColor: '#e6b56b' }],
  primaryText: [lightStyles.primaryText, { color: '#2a180f' }],
  switchText: [lightStyles.switchText, { color: '#e58a6d' }],
  appHeader: [lightStyles.appHeader, { backgroundColor: '#2b1a13', borderBottomColor: '#624536' }],
  smallMark: [lightStyles.smallMark, { backgroundColor: '#e6b56b' }],
  smallMarkText: [lightStyles.smallMarkText, { color: '#2a180f' }],
  appBrand: [lightStyles.appBrand, { color: '#f8ede0' }],
  headerTheme: [lightStyles.headerTheme, { backgroundColor: '#362218', borderColor: '#624536' }],
  headerThemeText: [lightStyles.headerThemeText, { color: '#f8ede0' }],
  headerChat: [lightStyles.headerChat, { backgroundColor: '#362218', borderColor: '#624536' }],
  headerProfile: [lightStyles.headerProfile, { backgroundColor: '#e6b56b' }],
  headerProfileText: [lightStyles.headerProfileText, { color: '#2a180f' }],
  content: [lightStyles.content, { backgroundColor: '#21140f' }],
  title: [lightStyles.title, { color: '#f8ede0' }],
  copy: [lightStyles.copy, { color: '#c8b3a1' }],
  outline: [lightStyles.outline, { borderColor: '#ead6c2' }],
  outlineText: [lightStyles.outlineText, { color: '#f8ede0' }],
  secondary: [lightStyles.secondary, { borderColor: '#ead6c2' }],
  secondaryText: [lightStyles.secondaryText, { color: '#f8ede0' }],
  avatar: [lightStyles.avatar, { backgroundColor: '#a76f55' }],
  post: [lightStyles.post, { backgroundColor: '#362218', borderColor: '#624536' }],
  personName: [lightStyles.personName, { color: '#f8ede0' }],
  personMeta: [lightStyles.personMeta, { color: '#c8b3a1' }],
  recommendationTag: [lightStyles.recommendationTag, { backgroundColor: '#413122', color: '#e6b56b' }],
  questPostTag: [lightStyles.questPostTag, { backgroundColor: '#4b3720', color: '#f1cf91' }],
  postBody: [lightStyles.postBody, { color: '#ead6c2' }],
  postFooter: [lightStyles.postFooter, { borderTopColor: '#624536' }],
  postManage: [lightStyles.postManage, { borderLeftColor: '#624536' }],
  postManageText: [lightStyles.postManageText, { color: '#f8ede0' }],
  searchInput: [lightStyles.searchInput, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  searchButton: [lightStyles.searchButton, { backgroundColor: '#e6b56b' }],
  searchText: [lightStyles.searchText, { color: '#2a180f' }],
  section: [lightStyles.section, { color: '#c8b3a1' }],
  personCard: [lightStyles.personCard, { backgroundColor: '#362218', borderColor: '#624536' }],
  muted: [lightStyles.muted, { color: '#c8b3a1' }],
  eventCard: [lightStyles.eventCard, { backgroundColor: '#362218', borderColor: '#624536' }],
  eventArt: [lightStyles.eventArt, { backgroundColor: '#5a3827' }],
  eventDate: [lightStyles.eventDate, { backgroundColor: '#f8ede0', color: '#2a180f' }],
  eventBadge: [lightStyles.eventBadge, { backgroundColor: '#e6b56b', color: '#2a180f' }],
  eventName: [lightStyles.eventName, { color: '#f8ede0' }],
  eventMeta: [lightStyles.eventMeta, { color: '#c8b3a1' }],
  hostMeta: [lightStyles.hostMeta, { color: '#ead6c2' }],
  eventHostLink: [lightStyles.eventHostLink, { borderTopColor: '#624536' }],
  eventHostLinkText: lightStyles.eventHostLinkText,
  eventRecommendation: [lightStyles.eventRecommendation, { color: '#e6b56b' }],
  nearbyButton: [lightStyles.nearbyButton, { borderColor: '#ead6c2' }],
  nearbyButtonActive: [lightStyles.nearbyButtonActive, { backgroundColor: '#e6b56b', borderColor: '#e6b56b' }],
  nearbyButtonText: [lightStyles.nearbyButtonText, { color: '#f8ede0' }],
  nearbyButtonTextActive: [lightStyles.nearbyButtonTextActive, { color: '#2a180f' }],
  reelPurple: [lightStyles.reelPurple, { backgroundColor: '#623d2c' }],
  reelBlue: [lightStyles.reelBlue, { backgroundColor: '#5b4333' }],
  reelIcon: [lightStyles.reelIcon, { color: '#e6b56b' }],
  reelBody: [lightStyles.reelBody, { color: '#f8ede0' }],
  contactName: [lightStyles.contactName, { color: '#ead6c2' }],
  chatFollowHint: [lightStyles.chatFollowHint, { color: '#c8b3a1' }],
  chatIntroTitle: lightStyles.chatIntroTitle,
  chatCount: [lightStyles.chatCount, { backgroundColor: '#e6b56b' }],
  chatCountText: [lightStyles.chatCountText, { color: '#2a180f' }],
  conversation: [lightStyles.conversation, { backgroundColor: '#362218', borderColor: '#624536' }],
  conversationCopy: lightStyles.conversationCopy,
  conversationTop: lightStyles.conversationTop,
  conversationTime: [lightStyles.conversationTime, { color: '#c8b3a1' }],
  notificationCard: [lightStyles.notificationCard, { backgroundColor: '#362218', borderColor: '#624536' }],
  notificationUnread: [lightStyles.notificationUnread, { backgroundColor: '#4d2d23', borderColor: '#e58a6d' }],
  notificationIcon: [lightStyles.notificationIcon, { backgroundColor: '#e6b56b' }],
  notificationText: [lightStyles.notificationText, { color: '#f8ede0' }],
  chatHeader: [lightStyles.chatHeader, { backgroundColor: '#362218', borderBottomColor: '#624536' }],
  chatBackButton: [lightStyles.chatBackButton, { backgroundColor: '#493126' }],
  back: [lightStyles.back, { color: '#e6b56b' }],
  chatPerson: lightStyles.chatPerson,
  chatIdentity: lightStyles.chatIdentity,
  chatTitle: [lightStyles.chatTitle, { color: '#f8ede0' }],
  chatSubtitle: [lightStyles.chatSubtitle, { color: '#c8b3a1' }],
  chatPresence: [lightStyles.chatPresence, { color: '#9ac77e' }],
  chatMenu: [lightStyles.chatMenu, { backgroundColor: '#493126' }],
  chatMenuText: [lightStyles.chatMenuText, { color: '#f8ede0' }],
  messageList: [lightStyles.messageList, { backgroundColor: '#21140f' }],
  bubble: [lightStyles.bubble, { backgroundColor: '#362218', borderColor: '#624536' }],
  bubbleMine: [lightStyles.bubbleMine, { backgroundColor: '#e6b56b', borderColor: '#e6b56b' }],
  bubbleText: [lightStyles.bubbleText, { color: '#f8ede0' }],
  bubbleMineText: [lightStyles.bubbleText, { color: '#2a180f' }],
  bubbleDeletedText: [lightStyles.bubbleDeletedText, { color: '#c8b3a1' }],
  bubbleTime: [lightStyles.bubbleTime, { color: '#c8b3a1' }],
  bubbleMineTime: [lightStyles.bubbleMineTime, { color: '#765031' }],
  composer: [lightStyles.composer, { backgroundColor: '#2b1a13', borderTopColor: '#624536' }],
  composerMark: [lightStyles.composerMark, { backgroundColor: '#493126' }],
  composerMarkText: [lightStyles.composerMarkText, { color: '#e6b56b' }],
  emojiTrigger: lightStyles.emojiTrigger,
  emojiTriggerText: [lightStyles.emojiTriggerText, { color: '#e6b56b' }],
  emojiPicker: [lightStyles.emojiPicker, { backgroundColor: '#2b1a13', borderTopColor: '#624536' }],
  emojiChoice: [lightStyles.emojiChoice, { backgroundColor: '#493126' }],
  emojiChoiceText: lightStyles.emojiChoiceText,
  messageInput: [lightStyles.messageInput, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  send: [lightStyles.send, { backgroundColor: '#e6b56b' }],
  sendText: [lightStyles.sendText, { color: '#2a180f' }],
  profileName: [lightStyles.profileName, { color: '#f8ede0' }],
  profileBio: [lightStyles.profileBio, { color: '#ead6c2' }],
  score: [lightStyles.score, { backgroundColor: '#362218', borderColor: '#624536' }],
  scoreValue: [lightStyles.scoreValue, { color: '#f8ede0' }],
  scoreLabel: [lightStyles.scoreLabel, { color: '#c8b3a1' }],
  profileHelp: [lightStyles.profileHelp, { color: '#c8b3a1' }],
  logout: [lightStyles.logout, { borderColor: '#e58a6d' }],
  logoutText: [lightStyles.logoutText, { color: '#e58a6d' }],
  nav: [lightStyles.nav, { backgroundColor: '#2b1a13', borderTopColor: '#624536' }],
  navActive: [lightStyles.navActive, { color: '#f8ede0' }],
  empty: [lightStyles.empty, { borderColor: '#765543' }],
  emptyTitle: [lightStyles.emptyTitle, { color: '#f8ede0' }],
  emptyBody: [lightStyles.emptyBody, { color: '#c8b3a1' }],
  overlay: [lightStyles.overlay, { backgroundColor: '#160c08aa' }],
  sheet: [lightStyles.sheet, { backgroundColor: '#2b1a13' }],
  handle: [lightStyles.handle, { backgroundColor: '#8a6650' }],
  sheetTitle: [lightStyles.sheetTitle, { color: '#f8ede0' }],
  sheetCopy: [lightStyles.sheetCopy, { color: '#c8b3a1' }],
  momentInput: [lightStyles.momentInput, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  commentList: lightStyles.commentList,
  commentListContent: lightStyles.commentListContent,
  commentCard: [lightStyles.commentCard, { backgroundColor: '#362218', borderColor: '#624536' }],
  commentCopy: lightStyles.commentCopy,
  commentBody: [lightStyles.commentBody, { color: '#ead6c2' }],
  commentInput: [lightStyles.commentInput, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  editLocation: [lightStyles.editLocation, { backgroundColor: '#362218', borderColor: '#624536', color: '#f8ede0' }],
  cancelEdit: [lightStyles.cancelEdit, { borderColor: '#ead6c2' }],
  cancelEditText: [lightStyles.cancelEditText, { color: '#f8ede0' }],
  mediaAction: [lightStyles.mediaAction, { backgroundColor: '#493126' }],
  mediaActionText: [lightStyles.mediaActionText, { color: '#f8ede0' }],
  attachment: [lightStyles.attachment, { backgroundColor: '#493126' }],
  attachmentTitle: [lightStyles.attachmentTitle, { color: '#f8ede0' }],
  locationTag: [lightStyles.locationTag, { backgroundColor: '#5a3c21' }],
  locationTagText: [lightStyles.locationTagText, { color: '#ffe3b3' }],
  questNotice: [lightStyles.questNotice, { backgroundColor: '#e6b56b' }],
  questNoticeText: [lightStyles.questNoticeText, { color: '#2a180f' }],
  eventQuest: [lightStyles.eventQuest, { backgroundColor: '#362218', borderColor: '#624536' }],
  eventQuestKind: [lightStyles.eventQuestKind, { color: '#e58a6d' }],
  eventQuestTitle: [lightStyles.eventQuestTitle, { color: '#f8ede0' }],
  eventQuestCopy: [lightStyles.eventQuestCopy, { color: '#c8b3a1' }],
  questProofButton: [lightStyles.questProofButton, { backgroundColor: '#e6b56b' }],
  questProofButtonText: [lightStyles.questProofButtonText, { color: '#2a180f' }],
  questProofState: [lightStyles.questProofState, { backgroundColor: '#4b3720', color: '#f1cf91' }],
  ratingPanel: [lightStyles.ratingPanel, { backgroundColor: '#362218', borderColor: '#624536' }],
  ratingTitle: [lightStyles.ratingTitle, { color: '#f8ede0' }],
  ratingCopy: [lightStyles.ratingCopy, { color: '#c8b3a1' }],
  ratingPerson: [lightStyles.ratingPerson, { borderTopColor: '#624536' }],
  ratingProfile: lightStyles.ratingProfile,
  ratingChoice: [lightStyles.ratingChoice, { backgroundColor: '#493126', borderColor: '#765543' }],
  ratingChoiceText: [lightStyles.ratingChoiceText, { color: '#ead6c2' }],
  ratingChoiceSelected: [lightStyles.ratingChoiceSelected, { backgroundColor: '#e6b56b', borderColor: '#e6b56b' }],
  ratingChoiceSelectedText: [lightStyles.ratingChoiceSelectedText, { color: '#2a180f' }],
  ratingEmpty: [lightStyles.ratingEmpty, { color: '#c8b3a1' }],
  eventShare: [lightStyles.eventShare, { borderColor: '#ead6c2' }],
  eventShareText: [lightStyles.eventShareText, { color: '#f8ede0' }],
  hostPill: [lightStyles.hostPill, { backgroundColor: '#e6b56b' }],
  hostPillText: [lightStyles.hostPillText, { color: '#2a180f' }],
};

// The app defaults to this high-contrast game/social palette.  It deliberately
// keeps the same component map as light mode, so all existing screens inherit
// the new visual language without changing their behavior.
Object.assign(darkStyles, {
  app: { flex: 1, backgroundColor: '#0a0b12' },
  auth: { flex: 1, backgroundColor: '#0a0b12' },
  authHero: { backgroundColor: '#10111b', minHeight: 235, padding: 28, paddingTop: 38, position: 'relative' },
  bigMark: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  markText: { color: '#fff', fontFamily: 'Georgia', fontSize: 29, fontStyle: 'italic', fontWeight: '700' },
  authBrand: { color: '#f8f6ff', fontSize: 35, fontWeight: '800', letterSpacing: -1.8, marginTop: 13 },
  tagline: { color: '#9da1b4', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 6 },
  authTitle: { color: '#f8f6ff', fontSize: 37, fontWeight: '800', letterSpacing: -1.8, lineHeight: 42, marginTop: 13 },
  authDescription: { color: '#a5a8b9', fontSize: 17, lineHeight: 25, marginBottom: 15, marginTop: 11 },
  input: { backgroundColor: '#181a26', borderColor: '#303346', borderRadius: 11, borderWidth: 1, color: '#f8f6ff', fontSize: 17, marginTop: 10, paddingHorizontal: 14, paddingVertical: 13 },
  primary: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 11, flex: 1, justifyContent: 'center', marginTop: 16, padding: 15 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  switchText: { color: '#d991ff', fontSize: 14, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  appHeader: { alignItems: 'center', backgroundColor: '#10111a', borderBottomColor: '#292c3c', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13 },
  smallMark: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 9, height: 29, justifyContent: 'center', width: 29 },
  smallMarkText: { color: '#fff', fontFamily: 'Georgia', fontSize: 19, fontStyle: 'italic', fontWeight: '700' },
  appBrand: { flexShrink: 1, color: '#f8f6ff', fontSize: 21, fontWeight: '800', letterSpacing: -1.1 },
  headerTheme: { alignItems: 'center', backgroundColor: '#1a1c28', borderColor: '#323546', borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerThemeText: { color: '#c99aff', fontSize: 17 },
  headerChat: { alignItems: 'center', backgroundColor: '#1a1c28', borderColor: '#323546', borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerProfile: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  headerProfileText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  content: { flex: 1, backgroundColor: '#0d0e16' },
  list: { gap: 13, padding: 19, paddingBottom: 25 },
  eyebrow: { color: '#b986ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#f8f6ff', fontSize: 37, fontWeight: '800', letterSpacing: -1.8, lineHeight: 41, marginTop: 3 },
  homeGreeting: { color: '#a5a8b9', fontSize: 17, fontWeight: '600', marginTop: 7 },
  homeSpark: { color: '#ff5ca8', fontSize: 22 },
  copy: { color: '#a5a8b9', fontSize: 16, lineHeight: 24, marginTop: 10 },
  outline: { alignSelf: 'flex-start', backgroundColor: '#191b27', borderColor: '#373a4b', borderRadius: 20, borderWidth: 1, marginTop: 17, paddingHorizontal: 14, paddingVertical: 10 },
  outlineText: { color: '#eceaff', fontSize: 14, fontWeight: '800' },
  secondary: { alignItems: 'center', backgroundColor: '#171925', borderColor: '#393c4d', borderRadius: 11, borderWidth: 1, justifyContent: 'center', marginTop: 12, padding: 14 },
  secondaryText: { color: '#eceaff', fontSize: 15, fontWeight: '800' },
  questFilters: { flexDirection: 'row', gap: 8, marginTop: 18 },
  questFilter: { backgroundColor: '#191b27', borderColor: '#333647', borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  questFilterActive: { backgroundColor: '#8b5cf6', borderColor: '#9b70ff' },
  questFilterText: { color: '#a4a7b8', fontSize: 11, fontWeight: '800' },
  questFilterTextActive: { color: '#fff' },
  questSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  questSectionTitle: { color: '#f8f6ff', fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  questSeeAll: { color: '#c28fff', fontSize: 11, fontWeight: '800' },
  mobileQuestDeck: { gap: 11, marginTop: 12 },
  mobileQuestCard: { backgroundColor: '#171925', borderColor: '#2f3243', borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  mobileQuestArt: { alignItems: 'center', backgroundColor: '#4e3a87', height: 134, justifyContent: 'center' },
  mobileQuestArtAlt: { backgroundColor: '#833f70' },
  mobileQuestDate: { backgroundColor: '#f7f5ff', borderRadius: 5, color: '#15131d', fontSize: 10, fontWeight: '800', left: 11, paddingHorizontal: 7, paddingVertical: 5, position: 'absolute', top: 11 },
  mobileQuestIcon: { color: '#fff', fontSize: 42 },
  mobileQuestStatus: { backgroundColor: '#a3ff64', borderRadius: 5, bottom: 11, color: '#172016', fontSize: 9, fontWeight: '900', left: 11, paddingHorizontal: 7, paddingVertical: 5, position: 'absolute' },
  mobileQuestCopy: { padding: 13 },
  mobileQuestName: { color: '#f8f6ff', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  mobileQuestMeta: { color: '#a4a7b8', fontSize: 12, marginTop: 4 },
  mobileQuestXp: { color: '#5be2bc', fontSize: 11, fontWeight: '900', marginTop: 9 },
  avatar: { alignItems: 'center', backgroundColor: '#8b5cf6', borderColor: '#bd92ff66', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', overflow: 'hidden', width: 36 },
  post: { backgroundColor: '#171925', borderColor: '#2c2f40', borderRadius: 15, borderWidth: 1, padding: 14 },
  personName: { flexShrink: 1, color: '#f8f6ff', fontSize: 15, fontWeight: '800' }, personMeta: { flexShrink: 1, color: '#a2a5b6', fontSize: 13, marginTop: 2 },
  recommendationTag: { alignSelf: 'flex-start', backgroundColor: '#20243b', borderRadius: 12, color: '#7de5c3', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 8, paddingVertical: 5 }, questPostTag: { alignSelf: 'flex-start', backgroundColor: '#302647', borderRadius: 12, color: '#caa5ff', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 8, paddingVertical: 5 }, postBody: { color: '#e9e8f1', fontSize: 17, lineHeight: 25, marginTop: 13 }, postFooter: { flexWrap: 'wrap', borderTopColor: '#2d3040', borderTopWidth: 1, flexDirection: 'row', gap: 20, marginTop: 14, paddingTop: 11 }, postManage: { borderLeftColor: '#343746', borderLeftWidth: 1, flexDirection: 'row', gap: 10, marginLeft: 'auto', paddingLeft: 10 }, postManageText: { color: '#cfcbdf', fontSize: 13, fontWeight: '800' }, postDeleteText: { color: '#ff74aa', fontSize: 13, fontWeight: '800' },
  searchInput: { backgroundColor: '#171925', borderColor: '#303344', borderRadius: 11, borderWidth: 1, color: '#f8f6ff', flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 11 }, searchButton: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 11, justifyContent: 'center', paddingHorizontal: 13 }, searchText: { color: '#fff', fontSize: 14, fontWeight: '800' }, section: { color: '#a5a8b9', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }, muted: { color: '#9ca0b1', fontSize: 14 },
  eventCard: { backgroundColor: '#171925', borderColor: '#2c2f40', borderRadius: 15, borderWidth: 1, overflow: 'hidden' }, eventArt: { alignItems: 'center', backgroundColor: '#4d3989', height: 148, justifyContent: 'center' }, eventDate: { backgroundColor: '#f8f6ff', color: '#17151f', fontSize: 11, fontWeight: '800', left: 10, padding: 7, position: 'absolute', top: 10 }, eventBadge: { backgroundColor: '#a3ff64', bottom: 10, color: '#182018', fontSize: 9, fontWeight: '800', left: 10, padding: 7, position: 'absolute' }, eventName: { color: '#f8f6ff', fontSize: 23, fontWeight: '800', letterSpacing: -0.8 }, eventMeta: { color: '#a4a7b8', fontSize: 14, marginTop: 5 }, hostMeta: { color: '#c8c5d5', fontSize: 14, fontWeight: '600', marginTop: 12 }, eventHostLink: { borderTopColor: '#2d3040', borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12 }, eventRecommendation: { color: '#78e0c0', fontSize: 12, fontWeight: '800', marginTop: 8 }, nearbyButton: { alignSelf: 'flex-start', backgroundColor: '#191b27', borderColor: '#383b4d', borderRadius: 17, borderWidth: 1, marginTop: 16, paddingHorizontal: 12, paddingVertical: 8 }, nearbyButtonActive: { backgroundColor: '#8b5cf6', borderColor: '#9f76ff' }, nearbyButtonText: { color: '#e9e6f6', fontSize: 12, fontWeight: '800' }, nearbyButtonTextActive: { color: '#fff' },
  conversation: { alignItems: 'center', backgroundColor: '#171925', borderColor: '#2b2e3f', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 8, padding: 12 }, notificationCard: { alignItems: 'center', backgroundColor: '#171925', borderColor: '#2b2e3f', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }, notificationUnread: { backgroundColor: '#241d38', borderColor: '#9b70ff' }, notificationIcon: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 }, notificationText: { color: '#f8f6ff', fontSize: 15, fontWeight: '700', lineHeight: 21 }, contactName: { color: '#d7d4e2', fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'center', width: 60 }, chatFollowHint: { color: '#a4a7b8', fontSize: 14, lineHeight: 20, paddingBottom: 22 },
  chatHeader: { alignItems: 'center', backgroundColor: '#171925', borderBottomColor: '#2b2e3f', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 15, paddingVertical: 13 }, chatBackButton: { alignItems: 'center', backgroundColor: '#292438', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, back: { color: '#c698ff', fontSize: 27, fontWeight: '500', lineHeight: 29, marginTop: -3 }, chatTitle: { color: '#f8f6ff', flex: 1, fontSize: 18, fontWeight: '800' }, chatSubtitle: { color: '#a4a7b8', fontSize: 11, fontWeight: '700', marginTop: 2 }, chatMenu: { alignItems: 'center', backgroundColor: '#292438', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, chatMenuText: { color: '#f8f6ff', fontSize: 15, fontWeight: '900', letterSpacing: 1, marginTop: -6 }, messageList: { backgroundColor: '#0d0e16', flexGrow: 1, gap: 10, padding: 16, paddingTop: 20 }, bubble: { alignSelf: 'flex-start', backgroundColor: '#25223a', borderColor: '#363348', borderRadius: 15, borderBottomLeftRadius: 4, borderWidth: 1, maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 10 }, bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', borderBottomLeftRadius: 15, borderBottomRightRadius: 4 }, bubbleText: { color: '#f8f6ff', fontSize: 16, lineHeight: 23 }, bubbleMineText: { color: '#fff' }, bubbleTime: { color: '#a8aabc', fontSize: 11, marginTop: 5 }, bubbleMineTime: { color: '#e3d8ff' }, composer: { alignItems: 'center', backgroundColor: '#171925', borderTopColor: '#2b2e3f', borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 11 }, composerMark: { alignItems: 'center', backgroundColor: '#292438', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 }, composerMarkText: { color: '#c698ff', fontSize: 16 }, emojiTriggerText: { color: '#c698ff', fontSize: 20 }, emojiPicker: { alignItems: 'center', backgroundColor: '#171925', borderTopColor: '#2b2e3f', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 }, emojiChoice: { alignItems: 'center', backgroundColor: '#292438', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 }, messageInput: { backgroundColor: '#10111a', borderColor: '#36394a', borderRadius: 21, borderWidth: 1, color: '#f8f6ff', flex: 1, fontSize: 16, maxHeight: 80, paddingHorizontal: 14, paddingVertical: 10 }, send: { alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, sendText: { color: '#fff', fontSize: 21, fontWeight: '700' },
  profile: { backgroundColor: '#0d0e16', padding: 21, paddingTop: 30 }, profileName: { color: '#f8f6ff', fontSize: 28, fontWeight: '800', letterSpacing: -1.2, marginTop: 6 }, profileBio: { color: '#d9d6e5', fontSize: 17, lineHeight: 25, marginTop: 23 }, score: { backgroundColor: '#191b27', borderColor: '#343748', borderRadius: 12, borderWidth: 1, flex: 1, padding: 12 }, scoreValue: { color: '#f8f6ff', fontSize: 25, fontWeight: '800' }, scoreLabel: { color: '#a8abbc', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 5 }, profileHelp: { color: '#a5a8b9', fontSize: 15, lineHeight: 22, marginTop: 25 }, logout: { alignItems: 'center', borderColor: '#ff6da9', borderRadius: 10, borderWidth: 1, marginTop: 25, padding: 14 }, logoutText: { color: '#ff80b3', fontSize: 15, fontWeight: '800' },
  nav: { backgroundColor: '#12131d', borderTopColor: '#2a2d3c', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, paddingTop: 9 }, navIcon: { color: '#858899', fontSize: 18, lineHeight: 20 }, navLabel: { color: '#858899', fontSize: 10, fontWeight: '700', marginTop: 3 }, navActive: { color: '#bd8cff', fontWeight: '800' }, navBadge: { backgroundColor: '#ff5ca8', borderRadius: 8, color: '#fff', fontSize: 8, fontWeight: '800', minWidth: 15, overflow: 'hidden', paddingHorizontal: 3, position: 'absolute', right: -9, textAlign: 'center', top: -5 },
  empty: { alignItems: 'center', backgroundColor: '#151721', borderColor: '#383b4b', borderRadius: 13, borderStyle: 'dashed', borderWidth: 1, marginTop: 15, padding: 27 }, emptyIcon: { color: '#ae80ff', fontSize: 30 }, emptyTitle: { color: '#f8f6ff', fontSize: 17, fontWeight: '800', marginTop: 7 }, emptyBody: { color: '#a4a7b8', fontSize: 15, lineHeight: 22, marginTop: 5, textAlign: 'center' }, overlay: { backgroundColor: '#04050bdd', flex: 1, justifyContent: 'flex-end' }, sheet: { backgroundColor: '#171925', borderColor: '#333647', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: '90%', padding: 22, paddingBottom: 34 }, handle: { alignSelf: 'center', backgroundColor: '#686b7c', borderRadius: 3, height: 4, marginBottom: 20, width: 36 }, sheetTitle: { color: '#f8f6ff', fontSize: 30, fontWeight: '800', letterSpacing: -1.4, marginTop: 9 }, sheetCopy: { color: '#a5a8b9', fontSize: 16, lineHeight: 24, marginTop: 9 }, momentInput: { backgroundColor: '#10111a', borderColor: '#36394a', borderRadius: 11, borderWidth: 1, color: '#f8f6ff', fontSize: 17, height: 120, marginTop: 18, padding: 13, textAlignVertical: 'top' }, commentCard: { alignItems: 'flex-start', backgroundColor: '#20222f', borderColor: '#343747', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 }, commentBody: { color: '#e8e6f0', fontSize: 15, lineHeight: 21, marginTop: 4 }, commentInput: { backgroundColor: '#10111a', borderColor: '#36394a', borderRadius: 10, borderWidth: 1, color: '#f8f6ff', fontSize: 16, marginTop: 10, maxHeight: 180, minHeight: 96, paddingHorizontal: 13, paddingVertical: 10, textAlignVertical: 'top' }, mediaAction: { backgroundColor: '#28233c', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 }, mediaActionText: { color: '#eae7f8', fontSize: 13, fontWeight: '800' }, attachment: { alignItems: 'center', backgroundColor: '#28233c', borderRadius: 10, flexDirection: 'row', gap: 10, marginTop: 12, padding: 9 }, attachmentTitle: { color: '#f8f6ff', fontSize: 13, fontWeight: '800' }, locationTag: { alignItems: 'center', backgroundColor: '#1d3540', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10 }, locationTagText: { color: '#8ff4d0', flex: 1, fontSize: 13, fontWeight: '700' }, editLocation: { backgroundColor: '#10111a', borderColor: '#36394a', borderRadius: 10, borderWidth: 1, color: '#f8f6ff', fontSize: 16, marginTop: 10, paddingHorizontal: 13, paddingVertical: 12 }, cancelEdit: { alignItems: 'center', borderColor: '#bab6ca', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', marginTop: 16, padding: 15 }, cancelEditText: { color: '#f8f6ff', fontSize: 15, fontWeight: '800' },
  eventQuest: { backgroundColor: '#20222f', borderColor: '#343747', borderRadius: 11, borderWidth: 1, marginTop: 8, padding: 13 }, eventQuestKind: { color: '#c18cff', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 }, eventQuestTitle: { color: '#f8f6ff', fontSize: 17, fontWeight: '800', marginTop: 6 }, eventQuestCopy: { color: '#a6a9b9', fontSize: 14, lineHeight: 20, marginTop: 5 }, questNotice: { backgroundColor: '#302653', borderRadius: 12, marginTop: 19, padding: 15 }, questNoticeText: { color: '#e9e2ff', fontSize: 15, lineHeight: 22 }, questProofButton: { alignSelf: 'flex-start', backgroundColor: '#8b5cf6', borderRadius: 16, marginTop: 11, paddingHorizontal: 11, paddingVertical: 8 }, questProofButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, questProofState: { alignSelf: 'flex-start', backgroundColor: '#25352a', borderRadius: 12, color: '#a6ff80', fontSize: 11, fontWeight: '800', marginTop: 11, paddingHorizontal: 9, paddingVertical: 6, textTransform: 'capitalize' }, ratingPanel: { backgroundColor: '#20222f', borderColor: '#343747', borderRadius: 11, borderWidth: 1, marginTop: 18, padding: 14 }, ratingTitle: { color: '#f8f6ff', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }, ratingCopy: { color: '#a6a9b9', fontSize: 14, lineHeight: 20, marginTop: 6 }, ratingChoice: { backgroundColor: '#292c3b', borderColor: '#3b3e4d', borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 }, ratingChoiceText: { color: '#dedbe9', fontSize: 12, fontWeight: '800' }, ratingChoiceSelected: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }, ratingChoiceSelectedText: { color: '#fff' }, eventShare: { alignItems: 'center', backgroundColor: '#191b27', borderColor: '#3c3f50', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', marginRight: 8, padding: 14 }, eventShareText: { color: '#f3f0ff', fontSize: 14, fontWeight: '800' }, hostPill: { alignItems: 'center', backgroundColor: '#302653', borderRadius: 10, flex: 1, padding: 14 }, hostPillText: { color: '#dccbff', fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
});

/* Pixel-quest mobile skin.  `monospace` maps to the platform's bitmap-style
   system face, keeping the app offline and consistent with the web UI. */
Object.assign(darkStyles, {
  app: { flex: 1, backgroundColor: '#050916' },
  auth: { flex: 1, backgroundColor: '#050916' },
  authHero: { backgroundColor: '#09142a', borderBottomColor: '#38527d', borderBottomWidth: 2, minHeight: 236, padding: 28, paddingTop: 38, position: 'relative' },
  bigMark: { alignItems: 'center', backgroundColor: '#7644d5', borderColor: '#d8b3ff', borderRadius: 2, borderWidth: 2, height: 46, justifyContent: 'center', width: 46 },
  markText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 24, fontWeight: '900' },
  authBrand: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 27, fontWeight: '800', letterSpacing: -1.2, marginTop: 15 },
  tagline: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 8, lineHeight: 14, marginTop: 9 },
  themeToggle: { backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', right: 20, top: 20 },
  themeToggleText: { color: '#ffd35d', fontFamily: PIXEL_FONT, fontSize: 8 },
  authTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 24, letterSpacing: -1.4, lineHeight: 35, marginTop: 14 },
  authDescription: { color: '#b7c2da', fontFamily: 'monospace', fontSize: 16, lineHeight: 23, marginBottom: 15, marginTop: 11 },
  input: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', fontFamily: 'monospace', fontSize: 16, marginTop: 10, paddingHorizontal: 13, paddingVertical: 13 },
  primary: { alignItems: 'center', backgroundColor: '#7743d8', borderColor: '#dfc0ff', borderRadius: 1, borderWidth: 2, flex: 1, justifyContent: 'center', marginTop: 16, padding: 14 },
  primaryText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 10, lineHeight: 17 },
  switchText: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 8, lineHeight: 16, marginTop: 20, textAlign: 'center' },
  appHeader: { alignItems: 'center', backgroundColor: '#081125', borderBottomColor: '#38527d', borderBottomWidth: 2, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12 },
  smallMark: { alignItems: 'center', backgroundColor: '#7644d5', borderColor: '#d8b3ff', borderRadius: 1, borderWidth: 1, height: 29, justifyContent: 'center', width: 29 },
  smallMarkText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 14, fontWeight: '800' },
  appBrand: { flexShrink: 1, color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 13, letterSpacing: -1 },
  headerTheme: { alignItems: 'center', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerThemeText: { color: '#ffd35d', fontSize: 17 },
  headerChat: { alignItems: 'center', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerProfile: { alignItems: 'center', backgroundColor: '#7644d5', borderColor: '#d8b3ff', borderRadius: 1, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerProfileText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 10 },
  content: { flex: 1, backgroundColor: '#050916' },
  list: { gap: 12, padding: 15, paddingBottom: 22 },
  eyebrow: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 15, marginBottom: 7 },
  title: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 22, letterSpacing: -1.3, lineHeight: 34, marginTop: 5 },
  serif: { color: '#ffd35d', fontFamily: PIXEL_FONT, fontStyle: 'normal' },
  homeGreeting: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 15, marginTop: 8 },
  homeSpark: { color: '#ff68b4', fontSize: 20 },
  copy: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 15, lineHeight: 22, marginTop: 9 },
  outline: { alignSelf: 'flex-start', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, marginTop: 15, paddingHorizontal: 12, paddingVertical: 9 },
  outlineText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8 },
  secondary: { alignItems: 'center', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, justifyContent: 'center', marginTop: 12, padding: 13 },
  secondaryText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8 },
  questFilters: { flexDirection: 'row', gap: 7, marginTop: 17 },
  questFilter: { backgroundColor: '#101d38', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  questFilterActive: { backgroundColor: '#6741c7', borderColor: '#d1b0ff' },
  questFilterText: { color: '#b7c2da', fontFamily: PIXEL_FONT, fontSize: 7 },
  questFilterTextActive: { color: '#fff' },
  questSectionTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 9, lineHeight: 16 },
  questSeeAll: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7 },
  mobileQuestCard: { backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, overflow: 'hidden' },
  mobileQuestArt: { alignItems: 'center', backgroundColor: '#263a74', height: 134, justifyContent: 'center' },
  mobileQuestArtAlt: { backgroundColor: '#572c7d' },
  mobileQuestDate: { backgroundColor: '#f8f5e8', borderRadius: 1, color: '#17142c', fontFamily: PIXEL_FONT, fontSize: 7, left: 10, paddingHorizontal: 7, paddingVertical: 6, position: 'absolute', top: 10 },
  mobileQuestIcon: { color: '#ffd35d', fontSize: 39 },
  mobileQuestStatus: { backgroundColor: '#9cec4c', borderRadius: 1, bottom: 10, color: '#173122', fontFamily: PIXEL_FONT, fontSize: 6, left: 10, paddingHorizontal: 7, paddingVertical: 6, position: 'absolute' },
  mobileQuestName: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 10, lineHeight: 17 },
  mobileQuestMeta: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 12, marginTop: 5 },
  mobileQuestXp: { color: '#9cec4c', fontFamily: PIXEL_FONT, fontSize: 7, marginTop: 10 },
  avatar: { alignItems: 'center', backgroundColor: '#6741c7', borderColor: '#d1b0ff', borderRadius: 1, borderWidth: 1, height: 36, justifyContent: 'center', overflow: 'hidden', width: 36 },
  avatarText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 10 },
  avatarLarge: { borderRadius: 1, height: 64, width: 64 },
  avatarLargeText: { fontSize: 18 },
  post: { backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, padding: 13 },
  personName: { flexShrink: 1, color: '#f8f5e8', fontFamily: 'monospace', fontSize: 15, fontWeight: '800' },
  personMeta: { flexShrink: 1, color: '#aeb9d1', fontFamily: 'monospace', fontSize: 12, marginTop: 3 },
  recommendationTag: { alignSelf: 'flex-start', backgroundColor: '#162a4b', borderColor: '#31547b', borderRadius: 1, borderWidth: 1, color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 6, marginTop: 10, paddingHorizontal: 7, paddingVertical: 6 },
  questPostTag: { alignSelf: 'flex-start', backgroundColor: '#291f4b', borderColor: '#7651ad', borderRadius: 1, borderWidth: 1, color: '#e0c2ff', fontFamily: PIXEL_FONT, fontSize: 6, marginTop: 10, paddingHorizontal: 7, paddingVertical: 6 },
  postBody: { color: '#e7ecf9', fontFamily: 'monospace', fontSize: 16, lineHeight: 24, marginTop: 12 },
  postFooter: { flexWrap: 'wrap', borderTopColor: '#263b62', borderTopWidth: 1, flexDirection: 'row', gap: 15, marginTop: 13, paddingTop: 10 },
  postManage: { borderLeftColor: '#38527d', borderLeftWidth: 1, flexDirection: 'row', gap: 8, marginLeft: 'auto', paddingLeft: 9 },
  postManageText: { color: '#d6dced', fontFamily: 'monospace', fontSize: 12, fontWeight: '800' },
  postDeleteText: { color: '#ff938c', fontFamily: 'monospace', fontSize: 12, fontWeight: '800' },
  searchInput: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', flex: 1, fontFamily: 'monospace', fontSize: 16, paddingHorizontal: 12, paddingVertical: 11 },
  searchButton: { alignItems: 'center', backgroundColor: '#6741c7', borderColor: '#d1b0ff', borderRadius: 1, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 12 },
  searchText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 7 },
  section: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 16, marginBottom: 8 },
  muted: { color: '#aeb9d1', fontFamily: 'monospace', fontSize: 14 },
  eventCard: { backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, overflow: 'hidden' },
  eventArt: { alignItems: 'center', backgroundColor: '#263a74', height: 148, justifyContent: 'center' },
  eventDate: { backgroundColor: '#f8f5e8', borderRadius: 1, color: '#15142b', fontFamily: PIXEL_FONT, fontSize: 7, left: 10, padding: 7, position: 'absolute', top: 10 },
  eventBadge: { backgroundColor: '#9cec4c', borderRadius: 1, bottom: 10, color: '#173122', fontFamily: PIXEL_FONT, fontSize: 6, left: 10, padding: 7, position: 'absolute' },
  eventName: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 12, lineHeight: 18 },
  eventMeta: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 13, marginTop: 5 },
  hostMeta: { color: '#d6dced', fontFamily: 'monospace', fontSize: 13, marginTop: 11 },
  eventHostLink: { borderTopColor: '#263b62', borderTopWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  eventRecommendation: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, marginTop: 8 },
  nearbyButton: { alignSelf: 'flex-start', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, marginTop: 15, paddingHorizontal: 11, paddingVertical: 8 },
  nearbyButtonActive: { backgroundColor: '#6741c7', borderColor: '#d1b0ff' },
  nearbyButtonText: { color: '#e9efff', fontFamily: PIXEL_FONT, fontSize: 7 },
  nearbyButtonTextActive: { color: '#fff' },
  conversation: { alignItems: 'center', backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 8, padding: 11 },
  notificationCard: { alignItems: 'center', backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  notificationUnread: { backgroundColor: '#211845', borderColor: '#b780ff' },
  notificationIcon: { alignItems: 'center', backgroundColor: '#6741c7', borderRadius: 1, height: 34, justifyContent: 'center', width: 34 },
  notificationText: { color: '#f8f5e8', fontFamily: 'monospace', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  chatHeader: { alignItems: 'center', backgroundColor: '#101d38', borderBottomColor: '#38527d', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  chatBackButton: { alignItems: 'center', backgroundColor: '#162a4b', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  back: { color: '#55e7ed', fontSize: 25, lineHeight: 29, marginTop: -3 },
  chatTitle: { color: '#f8f5e8', flex: 1, fontFamily: 'monospace', fontSize: 17, fontWeight: '800' },
  chatSubtitle: { color: '#aeb9d1', fontFamily: 'monospace', fontSize: 11, marginTop: 2 },
  chatMenu: { alignItems: 'center', backgroundColor: '#162a4b', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  chatMenuText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 9 },
  messageList: { backgroundColor: '#050916', flexGrow: 1, gap: 9, padding: 14, paddingTop: 18 },
  bubble: { alignSelf: 'flex-start', backgroundColor: '#15284b', borderColor: '#3c5786', borderRadius: 1, borderWidth: 1, maxWidth: '82%', paddingHorizontal: 11, paddingVertical: 9 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#6741c7', borderColor: '#d1b0ff', borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  bubbleText: { color: '#f8f5e8', fontFamily: 'monospace', fontSize: 15, lineHeight: 22 },
  bubbleMineText: { color: '#fff' },
  bubbleTime: { color: '#b9c5e0', fontFamily: PIXEL_FONT, fontSize: 6, marginTop: 5 },
  bubbleMineTime: { color: '#e6d9ff' },
  composer: { alignItems: 'center', backgroundColor: '#101d38', borderTopColor: '#38527d', borderTopWidth: 1, flexDirection: 'row', gap: 7, paddingHorizontal: 11, paddingVertical: 10 },
  composerMark: { alignItems: 'center', backgroundColor: '#1b3160', borderRadius: 1, height: 34, justifyContent: 'center', width: 34 },
  composerMarkText: { color: '#ffd35d', fontSize: 16 },
  emojiTriggerText: { color: '#ffd35d', fontSize: 20 },
  emojiPicker: { alignItems: 'center', backgroundColor: '#101d38', borderTopColor: '#38527d', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  emojiChoice: { alignItems: 'center', backgroundColor: '#1b3160', borderRadius: 1, height: 32, justifyContent: 'center', width: 32 },
  messageInput: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', flex: 1, fontFamily: 'monospace', fontSize: 15, maxHeight: 80, paddingHorizontal: 12, paddingVertical: 10 },
  send: { alignItems: 'center', backgroundColor: '#9cec4c', borderColor: '#e0ffba', borderRadius: 1, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  sendText: { color: '#173122', fontSize: 21, fontWeight: '700' },
  profile: { backgroundColor: '#050916', padding: 18, paddingTop: 25 },
  profileName: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 17, lineHeight: 27, marginTop: 6 },
  profileBio: { color: '#d7dfef', fontFamily: 'monospace', fontSize: 16, lineHeight: 24, marginTop: 21 },
  score: { backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, flex: 1, padding: 10 },
  scoreValue: { color: '#ffd35d', fontFamily: PIXEL_FONT, fontSize: 12 },
  scoreLabel: { color: '#aeb9d1', fontFamily: PIXEL_FONT, fontSize: 5, lineHeight: 12, marginTop: 7 },
  profileHelp: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 14, lineHeight: 22, marginTop: 22 },
  logout: { alignItems: 'center', backgroundColor: '#1a1831', borderColor: '#ff938c', borderRadius: 1, borderWidth: 1, marginTop: 22, padding: 13 },
  logoutText: { color: '#ffaaa1', fontFamily: PIXEL_FONT, fontSize: 8 },
  nav: { backgroundColor: '#081125', borderTopColor: '#38527d', borderTopWidth: 2, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, paddingTop: 8 },
  navIcon: { color: '#8f9bb3', fontSize: 18, lineHeight: 20 },
  navLabel: { color: '#8f9bb3', fontFamily: PIXEL_FONT, fontSize: 6, marginTop: 3 },
  navActive: { color: '#55e7ed' },
  navBadge: { backgroundColor: '#ff68b4', borderRadius: 1, color: '#fff', fontFamily: PIXEL_FONT, fontSize: 6, minWidth: 15, paddingHorizontal: 3, position: 'absolute', right: -9, textAlign: 'center', top: -5 },
  empty: { alignItems: 'center', backgroundColor: '#0d1930', borderColor: '#536c9d', borderRadius: 1, borderStyle: 'dashed', borderWidth: 1, marginTop: 15, padding: 23 },
  emptyIcon: { color: '#ffd35d', fontSize: 28 },
  emptyTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 9, lineHeight: 17, marginTop: 8 },
  emptyBody: { color: '#aeb9d1', fontFamily: 'monospace', fontSize: 14, lineHeight: 21, marginTop: 6, textAlign: 'center' },
  overlay: { backgroundColor: '#01030be8', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0d1930', borderColor: '#536c9d', borderTopLeftRadius: 2, borderTopRightRadius: 2, borderWidth: 2, maxHeight: '90%', padding: 20, paddingBottom: 32 },
  handle: { alignSelf: 'center', backgroundColor: '#536c9d', borderRadius: 0, height: 4, marginBottom: 17, width: 40 },
  sheetTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 16, lineHeight: 26, marginTop: 9 },
  sheetCopy: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 15, lineHeight: 22, marginTop: 9 },
  momentInput: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', fontFamily: 'monospace', fontSize: 16, height: 120, marginTop: 17, padding: 12, textAlignVertical: 'top' },
  commentCard: { alignItems: 'flex-start', backgroundColor: '#111f3b', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 },
  commentBody: { color: '#e7ecf9', fontFamily: 'monospace', fontSize: 14, lineHeight: 21, marginTop: 4 },
  commentInput: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', fontFamily: 'monospace', fontSize: 16, marginTop: 10, maxHeight: 180, minHeight: 96, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  mediaAction: { backgroundColor: '#1b3160', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
  mediaActionText: { color: '#eef2ff', fontFamily: PIXEL_FONT, fontSize: 7 },
  attachment: { alignItems: 'center', backgroundColor: '#1b3160', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 12, padding: 9 },
  attachmentTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8 },
  locationTag: { alignItems: 'center', backgroundColor: '#17354c', borderColor: '#3d8c9b', borderRadius: 1, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10 },
  locationTagText: { color: '#9cf3f3', flex: 1, fontFamily: 'monospace', fontSize: 13 },
  editLocation: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', fontFamily: 'monospace', fontSize: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 12 },
  cancelEdit: { alignItems: 'center', borderColor: '#b6c1d8', borderRadius: 1, borderWidth: 1, flex: 1, justifyContent: 'center', marginTop: 16, padding: 14 },
  cancelEditText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8 },
  questNotice: { backgroundColor: '#20194b', borderColor: '#7651ad', borderRadius: 1, borderWidth: 1, marginTop: 18, padding: 14 },
  questNoticeText: { color: '#e8ddff', fontFamily: 'monospace', fontSize: 14, lineHeight: 21 },
  eventQuest: { backgroundColor: '#111f3b', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, marginTop: 8, padding: 12 },
  eventQuestKind: { color: '#d9b5ff', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 15 },
  eventQuestTitle: { color: '#f8f5e8', fontFamily: 'monospace', fontSize: 16, fontWeight: '800', marginTop: 6 },
  eventQuestCopy: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 13, lineHeight: 20, marginTop: 5 },
  questProofButton: { alignSelf: 'flex-start', backgroundColor: '#9cec4c', borderColor: '#e0ffba', borderRadius: 1, borderWidth: 1, marginTop: 11, paddingHorizontal: 10, paddingVertical: 8 },
  questProofButtonText: { color: '#173122', fontFamily: PIXEL_FONT, fontSize: 7 },
  questProofState: { alignSelf: 'flex-start', backgroundColor: '#1f3e32', borderColor: '#65a66d', borderRadius: 1, borderWidth: 1, color: '#b8f99b', fontFamily: PIXEL_FONT, fontSize: 7, marginTop: 11, paddingHorizontal: 8, paddingVertical: 6, textTransform: 'capitalize' },
  ratingPanel: { backgroundColor: '#111f3b', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, marginTop: 17, padding: 13 },
  ratingTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8, lineHeight: 16 },
  ratingCopy: { color: '#b6c1d8', fontFamily: 'monospace', fontSize: 13, lineHeight: 20, marginTop: 6 },
  ratingChoice: { backgroundColor: '#1b3160', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  ratingChoiceText: { color: '#e4ebfb', fontFamily: PIXEL_FONT, fontSize: 7 },
  ratingChoiceSelected: { backgroundColor: '#ffd35d', borderColor: '#fff0b5' },
  ratingChoiceSelectedText: { color: '#231c34' },
  eventShare: { alignItems: 'center', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, flex: 1, justifyContent: 'center', marginRight: 8, padding: 13 },
  eventShareText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 8 },
  hostPill: { alignItems: 'center', backgroundColor: '#20194b', borderColor: '#7651ad', borderRadius: 1, borderWidth: 1, flex: 1, padding: 13 },
  hostPillText: { color: '#e0c2ff', fontFamily: PIXEL_FONT, fontSize: 7, textTransform: 'capitalize' },
});

// A slightly roomier pixel scale keeps the 8-bit UI legible on real phones.
Object.assign(darkStyles, {
  auth: { flex: 1, backgroundColor: '#0b1326' },
  authArt: { backgroundColor: '#071022', minHeight: 255, overflow: 'hidden', paddingHorizontal: 24, position: 'relative' },
  authGrid: { bottom: 0, left: 0, opacity: 0.42, position: 'absolute', right: 0, top: 0 },
  authGridRow: { backgroundColor: '#ffffff14', height: 1, left: 0, position: 'absolute', right: 0 },
  authGridColumn: { backgroundColor: '#ffffff14', bottom: 0, position: 'absolute', top: 0, width: 1 },
  authGlow: { backgroundColor: '#3c2578', borderRadius: 150, height: 300, opacity: 0.72, position: 'absolute', right: -115, top: 72, width: 300 },
  authOrbitLarge: { borderColor: '#9c72e5a0', borderRadius: 220, borderStyle: 'dashed', borderWidth: 2, height: 420, position: 'absolute', right: -180, top: 160, width: 420 },
  authOrbitSmall: { borderColor: '#9c72e5a0', borderRadius: 140, borderStyle: 'dashed', borderWidth: 2, height: 260, position: 'absolute', right: -55, top: 248, width: 260 },
  authArtContent: { zIndex: 1 },
  authWordmark: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  authWordBrand: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 13, letterSpacing: -1 },
  authKicker: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 15, marginTop: 72 },
  authDisplayTitle: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 31, letterSpacing: -2.5, lineHeight: 40, marginTop: 12, textShadowColor: '#40216f', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  authDisplayTitleAccent: { color: '#ffd35d' },
  authSword: { color: '#ff68b4', fontSize: 24, marginTop: 8 },
  authForm: { flex: 1 },
  authContent: { backgroundColor: '#0b1326', padding: 28 },
  authLabel: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 16, marginTop: 16 },
  authTitle: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 22, letterSpacing: -1.3, lineHeight: 34, marginTop: 5 },
  authDescription: { color: '#b6c1d8', fontFamily: COPY_FONT, fontSize: 15, lineHeight: 22, marginBottom: 0, marginTop: 9 },
  input: { backgroundColor: '#071022', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, color: '#f8f5e8', fontFamily: COPY_FONT, fontSize: 17, marginTop: 7, paddingHorizontal: 13, paddingVertical: 13 },
  primary: { alignItems: 'center', backgroundColor: '#7743d8', borderColor: '#dfc0ff', borderRadius: 1, borderWidth: 2, flex: 1, justifyContent: 'center', marginTop: 18, padding: 14 },
  primaryText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 9, lineHeight: 17 },
  switchText: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 16, marginTop: 20, textAlign: 'center' },
  authNote: { color: '#b6c1d8', fontFamily: COPY_FONT, fontSize: 13, lineHeight: 19, marginTop: 22, textAlign: 'center' },
  headerRight: { flexDirection: 'row', gap: 6 },
  headerAction: { alignItems: 'center', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 32, justifyContent: 'center', position: 'relative', width: 32 },
  headerActionText: { color: '#f8f5e8', fontFamily: PIXEL_FONT, fontSize: 13 },
  headerNotificationBadge: { alignItems: 'center', backgroundColor: '#ff68b4', borderRadius: 1, color: '#fff', fontFamily: PIXEL_FONT, fontSize: 5, justifyContent: 'center', minWidth: 14, paddingHorizontal: 2, position: 'absolute', right: -5, textAlign: 'center', top: -5 },
  headerCompose: { alignItems: 'center', backgroundColor: '#6741c7', borderColor: '#d1b0ff', borderRadius: 1, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  headerComposeText: { color: '#fff', fontFamily: PIXEL_FONT, fontSize: 17, lineHeight: 19 },
  navItem: { alignItems: 'center', flex: 1, minWidth: 0, minHeight: 44 },
  mobileQuestCover: { height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' },
  homeComposer: { alignItems: 'flex-start', backgroundColor: '#0d1930', borderColor: '#38527d', borderRadius: 1, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 18, padding: 12 },
  homeComposerCopy: { flex: 1, minWidth: 0 },
  homeComposerPrompt: { color: '#f8f5e8', fontFamily: COPY_FONT_BOLD, fontSize: 15, lineHeight: 21 },
  homeComposerAction: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 7, lineHeight: 15, marginTop: 11 },
  title: { ...darkStyles.title, fontSize: 25, lineHeight: 36 },
  appBrand: { flexShrink: 1, ...darkStyles.appBrand, fontSize: 14 },
  eyebrow: { ...darkStyles.eyebrow, fontSize: 9, lineHeight: 15 },
  outlineText: { ...darkStyles.outlineText, fontSize: 9 },
  questFilterText: { ...darkStyles.questFilterText, fontSize: 9 },
  questSectionTitle: { ...darkStyles.questSectionTitle, fontSize: 10 },
  section: { ...darkStyles.section, fontSize: 9 },
  navLabel: { ...darkStyles.navLabel, fontFamily: COPY_FONT, fontSize: 12 },
  eventName: { ...darkStyles.eventName, fontSize: 17 },
  personName: { flexShrink: 1, ...darkStyles.personName, fontSize: 16 },
  modalKeyboardAvoider: { flex: 1 },
  messageScroller: { flex: 1 },
  keyboardDismiss: { alignItems: 'center', backgroundColor: '#162a4b', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, height: 40, justifyContent: 'center', width: 30 },
  keyboardDismissText: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 12, lineHeight: 15 },
  sheetKeyboardDismiss: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: '#101d38', borderColor: '#536c9d', borderRadius: 1, borderWidth: 1, justifyContent: 'center', marginBottom: 4, paddingHorizontal: 9, paddingVertical: 7 },
  sheetKeyboardDismissText: { color: '#55e7ed', fontFamily: PIXEL_FONT, fontSize: 6, lineHeight: 13 },
});
