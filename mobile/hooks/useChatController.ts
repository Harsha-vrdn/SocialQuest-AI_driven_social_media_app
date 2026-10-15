import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Alert, AppState } from 'react-native';
import type { ChatMessage, Conversation, Tab, User } from '../types';
import { useChatOutbox } from '../useChatOutbox';
import { rows } from '../utils/social';
import { useReconciledState } from './useReconciledState';
import { useStableActions } from './useStableActions';

type Props = {
  api: (path: string, options?: any) => Promise<any>;
  token: string; me: User | null; tab: Tab; appActive: boolean;
  currentTab: RefObject<Tab>; setTab: (tab: Tab) => void;
  closePeople: () => void; setSelectedUser: (user: User) => void;
};

export function useChatController({ api, token, me, tab, setTab, appActive, currentTab, closePeople }: Props) {
  const chatDraftCache = useRef<Record<number, string>>({});

  const [messageOptions, setMessageOptions] = useState<ChatMessage | null>(null);

  const [conversations, setConversations] = useReconciledState<Conversation[]>([]);

  const [activeChat, setActiveChat] = useReconciledState<Conversation | null>(null);

  const [chatMembersOpen, setChatMembersOpen] = useState(false);

  const chatBackActive = useRef(false);

  const [messages, setMessages] = useReconciledState<ChatMessage[]>([]);

  const activeChatId = useRef<number | null>(null);

  activeChatId.current = activeChat?.id || null;

  const chatRequestVersion = useRef(0);

  const messageRequestVersion = useRef(0);

  const chatReadVersion = useRef(0);

  const visibleChatMessage = useRef({ chatId: 0, messageId: 0 });

  const chatReadRequests = useRef(new Set<number>());

  const chatReadCursors = useRef(new Map<number, number>());

  const [chatEditor, setChatEditor] = useState<{ kind: 'conversation' | 'message'; id: number; value: string } | null>(null);

  const loadChats = async (signal?: AbortSignal) => {
    const version = ++chatRequestVersion.current, readVersion = chatReadVersion.current;
    const chats = rows<Conversation>(await api('/conversations/', signal ? { signal } : {}));
    if (version !== chatRequestVersion.current || readVersion !== chatReadVersion.current) return;
    chats.forEach(chat => chatReadCursors.current.set(chat.id, Math.max(chatReadCursors.current.get(chat.id) || 0, chat.read_through_message_id || 0)));
    setConversations(chats);
    setActiveChat(current => current ? chats.find(chat => chat.id === current.id) || (current.event ? null : current) : null);
  };

  const markChatRead = async (id: number, messageId: number) => {
    if (chatBackActive.current || messageId <= 0) return;
    if (!messageId || activeChatId.current !== id || currentTab.current !== 'Chats' || AppState.currentState !== 'active') return;
    visibleChatMessage.current = { chatId: id, messageId: Math.max(visibleChatMessage.current.chatId === id ? visibleChatMessage.current.messageId : 0, messageId) };
    if (messageId <= (chatReadCursors.current.get(id) || 0) || chatReadRequests.current.has(id)) return;
    chatReadRequests.current.add(id); chatReadVersion.current++;
    let saved = false;
    try {
      const result = await api('/conversations/' + id + '/mark-read/', { method: 'POST', body: JSON.stringify({ message_id: messageId }) });
      chatReadCursors.current.set(id, result.read_through_message_id);
      saved = true;
      const update = (chat: Conversation) => chat.id === id ? { ...chat, ...result } : chat;
      setConversations(current => current.map(update));
      setActiveChat(current => current ? update(current) : null);
    } catch (_) { /* Keep the badge; the next poll retries what was actually visible. */ }
    finally { chatReadRequests.current.delete(id); chatReadVersion.current++; }
    if (saved) {
      void loadChats().catch(() => { });
      if (visibleChatMessage.current.chatId === id && visibleChatMessage.current.messageId > messageId) void markChatRead(id, visibleChatMessage.current.messageId);
    }
  };

  const loadMessages = async (id: number) => {
    const version = ++messageRequestVersion.current;
    const result = rows<ChatMessage>(await api('/messages/?conversation=' + id));
    if (version !== messageRequestVersion.current || activeChatId.current !== id || currentTab.current !== 'Chats' || AppState.currentState !== 'active') return;
    setMessages(result);
    outbox.reconcile(result);
    if (visibleChatMessage.current.chatId === id) void markChatRead(id, visibleChatMessage.current.messageId);
  };

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
          const offline = (chat: Conversation) => ({ ...chat, participants: chat.participants.map(person => ({ ...person, is_online: false })) });
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
    setMessages([]);
    visibleChatMessage.current = { chatId: activeChat?.id || 0, messageId: 0 };
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat) { setMessages([]); setChatMembersOpen(false); return; }
    if (!token || tab !== 'Chats' || !appActive) return;
    void loadMessages(activeChat.id).catch(error => Alert.alert('Could not load chat', error.message));
    const timer = setInterval(() => void loadMessages(activeChat.id).catch(() => { }), 4000);
    return () => clearInterval(timer);
  }, [activeChat?.id, token, tab, appActive]);

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

  const outbox = useChatOutbox<User>({
    session: token, sender: me, api, onSent: (sent, conversationId) => {
      if (activeChatId.current === conversationId) {
        setMessages(current => current.some(item => item.id === sent.id) ? current : [...current, sent]);
        void loadMessages(conversationId).catch(() => { });
      }
      void loadChats().catch(() => { });
    }
  });

  const showFailedMessage = (item: ChatMessage) => {
    if (!item.client_id || item.delivery_status !== 'failed') return;
    Alert.alert('Message not sent', item.error || 'Check your connection and try again.', [
      { text: 'Retry', onPress: () => outbox.retry(item.client_id!) },
      { text: 'Remove', style: 'destructive', onPress: () => outbox.discard(item.client_id!) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showChatOptions = () => {
    if (!activeChat) return;
    Alert.alert('Chat options', activeChat.event ? 'This group includes the host and accepted participants. Its name follows the event.' : 'A chat name is shared with the other participants. Removing a chat only clears it from your inbox.', [
      ...(activeChat.is_group ? [{ text: 'View participants', onPress: () => setChatMembersOpen(true) }] : []),
      ...(!activeChat.event ? [{ text: 'Edit chat name', onPress: () => setChatEditor({ kind: 'conversation' as const, id: activeChat.id, value: activeChat.title || '' }) }] : []),
      { text: 'Remove from my inbox', style: 'destructive', onPress: () => void api('/conversations/' + activeChat.id + '/', { method: 'DELETE' }).then(async () => { setActiveChat(null); setMessages([]); await loadChats(); }).catch((error: any) => Alert.alert('Could not remove chat', error.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showMessageOptions = (item: ChatMessage) => {
    if (item.id < 0) { showFailedMessage(item); return; }
    if (!item.deleted_for_everyone) setMessageOptions(item);
  };

  const deleteMessage = async (id: number, scope: 'me' | 'everyone') => {
    if (!activeChat) return;
    try {
      await api('/messages/' + id + '/?scope=' + scope, { method: 'DELETE' });
      await Promise.all([loadMessages(activeChat.id), loadChats()]);
    } catch (error: any) { Alert.alert('Could not delete message', error.message); }
  };

  const saveChatEditor = async (draft: NonNullable<typeof chatEditor>) => {
    if (!chatEditor) return;
    const value = draft.value.trim();
    if (draft.kind === 'message' && !value) {
      Alert.alert('Message required', 'A message cannot be empty. Delete it instead if you no longer want to keep it.');
      return;
    }
    try {
      if (draft.kind === 'conversation') {
        const conversation = await api('/conversations/' + draft.id + '/', { method: 'PATCH', body: JSON.stringify({ title: value }) });
        setActiveChat(conversation);
        await loadChats();
      } else {
        await api('/messages/' + draft.id + '/', { method: 'PATCH', body: JSON.stringify({ body: value }) });
        if (activeChat) await Promise.all([loadMessages(activeChat.id), loadChats()]);
      }
      setChatEditor(null);
    } catch (error: any) { Alert.alert('Could not save change', error.message); }
  };

  const outboxActions = useStableActions({ enqueue: outbox.enqueue, retry: outbox.retry, discard: outbox.discard, reconcile: outbox.reconcile });

  const chatOutbox = useMemo(() => ({ ...outboxActions, entries: outbox.entries }), [outboxActions, outbox.entries]);

  useEffect(() => {
    if (token) return;
    chatRequestVersion.current++; chatReadVersion.current++;
    chatReadCursors.current.clear(); chatReadRequests.current.clear();
    visibleChatMessage.current = { chatId: 0, messageId: 0 };
    setConversations([]); chatDraftCache.current = {};
  }, [token]);

  return { conversations, setConversations, activeChat, setActiveChat, chatMembersOpen, setChatMembersOpen, chatBackActive, messages, setMessages, activeChatId, chatEditor, setChatEditor, messageOptions, setMessageOptions, chatDraftCache, loadChats, markChatRead, loadMessages, openChat, showFailedMessage, showChatOptions, showMessageOptions, deleteMessage, saveChatEditor, outbox: chatOutbox };
}
