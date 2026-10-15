import { memo } from 'react';
import { Text, View } from 'react-native';
import { getAppStyles } from '../appStyles';
import { EventArtwork } from '../EventArtwork';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { EventItem, User } from '../types';
import { shallowEqualProps } from '../utils/memo';
import { dateOf, nameOf } from '../utils/social';

type Props = { item: EventItem; openEvent: (id: number) => void; setSelectedUser: (user: User) => void };

export const EventCard = memo(function EventCard({ item, openEvent, setSelectedUser }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const going = item.my_attendance_status === 'ACCEPTED';
  const attendanceLabel = going ? '✓ Going' : item.my_attendance_status === 'PENDING' ? '⏳ Requested' : item.my_attendance_status === 'INVITED' ? '✉ Invited' : '';
  return <View style={[styles.eventCard, going && styles.eventCardGoing]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + item.name + (attendanceLabel ? ', ' + attendanceLabel : '')} onPress={() => void openEvent(item.id)}>
      <EventArtwork image={item.cover_image} date={dateOf(item.starts_at)} live={item.quest_status === 'ACTIVE'} alternate={item.id % 2 === 0} />
      <View style={styles.eventText}>
        {attendanceLabel ? <Text style={[styles.eventAttendanceBadge, going && styles.eventGoingBadge]}>{attendanceLabel}</Text> : null}
        <Text style={styles.eventName}>{item.name}</Text>
        <Text style={styles.eventMeta}>{item.location_name} · {item.accepted_count}/{item.capacity} going</Text>
        {item.recommendation_reason ? <Text style={styles.eventRecommendation}>For you · {item.recommendation_reason}</Text> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.host) + "'s profile"} style={styles.eventHostLink} onPress={() => setSelectedUser(item.host)}>
      <Text style={[styles.hostMeta, styles.eventHostLinkText]}>Hosted by {nameOf(item.host)} · ★ {item.host.karma ?? 0}</Text>
    </Pressable>
  </View>;
}, shallowEqualProps);
