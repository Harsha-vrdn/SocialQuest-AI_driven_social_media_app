import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { FlatList, Keyboard, Platform, ScrollView, Text, View } from 'react-native';
import { getAppStyles, getGlassStyles, getSocialStyles } from '../appStyles';
import { ChatAttachmentBubble } from '../ChatAttachments';
import { Avatar } from '../components/Avatar';
import { ChatComposer } from '../components/ChatComposer';
import { ConversationRow } from '../components/ConversationRow';
import { Empty } from '../components/Empty';
import { GroupAvatar } from '../components/GroupAvatar';
import { GlassBackdrop, useLiquidGlass } from '../GlassBackdrop';
import { useListContentStyle } from '../hooks/useListContentStyle';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { KeyboardLift } from '../KeyboardLift';
import { MessageList } from '../MessageList';
import { MessageStatus } from '../MessageStatus';
import { SoftPressable as Pressable, makeRevealCell } from '../Motion';
import { SwipeBackView } from '../SwipeBackView';
import { useTheme } from '../ThemeProvider';
import type { ChatMessage } from '../types';
import { UnreadBadge } from '../UnreadBadge';
import { nameOf } from '../utils/social';

type Props = Pick<SocialQuestController, 'conversations' | 'activeChat' | 'following' | 'refresh' | 'loadChats' | 'refreshing' | 'accountLoading' | 'me' | 'openChat' | 'setSelectedUser' | 'setActiveChat' | 'setChatMembersOpen' | 'appActive' | 'outbox' | 'messages' | 'chatBackActive' | 'markChatRead' | 'loadMessages' | 'showFailedMessage' | 'showMessageOptions' | 'attachmentClient' | 'sessionToken' | 'token' | 'activeChatId' | 'setMessages' | 'chatDraftCache' | 'showChatOptions'> & { bottomContentInset: number };

const ChatCell = makeRevealCell('chat');

