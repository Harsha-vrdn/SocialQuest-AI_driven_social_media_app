import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { getAppStyles } from '../appStyles';
import { Empty } from '../components/Empty';
import { useListContentStyle } from '../hooks/useListContentStyle';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable, makeRevealCell } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { NotificationItem } from '../types';
import { dateOf } from '../utils/social';

type Props = Pick<SocialQuestController, 'notifications' | 'refresh' | 'loadNotifications' | 'refreshing' | 'accountLoading' | 'markNotificationsRead' | 'openNotification'> & { bottomContentInset: number };

const AlertCell = makeRevealCell('alert');

export const NotificationsScreen = memo(function NotificationsScreen({ notifications, refresh, loadNotifications, refreshing, accountLoading, markNotificationsRead, openNotification, bottomContentInset }: Props) {
  const { theme } = useTheme();
  const { accents } = theme;
  const styles = getAppStyles(theme);
  const mainListContentStyle = useListContentStyle(styles, bottomContentInset);
  const notificationAccent = (kind: NotificationItem['kind']) => kind === 'COMMENT_REPLY' ? accents.purple
    : kind === 'RSVP_ACCEPTED' || kind === 'INVITE_ACCEPTED' ? accents.mint
      : kind === 'RSVP_DENIED' ? accents.danger : accents.purple;
  const notificationsView = <FlatList data={notifications}
    CellRendererComponent={AlertCell}
    keyExtractor={item => String(item.id)}
    contentContainerStyle={mainListContentStyle}
    scrollIndicatorInsets={{ bottom: bottomContentInset }}
    onRefresh={() => void refresh(loadNotifications)}
    refreshing={refreshing}
    ListHeaderComponent={<View style={styles.intro}>
      <Text style={styles.eyebrow}>STAY IN THE LOOP</Text>
      <Text style={styles.title}>Your <Text style={styles.serif}>notifications.</Text></Text>
      <Text style={styles.copy}>Comment replies, RSVP activity, and host decisions appear here.</Text>
      <Pressable accessibilityLabel="Mark all read" accessibilityRole="button" style={styles.outline} onPress={() => void markNotificationsRead()}>
        <Text style={styles.outlineText}>Mark all read</Text>
      </Pressable>
    </View>}
    ListEmptyComponent={<Empty loading={accountLoading} icon="✦" title="Nothing new yet." body="Comment replies and RSVP activity will show up here." />}
    renderItem={({ item }) => <Pressable accessibilityRole="button"
      accessibilityLabel={(item.is_read ? '' : 'Unread notification: ') + item.text}
      style={[styles.notificationCard, !item.is_read && styles.notificationUnread]} onPress={() => void openNotification(item)}>
      <View style={[styles.notificationIcon, { backgroundColor: notificationAccent(item.kind).surface }]}>
        <Ionicons name={item.kind === 'COMMENT_REPLY' ? 'chatbubble-ellipses-outline' : 'notifications-outline'} size={21} color={notificationAccent(item.kind).text} />
      </View>
      <View style={styles.notificationCopy}>
        {!item.is_read ? <Text style={styles.unreadLabel}>● Unread</Text> : null}
        <Text style={styles.notificationText}>{item.text}</Text>
        <Text style={styles.personMeta}>{item.event?.name || (item.kind === 'COMMENT_REPLY' ? 'Open replies' : 'SocialQuest')} · {dateOf(item.created_at)}</Text>
      </View>
    </Pressable>} />;

  return notificationsView;
});
