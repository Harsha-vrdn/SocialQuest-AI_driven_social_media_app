import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, NativeModules, Platform, Share, TextInput } from 'react-native';
import { nearbyEventsPath, type AccountSettings } from '../accountSettings';
import { type AttachmentClient } from '../attachmentProtocol';
import { createMobileAttachmentClient } from '../chatAttachmentStorage';
import type { CommentsHandle } from '../components/modals/CommentsSheet';
import type { EventEditorHandle } from '../components/modals/EventEditorModal';
import type { PostComposerHandle } from '../components/modals/PostComposerModal';
import { type SearchKind } from '../DiscoverSearch';
import { type ProfileDraft } from '../ProfileEditor';
import type { AttendanceItem, Conversation, EventItem, NotificationItem, PeoplePanel, Post, Quest, RatingItem, Reaction, Tab, User } from '../types';
import { DeliveryNotice, useDeviceNotifications } from '../useDeviceNotifications';
import { AUTH_TOKEN_KEY, nameOf, rows } from '../utils/social';
import { useChatController } from './useChatController';
import { useReconciledState } from './useReconciledState';
import { useStableActions } from './useStableActions';

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

export function useSocialQuestController() {
  const eventEditorRef = useRef<EventEditorHandle>(null);
  const composerRef = useRef<PostComposerHandle>(null);
  const commentsRef = useRef<CommentsHandle>(null);
  const [eventEditor, setEventEditorVisible] = useState(false);
  const [eventEditorClosing, setEventEditorClosing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const exploreDraft = useRef('');
  const [searchResetRequest, setSearchResetRequest] = useState(0);
  const showEventEditor = (event?: EventItem) => { setEventEditorVisible(true); eventEditorRef.current?.openEventEditor(event); };
  const showComposer = (quest: Quest | null) => { setComposeOpen(true); composerRef.current?.openComposer(quest); };
  const showComments = async (post: Post) => { await commentsRef.current?.openComments(post); };
  const dismissComments = () => { commentsRef.current?.closeComments(); setCommentPost(null); };
  const { openEventEditor, openComposer, openComments, closeComments } = {
    openEventEditor: showEventEditor, openComposer: showComposer, openComments: showComments, closeComments: dismissComments,
  };
  const [token, setToken] = useState('');
  useEffect(() => {
    setEventEditorVisible(false); setEventEditorClosing(false); setComposeOpen(false); setCommentPost(null);
  }, [token]);
  const [authReady, setAuthReady] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const usernameInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [me, setMe] = useReconciledState<User | null>(null);
  const [attachmentClient, setAttachmentClient] = useState<AttachmentClient | null>(null);
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
  const likeInFlight = useRef(new Set<number>());
  const reportInFlight = useRef(new Set<string>());
  const sessionToken = useRef(token);
  sessionToken.current = token;
  const [events, setEvents] = useReconciledState<EventItem[]>([]);
  const [hostedEvents, setHostedEvents] = useReconciledState<EventItem[]>([]);
  const [joinedEvents, setJoinedEvents] = useReconciledState<EventItem[]>([]);
  const [eventRequests, setEventRequests] = useState<AttendanceItem[]>([]);
  const [people, setPeople] = useReconciledState<User[]>([]);
  const [following, setFollowing] = useReconciledState<User[]>([]);
  const [peoplePanel, setPeoplePanel] = useState<PeoplePanel | null>(null);
  const [peopleResults, setPeopleResults] = useState<User[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const peopleRequestVersion = useRef(0);
  const followInFlight = useRef(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [nearbyActive, setNearbyActive] = useState(false);
  const [eventAttendanceRevision, setEventAttendanceRevision] = useState(0);
  const [posts, setPosts] = useReconciledState<Post[]>([]);
  const [reels, setReels] = useReconciledState<Post[]>([]);
  const [searchKind, setSearchKind] = useState<SearchKind>('events');
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const openingEventChat = useRef(false);
  const notificationRequestVersion = useRef(0);
  const [notifications, setNotifications] = useReconciledState<NotificationItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [eventQuests, setEventQuests] = useState<Quest[]>([]);
  const [eventPosts, setEventPosts] = useState<Post[]>([]);
  const [ratingTargets, setRatingTargets] = useState<User[]>([]);
  const [eventRatings, setEventRatings] = useState<RatingItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [profilePosts, setProfilePosts] = useReconciledState<Post[]>([]);
  const [profilePostsLoading, setProfilePostsLoading] = useState(false);
  const [profilePostsError, setProfilePostsError] = useState('');
  const [profilePostsOwner, setProfilePostsOwner] = useState<number | null>(null);
  const [profileSection, setProfileSection] = useState<'POST' | 'REEL' | 'EVENTS'>('POST');
  const profileUserId = selectedUser?.id || (tab === 'Profile' ? me?.id : undefined);
  const currentProfileId = useRef(profileUserId);
  currentProfileId.current = profileUserId;
  const profileRequestVersion = useRef(0);

  const api = async (path: string, options: any = {}, authToken = token): Promise<any> => {
    const { singlePage = false, ...requestOptions } = options;
    const headers: any = { ...(authToken ? { Authorization: 'Token ' + authToken } : {}), ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(API_URL + path, { ...requestOptions, headers });
    } catch (error: any) {
      if (/Unsupported FormData(?:Part)? implementation/.test(String(error?.message || ''))) {
        throw new Error('The app could not prepare this file for upload. Update the app and select the file again.');
      }
      const help = API_URL.includes('YOUR_LAN_IP')
        ? 'Mobile API is not configured. Start Expo with EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000/api.'
        : 'Could not reach ' + API_URL + '. Start Django with python manage.py runserver 0.0.0.0:8000 and keep the phone on the same Wi-Fi.';
      throw new Error(help);
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (authToken && sessionToken.current !== authToken) throw new Error('Session changed.');
    if (response.status === 401 && authToken) {
      closeComments();
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

  const saveProfile = async (draft: ProfileDraft, avatar: ImagePicker.ImagePickerAsset | null) => {
    if (!token || !me) throw new Error('Log in to edit your profile.');
    const ownerId = me.id;
    const data = new FormData();
    data.append('display_name', draft.display_name);
    data.append('bio', draft.bio);
    data.append('city', draft.city);
    if (avatar) data.append('avatar', new File(avatar.uri));
    const updated: User = await api('/people/me/', { method: 'PATCH', body: data });
    if (sessionToken.current !== token || updated.id !== ownerId) return;
    setMe(updated);
    setSelectedUser(current => current?.id === ownerId ? updated : current);
    const updateAuthor = (items: Post[]) => items.map(post => post.author.id === ownerId ? { ...post, author: updated } : post);
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
  const loadNotifications = async () => {
    const version = ++notificationRequestVersion.current;
    const result = rows<NotificationItem>(await api('/notifications/'));
    if (version === notificationRequestVersion.current) setNotifications(result);
  };

  const closePeople = () => {
    peopleRequestVersion.current += 1;
    setPeoplePanel(null); setSelectedUser(null); Keyboard.dismiss();
  };
  const {
    conversations,
    setConversations,
    activeChat,
    setActiveChat,
    chatMembersOpen,
    setChatMembersOpen,
    chatBackActive,
    messages,
    setMessages,
    activeChatId,
    chatEditor,
    setChatEditor,
    messageOptions,
    setMessageOptions,
    chatDraftCache,
    loadChats,
    markChatRead,
    loadMessages,
    openChat,
    showFailedMessage,
    showChatOptions,
    showMessageOptions,
    deleteMessage,
    saveChatEditor,
    outbox
  } = useChatController({ api, token, me, tab, setTab, appActive, currentTab, closePeople, setSelectedUser });

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
    const panel = { kind, person };
    setSelectedUser(null); setPeoplePanel(panel); setPeopleResults([]);
    void loadPeopleList(panel);
  };
  const openInviteList = (eventId: number) => {
    const panel: PeoplePanel = { kind: 'invite', eventId };
    setSelectedUser(null); setPeoplePanel(panel); setPeopleResults([]);
    void loadPeopleList(panel);
  };

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(AUTH_TOKEN_KEY).then(savedToken => {
      if (cancelled || !savedToken) return;
      sessionToken.current = savedToken;
      setToken(savedToken);
    }).catch(() => { }).finally(() => { if (!cancelled) setAuthReady(true); });
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
      queue = queue.catch(() => { }).then(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          if (online && sessionToken.current !== token) return;
          await fetch(API_URL + '/people/presence/', {
            method: online ? 'PUT' : 'DELETE', signal: controller.signal,
            headers: { Authorization: 'Token ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, chats_open: online && currentTab.current === 'Chats' }),
          });
        } finally { clearTimeout(timeout); }
      }).catch(() => { });
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
    if (token) return;
    setNotifications([]); exploreDraft.current = '';
    closePeople();
  }, [token]);
  useEffect(() => {
    if (!token || !selectedUser) return;
    const personId = selectedUser.id;
    let cancelled = false;
    void api('/people/' + personId + '/').then(person => {
      if (!cancelled) setSelectedUser(current => current?.id === personId ? person : current);
    }).catch(() => { });
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
  // Android Back returns Settings to Profile, or exits chat before going Home.
  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'Settings') { Keyboard.dismiss(); setTab('Profile'); return true; }
      if (activeChat) { Keyboard.dismiss(); setActiveChat(null); return true; }
      if (tab !== 'Home') { setTab('Home'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [token, activeChat, tab]);
  useEffect(() => {
    if (!token || !appActive) return;
    void loadNotifications().catch(() => { });
    const timer = setInterval(() => void loadNotifications().catch(() => { }), 15000);
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
      if (data.deletion_cancelled) Alert.alert('Deletion canceled', 'Welcome back. Your account is active again and the 90-day countdown has stopped.');
      else if (data.reactivated) Alert.alert('Welcome back', 'Your account has been reactivated.');
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
  const logout = async (alreadyRevoked = false) => {
    if (alreadyRevoked) {
      await deviceNotifications.clearLocal();
    } else {
      await presenceSync.current?.(false);
      await deviceNotifications.disable();
      try { await api('/auth/logout/', { method: 'POST' }); } catch (_) { }
    }
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY).catch(() => { });
    sessionToken.current = '';
    setToken('');
    setMe(null);
    setPosts([]); setReels([]); setEvents([]); setPeople([]); setFollowing([]); setConversations([]); setNotifications([]);
    setHostedEvents([]); setJoinedEvents([]); setEventRequests([]); setMessageOptions(null); setChatEditor(null);
    closeComments();
    setSelectedEvent(null); setSelectedUser(null); setComposeOpen(false); setCommentPost(null); setEditingPost(null);
    setActiveChat(null);
    setMessages([]);
    setTab('Home');
  };

  const findNearbyEvents = async () => {
    try {
      const preference: AccountSettings = await api('/auth/settings/');
      const path = await nearbyEventsPath(preference, async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access in your phone settings, or choose a saved city in Settings.');
        return (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
      });
      const nearby = await api(path);
      setEvents(rows<EventItem>(nearby));
      exploreDraft.current = ''; setSearchResetRequest(value => value + 1);
      setSearchKind('events');
      setNearbyActive(true);
      setTab('Explore');
    } catch (error: any) { Alert.alert('Nearby events unavailable', error.message || 'We could not check events near you.'); }
  };

  useEffect(() => {
    if (!token || !me?.id) { setAttachmentClient(null); return; }
    let current = true;
    const guard = () => { if (!current || sessionToken.current !== token) throw new Error('Session changed.'); };
    const client = createMobileAttachmentClient(me.id, token, API_URL, (path, options) => api(path, options, token), guard);
    setAttachmentClient(client);
    const sync = () => { if (AppState.currentState === 'active') void client.sync().catch(() => { }); };
    sync();
    const timer = setInterval(sync, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { current = false; clearInterval(timer); subscription.remove(); };
  }, [token, me?.id]);

  const openEventChat = async () => {
    if (!selectedEvent || openingEventChat.current) return;
    openingEventChat.current = true;
    try {
      const chat: Conversation = await api('/events/' + selectedEvent.id + '/chat/', { method: 'POST', body: '{}' });
      setConversations(current => [chat, ...current.filter(item => item.id !== chat.id)]);
      setSelectedEvent(null); setTab('Chats'); setActiveChat(chat);
    } catch (error: any) { Alert.alert('Could not open event chat', error.message); }
    finally { openingEventChat.current = false; }
  };

  const join = async () => {
    if (!selectedEvent) return;
    try {
      await api('/events/' + selectedEvent.id + '/join/', { method: 'POST', body: '{}' });
      setEventAttendanceRevision(value => value + 1);
      Alert.alert(selectedEvent.my_attendance_status === 'INVITED' ? 'Invitation accepted' : 'Request sent', selectedEvent.my_attendance_status === 'INVITED' ? 'You are going to this adventure.' : 'The host can now review your public XP and karma.');
      await openEvent(selectedEvent.id);
      await loadDiscover();
    } catch (error: any) { Alert.alert('Could not request entry', error.message); }
  };

  const cancelRsvp = async () => {
    if (!selectedEvent) return;
    try {
      await api('/events/' + selectedEvent.id + '/cancel-rsvp/', { method: 'POST', body: '{}' });
      setEventAttendanceRevision(value => value + 1);
      // Cancellation removes access to a private event; do not reopen its detail.
      if (selectedEvent.privacy === 'PRIVATE') setSelectedEvent(null);
      else await openEvent(selectedEvent.id);
      await loadDiscover();
    } catch (error: any) { Alert.alert('Could not cancel RSVP', error.message); }
  };

  const invitePerson = async (person: User) => {
    if (!peoplePanel?.eventId) return;
    try {
      await api('/events/' + peoplePanel.eventId + '/invite/', { method: 'POST', body: JSON.stringify({ user_id: person.id }) });
      Alert.alert('Invitation sent', nameOf(person) + ' can now open and accept this private event.');
    } catch (error: any) { Alert.alert('Could not invite person', error.message); }
  };

  const deleteEvent = () => {
    if (!selectedEvent) return;
    const eventId = selectedEvent.id;
    Alert.alert('Delete this event?', 'The event, its quests, and its group chat messages will be removed. Private moments will stay private.', [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/events/' + eventId + '/', { method: 'DELETE' }).then(async () => { setSelectedEvent(null); await Promise.all([loadMe(), loadDiscover()]); }).catch((error: any) => Alert.alert('Could not delete event', error.message)) },
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

  const beginQuestProof = (quest: Quest) => {
    if (!selectedEvent || selectedEvent.quest_status !== 'ACTIVE' || selectedEvent.my_attendance_status !== 'ACCEPTED' || quest.my_submission) return;
    openComposer({ ...quest, event: selectedEvent.id, event_name: selectedEvent.name });
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
      setNotifications(current => current.map(item => unreadIds.includes(item.id) ? { ...item, is_read: true } : item));
    } catch (_) { Alert.alert('Could not mark notifications read', 'Please try again.'); }
    finally { notificationRequestVersion.current++; }
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
  const reportPost = async (post: Post, reason: string) => {
    const reportToken = token;
    if (!reportToken || sessionToken.current !== reportToken || post.author.id === me?.id || !reason.trim()) return;
    const key = reportToken + ':' + post.id;
    if (reportInFlight.current.has(key)) return;
    reportInFlight.current.add(key);
    try {
      await api('/reports/', {method: 'POST', body: JSON.stringify({content_type: 'post', object_id: post.id, reason: reason.trim()})}, reportToken);
      if (sessionToken.current === reportToken) Alert.alert('Report received', 'Thank you. Your report has been submitted for review.');
    } catch (error: unknown) {
      if (sessionToken.current === reportToken) Alert.alert('Could not report post', error instanceof Error ? error.message : 'Please try again.');
    } finally {reportInFlight.current.delete(key);}
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
  };
  const savePostEdit = async (editBody: string, editLocation: string) => {
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
  const updateCommentCount = (postId: number, change: number) => {
    const adjust = (post: Post) => post.id === postId ? { ...post, comment_count: Math.max(0, post.comment_count + change) } : post;
    setPosts(current => current.map(adjust));
    setReels(current => current.map(adjust));
    setEventPosts(current => current.map(adjust));
    setProfilePosts(current => current.map(adjust));
    setCommentPost(current => current?.id === postId ? adjust(current) : current);
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
  const deviceNotifications = useDeviceNotifications({ token, userId: me?.id, chatsOpen: tab === 'Chats', api, open: openDeviceNotification });
  const actions = useStableActions({ api, authenticate, beginEditPost, beginQuestProof, cancelRsvp, closeComments, closePeople, confirmLogout, deleteEvent, deleteMessage, deletePost, findNearbyEvents, invitePerson, join, loadChats, loadDiscover, loadFeed, loadMe, loadMessages, loadNotifications, loadPeopleList, logout, markChatRead, markNotificationsRead, openChat, openComments, openComposer, openEvent, openEventChat, openEventEditor, openInviteList, openNotification, openPeopleList, openProfileEditor, rateAttendee, refresh, refreshVisibleProfile, reportPost, reviewEventItem, saveChatEditor, savePostEdit, saveProfile, shareResource, showChatOptions, showFailedMessage, showMessageOptions, toggleFollow, toggleLike, updateCommentCount });
  return { ...actions, eventAttendanceRevision, hostedEvents, joinedEvents, profilePostsOwner, profileUserId, profilePosts, setProfileSection, profilePostsLoading, profilePostsError, accountLoading, activeChat, activeChatId, appActive, attachmentClient, authReady, busy, chatBackActive, chatDraftCache, chatEditor, chatMembersOpen, commentPost, commentsRef, composeOpen, composerRef, conversations, deviceNotifications, displayName, editingPost, email, emailInput, eventEditor, eventEditorClosing, eventEditorRef, eventPosts, eventQuests, eventRatings, eventRequests, events, exploreDraft, followBusy, following, me, messageOptions, messages, mode, nearbyActive, notifications, outbox, password, passwordInput, peopleError, peopleLoading, peoplePanel, peopleResults, posts, profileEditorOpen, profileSection, ratingTargets, reels, refreshing, searchFocusRequest, searchKind, searchResetRequest, selectedEvent, selectedUser, sessionToken, setActiveChat, setChatEditor, setChatMembersOpen, setCommentPost, setComposeOpen, setDisplayName, setEditingPost, setEmail, setEventEditorClosing, setEventEditorVisible, setMessageOptions, setMessages, setMode, setNearbyActive, setPassword, setPeoplePanel, setProfileEditorOpen, setSearchFocusRequest, setSearchKind, setSelectedEvent, setSelectedUser, setTab, setUsername, tab, token, username, usernameInput };
}

export type SocialQuestController = ReturnType<typeof useSocialQuestController>;