export const ChatsScreen = memo(function ChatsScreen({ conversations, activeChat, following, refresh, loadChats, refreshing, accountLoading, me, openChat, setSelectedUser, setActiveChat, setChatMembersOpen, appActive, outbox, messages, chatBackActive, markChatRead, loadMessages, showFailedMessage, showMessageOptions, attachmentClient, sessionToken, token, activeChatId, setMessages, chatDraftCache, showChatOptions, bottomContentInset }: Props) {
  const [chatBackPreview, setChatBackPreviewState] = useState(false);
  const setChatBackPreview = (active: boolean) => { chatBackActive.current = active; setChatBackPreviewState(active); };
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const glassStyles = getGlassStyles(theme);
  const nativeGlass = useLiquidGlass();
  const mainListContentStyle = useListContentStyle(styles, bottomContentInset);
  const [chatHeaderHeight, setChatHeaderHeight] = useState(72);
  const [chatComposerHeight, setChatComposerHeight] = useState(72);
  const [chatKeyboardOverlap, setChatKeyboardOverlap] = useState(0);
  const unreadMessageCount = conversations.reduce((count, chat) => count + (chat.unread_count || 0), 0);
  const closeChat = () => { Keyboard.dismiss(); setActiveChat(null); };
  const activeChatPerson = activeChat?.participants.find(person => person.id !== me?.id);
  const acceptedClientIds = new Set(messages.map(item => item.client_id).filter(Boolean));
  const pendingMessages = outbox.entries.filter(item => item.conversation === activeChat?.id && !acceptedClientIds.has(item.client_id));
  const chatMessages: ChatMessage[] = [...messages, ...pendingMessages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const chatSending = pendingMessages.some(item => item.delivery_status === 'sending');
  const inbox = <FlatList data={conversations}
    CellRendererComponent={ChatCell}
    keyExtractor={item => String(item.id)}
    contentContainerStyle={mainListContentStyle}
    scrollIndicatorInsets={{ bottom: bottomContentInset }}
    onRefresh={() => void refresh(loadChats)}
    refreshing={refreshing}
    ListHeaderComponent={<View style={styles.intro}>
      <Text style={styles.eyebrow}>YOUR INBOX</Text>
      <View style={styles.chatIntroTitle}>
        <Text style={styles.title}>Messages</Text>
        <UnreadBadge count={unreadMessageCount} />
      </View>
      <Text style={styles.copy}>Keep the good energy going after you meet.</Text>
      <Text style={[styles.section, { marginTop: 22 }]}>START A NEW CHAT</Text>
      {following.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contacts}>
        {following.map(person => <Pressable accessibilityLabel={'Start chat with ' + nameOf(person)}
          accessibilityRole="button"
          key={person.id}
          style={styles.contact} onPress={() => void openChat(person)}
          onLongPress={() => setSelectedUser(person)}>
          <Avatar user={person} />
          <Text numberOfLines={1} style={styles.contactName}>{nameOf(person)}</Text>
        </Pressable>)}
      </ScrollView> : <Text style={styles.chatFollowHint}>Follow someone to start a chat with them.</Text>}
      <Text style={styles.section}>CONVERSATIONS</Text>
    </View>}
    ListEmptyComponent={<Empty loading={accountLoading} icon="✉" title="Your conversations will live here." body="Start with someone you met in Explore." />}
    renderItem={({ item }) => <ConversationRow item={item} me={me} appActive={appActive} setActiveChat={setActiveChat} setChatMembersOpen={setChatMembersOpen} setSelectedUser={setSelectedUser} />} />;
  const chats = activeChat ? <SwipeBackView key={activeChat.id} style={styles.chatScreen} preview={inbox} onBack={closeChat} onGestureActiveChange={setChatBackPreview}>
    <View onLayout={event => setChatHeaderHeight(event.nativeEvent.layout.height)} style={[styles.chatHeader, glassStyles.toolbar, nativeGlass && styles.floatingChatHeader]}>
      <GlassBackdrop native /><Pressable accessibilityRole="button"
        accessibilityLabel="Back to conversations"
        accessibilityHint={Platform.OS === 'ios' ? 'You can also swipe right from the left edge.' : 'Returns to your conversations.'}
        style={styles.chatBackButton} onPress={closeChat}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button"
        accessibilityLabel={activeChat.is_group ? 'View group participants' : 'Open ' + nameOf(activeChatPerson) + "'s profile"}
        style={styles.chatPerson} onPress={() => activeChat.is_group ? setChatMembersOpen(true) : activeChatPerson && setSelectedUser(activeChatPerson)}>
        {activeChat.is_group ? <GroupAvatar /> : <Avatar user={activeChatPerson} />}
        <View style={styles.chatIdentity}>
          <Text numberOfLines={2} style={styles.chatTitle}>{activeChat.display_name}</Text>
          <Text style={[styles.chatSubtitle, appActive && !activeChat.is_group && activeChatPerson?.is_online && socialStyles.online]}>{activeChat.is_group ? (activeChat.event ? 'Event group' : 'Group chat') + ' · ' + activeChat.participants.length + ' participants' : appActive && activeChatPerson?.is_online ? '● Online' : 'Direct conversation'}</Text>
        </View>
      </Pressable>
      <UnreadBadge count={activeChat.unread_count || 0} />
      <Pressable accessibilityRole="button" accessibilityLabel="Manage chat" style={styles.chatMenu} onPress={showChatOptions}>
        <Ionicons name="ellipsis-horizontal" size={23} color={colors.text} />
      </Pressable>
    </View>
    <KeyboardLift onLiftChange={setChatKeyboardOverlap}>
      <MessageList key={activeChat.id}
        currentUserId={me?.id}
        onReadThrough={chatBackPreview ? undefined : id => void markChatRead(activeChat.id, id)}
        style={styles.messageScroller}
        data={chatMessages}
        keyExtractor={item => item.client_id || String(item.id)}
        occludedTop={nativeGlass ? chatHeaderHeight + 8 + chatKeyboardOverlap : 0}
        occludedBottom={nativeGlass ? chatComposerHeight + 8 : 0}
        scrollIndicatorInsets={nativeGlass ? { top: chatHeaderHeight + 8, bottom: chatComposerHeight + 8 } : undefined}
        contentContainerStyle={[styles.messageList, nativeGlass && { paddingTop: chatHeaderHeight + 24, paddingBottom: chatComposerHeight + 24 }]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => void refresh(() => loadMessages(activeChat.id))}
        refreshing={refreshing}
        ListEmptyComponent={<Empty icon="✦" title="This is a new conversation." body="A thoughtful hello is plenty." />}
        renderItem={({ item }) => <Pressable accessibilityRole="button"
          accessibilityLabel={item.delivery_status === 'failed' ? 'Message not sent. Tap to retry.' : item.body || 'Message options'}
          onPress={() => showFailedMessage(item)}
          delayLongPress={300}
          onLongPress={() => showMessageOptions(item)}
          style={[styles.bubble, item.sender.id === me?.id && styles.bubbleMine]}>
          {activeChat.is_group && item.sender.id !== me?.id ? <Text style={styles.groupSender}>{nameOf(item.sender)}</Text> : null}
          {!item.deleted_for_everyone && item.attachment ? <ChatAttachmentBubble client={attachmentClient} attachment={item.attachment} conversation={activeChat.id} sender={item.sender.id} mine={item.sender.id === me?.id} /> : null}
          <Text style={[styles.bubbleText, item.sender.id === me?.id && styles.bubbleMineText, item.deleted_for_everyone && styles.bubbleDeletedText]}>{item.deleted_for_everyone ? 'Message deleted' : item.body}</Text>
          {!item.deleted_for_everyone ? <View style={styles.bubbleMeta}>
            <Text style={[styles.bubbleTime, item.sender.id === me?.id && styles.bubbleMineTime]}>{item.sender.id === me?.id ? 'You · ' : ''}{new Date(item.created_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}{item.edited_at ? ' · edited' : ''}</Text>
            {item.sender.id === me?.id ? <MessageStatus status={item.delivery_status || 'sent'} group={!!activeChat.is_group} /> : null}
          </View> : null}
        </Pressable>} />
      <ChatComposer activeChat={activeChat}
        activeChatId={activeChatId}
        chatDraftCache={chatDraftCache}
        outbox={outbox}
        attachmentClient={attachmentClient}
        me={me}
        sessionToken={sessionToken}
        token={token}
        setMessages={setMessages}
        loadMessages={loadMessages}
        loadChats={loadChats}
        chatSending={chatSending}
        setChatComposerHeight={setChatComposerHeight} />
    </KeyboardLift>
  </SwipeBackView> : inbox;

  return chats;
});
