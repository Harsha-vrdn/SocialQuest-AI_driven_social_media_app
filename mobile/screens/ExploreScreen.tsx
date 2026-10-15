import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useLayoutEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../appStyles';
import { Avatar } from '../components/Avatar';
import { EventCard } from '../components/EventCard';
import { DiscoverSearch } from '../DiscoverSearch';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { EventItem, User } from '../types';
import { nameOf } from '../utils/social';

type Props = Pick<SocialQuestController, 'api' | 'exploreDraft' | 'searchResetRequest' | 'setNearbyActive' | 'searchKind' | 'setSearchKind' | 'searchFocusRequest' | 'events' | 'eventAttendanceRevision' | 'nearbyActive' | 'findNearbyEvents' | 'openEventEditor' | 'openEvent' | 'setSelectedUser'> & { bottomContentInset: number };


export const ExploreScreen = memo(function ExploreScreen({ api, exploreDraft, searchResetRequest, setNearbyActive, searchKind, setSearchKind, searchFocusRequest, events, eventAttendanceRevision, nearbyActive, findNearbyEvents, openEventEditor, openEvent, setSelectedUser, bottomContentInset }: Props) {
  const [query, setQuery] = useState(exploreDraft.current);
  useLayoutEffect(() => { exploreDraft.current = query; }, [query]);
  useEffect(() => { setQuery(exploreDraft.current); }, [searchResetRequest]);
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const explore = <DiscoverSearch<EventItem, User> bottomInset={bottomContentInset}
    api={api}
    query={query}
    onQuery={value => { setQuery(value); if (nearbyActive) setNearbyActive(false); }}
    kind={searchKind}
    onKind={setSearchKind}
    focusRequest={searchFocusRequest}
    refreshKey={events}
    eventRevision={eventAttendanceRevision}
    nearbyEvents={nearbyActive ? events : null}
    onExplore={() => setNearbyActive(false)}
    onNearby={() => void findNearbyEvents()}
    onHost={() => openEventEditor()}
    renderEvent={item => <EventCard item={item} openEvent={openEvent} setSelectedUser={setSelectedUser} />}
    renderPerson={person => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(person) + "'s profile"} style={styles.personCard} onPress={() => setSelectedUser(person)}>
      <Avatar user={person} />
      <View style={socialStyles.personCopy}>
        <Text style={styles.personName}>{nameOf(person)}</Text>
        <Text style={styles.personMeta}>@{person.username}{person.city ? ' · ' + person.city : ''}</Text>
        <Text style={styles.personMeta}>★ {person.karma ?? 0} · {person.xp || 0} XP</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>} />;

  return explore;
});
