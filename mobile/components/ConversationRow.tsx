import { memo } from 'react';
import { Text, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../appStyles';
import { Avatar } from '../components/Avatar';
import { GroupAvatar } from '../components/GroupAvatar';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { Conversation, User } from '../types';
import { UnreadBadge } from '../UnreadBadge';
import { shallowEqualProps } from '../utils/memo';
import { dateOf } from '../utils/social';

type Props = { item: Conversation; me: User | null; appActive: boolean; setActiveChat: (chat: Conversation) => void; setChatMembersOpen: (open: boolean) => void; setSelectedUser: (user: User) => void };

export const ConversationRow = memo(function ConversationRow({ item, me, appActive, setActiveChat, setChatMembersOpen, setSelectedUser }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  return <Pressable accessibilityRole="button"
    accessibilityLabel={'Open chat: ' + item.display_name + (item.unread_count ? ', ' + item.unread_count + ' unread messages' : '')}
    style={[styles.conversation, item.unread_count > 0 && styles.conversationUnread]} onPress={() => setActiveChat(item)}
    onLongPress={() => { if (item.is_group) { setActiveChat(item); setChatMembersOpen(true); return; } const person = item.participants.find(person => person.id !== me?.id); if (person) setSelectedUser(person); }}>
    {item.is_group ? <GroupAvatar /> : <Avatar user={item.participants.find(person => person.id !== me?.id)} />}
    <View style={styles.conversationCopy}>
      <View style={styles.conversationTop}>
        <Text numberOfLines={1} style={styles.personName}>{item.display_name}</Text>
        <View style={styles.conversationTrailing}>
          <Text style={styles.conversationTime}>{item.latest_message ? dateOf(item.latest_message.created_at) : ''}</Text>
          <UnreadBadge count={item.unread_count || 0} />
        </View>
      </View>
      <Text numberOfLines={1} style={styles.personMeta}>{item.latest_message?.deleted_for_everyone ? 'Message deleted' : item.latest_message?.body || (item.latest_message?.attachment ? 'Encrypted attachment' : '') || (item.is_group ? 'Say hello to your event group' : 'Start with a simple hello')}</Text>
      {item.is_group ? <Text style={styles.personMeta}>{item.participants.length} participants · {item.event ? 'Event group' : 'Group chat'}</Text> : null}
      {appActive && item.participants.some(person => person.id !== me?.id && person.is_online) ? <Text style={socialStyles.online}>● Online</Text> : null}
    </View>
  </Pressable>;
}, shallowEqualProps);
