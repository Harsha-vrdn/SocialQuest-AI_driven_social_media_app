import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../appStyles';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Empty';
import { PostCard } from '../components/PostCard';
import { SearchIcon } from '../components/SearchIcon';
import { EventArtwork } from '../EventArtwork';
import { GlassBackdrop } from '../GlassBackdrop';
import { useListContentStyle } from '../hooks/useListContentStyle';
import { usePostActions } from '../hooks/usePostActions';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable, makeRevealCell } from '../Motion';
import { useTheme } from '../ThemeProvider';
import { dateOf, nameOf } from '../utils/social';

type Props = Pick<SocialQuestController, 'posts' | 'me' | 'events' | 'refresh' | 'loadFeed' | 'refreshing' | 'accountLoading' | 'setSearchFocusRequest' | 'setTab' | 'findNearbyEvents' | 'openEvent' | 'openComposer' | 'toggleLike' | 'beginEditPost' | 'deletePost' | 'shareResource' | 'openComments' | 'setSelectedUser' | 'reportPost'> & { bottomContentInset: number; notificationsEnabled: boolean };

const FeedCell = makeRevealCell('feed');

export const HomeScreen = memo(function HomeScreen({ posts, me, events, refresh, loadFeed, refreshing, accountLoading, setSearchFocusRequest, setTab, findNearbyEvents, openEvent, openComposer, notificationsEnabled, toggleLike, beginEditPost, deletePost, shareResource, openComments, setSelectedUser, reportPost, bottomContentInset }: Props) {
  const postActions = usePostActions({ toggleLike, beginEditPost, deletePost, shareResource, openComments, setSelectedUser, reportPost });
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const mainListContentStyle = useListContentStyle(styles, bottomContentInset);
  const home = <FlatList data={posts}
    CellRendererComponent={FeedCell}
    keyExtractor={item => String(item.id)}
    contentContainerStyle={[mainListContentStyle, styles.postList]}
    scrollIndicatorInsets={{ bottom: bottomContentInset }}
    onRefresh={() => void refresh(loadFeed)}
    refreshing={refreshing}
    ListHeaderComponent={<View style={[styles.intro, styles.listCopy]}>
      <View style={socialStyles.homeHeading}>
        <Text style={styles.eyebrow}>YOUR NEXT ADVENTURE</Text>
        <Pressable accessibilityRole="button"
          accessibilityLabel="Search events or people"
          style={socialStyles.searchIconButton} onPress={() => { setSearchFocusRequest(value => value + 1); setTab('Explore'); }}>
          <GlassBackdrop native radius={16} /><SearchIcon />
        </Pressable>
      </View>
      <Text style={styles.homeGreeting}>Hello,</Text>
      <Text style={styles.title}>{nameOf(me)} <Text style={styles.homeSpark}>✦</Text></Text>
      <View style={styles.questFilters}>
        <Pressable accessibilityLabel="For you"
          accessibilityRole="button"
          accessibilityState={{ selected: true }}
          style={[styles.questFilter, styles.questFilterActive]} onPress={() => void refresh(loadFeed)}>
          <Text style={[styles.questFilterText, styles.questFilterTextActive]}>For you</Text>
        </Pressable>
        <Pressable accessibilityLabel="Nearby" accessibilityRole="button" style={styles.questFilter} onPress={() => void findNearbyEvents()}>
          <Text style={styles.questFilterText}>Nearby</Text>
        </Pressable>
        <Pressable accessibilityLabel="Reels" accessibilityRole="button" style={styles.questFilter} onPress={() => setTab('Reels')}>
          <Text style={styles.questFilterText}>Reels</Text>
        </Pressable>
      </View>
      <View style={styles.questSectionHeader}>
        <Text style={styles.questSectionTitle}>Recommended quests</Text>
        <Pressable accessibilityLabel="See all" accessibilityRole="button" onPress={() => setTab('Explore')}>
          <Text style={styles.questSeeAll}>See all</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Recommended quests" contentContainerStyle={styles.mobileQuestDeck}>
        {events.slice(0, 2).map((event, index) => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + event.name} key={event.id} style={styles.mobileQuestCard} onPress={() => void openEvent(event.id)}>
          <EventArtwork image={event.cover_image} date={dateOf(event.starts_at)} live={event.quest_status === 'ACTIVE'} alternate={index % 2 === 1} compact />
          <View style={styles.mobileQuestCopy}>
            <Text numberOfLines={2} style={styles.mobileQuestName}>{event.name}</Text>
            <Text numberOfLines={1} style={styles.mobileQuestMeta}>{event.location_name}</Text>
            <Text style={styles.mobileQuestXp}>{event.accepted_count}/{event.capacity} going</Text>
          </View>
        </Pressable>)}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Share a moment" style={styles.homeComposer} onPress={() => openComposer(null)}>
        <Avatar user={me} />
        <View style={styles.homeComposerCopy}>
          <Text style={styles.homeComposerPrompt}>A moment worth sharing?</Text>
          <View style={socialStyles.homeComposerActionRow}>
            <Ionicons name="add-circle-outline" size={17} color={colors.accent} />
            <Text style={styles.homeComposerAction}>Share a photo, reel, or thought</Text>
          </View>
        </View>
      </Pressable>
      {!notificationsEnabled ? <Pressable accessibilityRole="button" accessibilityLabel="Set up notifications" style={styles.notificationNudge} onPress={() => setTab('Settings')}>
        <Ionicons name="notifications-outline" size={19} color={colors.muted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.notificationNudgeTitle}>Stay in the loop</Text>
          <Text style={styles.personMeta}>A heads-up for your next adventure.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable> : null}
    </View>}
    ListEmptyComponent={<View style={styles.listCopy}><Empty loading={accountLoading} icon="✦" title="Your feed is ready." body="Share a moment from your next adventure." /></View>}
    renderItem={({ item }) => <PostCard {...postActions} post={item} mine={item.author.id === me?.id} />} />;

  return home;
});
