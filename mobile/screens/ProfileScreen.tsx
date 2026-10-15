import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../appStyles';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Empty';
import { Score } from '../components/Score';
import { useProfileContent, type ProfileContentProps } from '../components/useProfileContent';
import { GlassBackdrop } from '../GlassBackdrop';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { EventItem, Post } from '../types';
import { dateOf, iconLabelRow, nameOf } from '../utils/social';

type Props = ProfileContentProps & Pick<SocialQuestController, 'profileSection' | 'refresh' | 'loadMe' | 'refreshVisibleProfile' | 'refreshing' | 'me' | 'openProfileEditor' | 'setTab' | 'openPeopleList' | 'openEvent' | 'shareResource'> & { bottomContentInset: number };


export const ProfileScreen = memo(function ProfileScreen(props: Props) {
  const { profileSection, refresh, loadMe, refreshVisibleProfile, refreshing, me, openProfileEditor, setTab, openPeopleList, openEvent, shareResource, bottomContentInset } = props;
  const { ownProfileEvents, filteredProfilePosts, renderProfilePost, profileTabs, profileLoadNotice, profileEmpty } = useProfileContent(props);

  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const profile = <FlatList<Post | EventItem>
    data={profileSection === 'EVENTS' ? ownProfileEvents : filteredProfilePosts}
    keyExtractor={item => ('kind' in item ? 'post-' : 'event-') + item.id}
    contentContainerStyle={[styles.profile, socialStyles.profileList, styles.postList, { paddingBottom: socialStyles.profileList.paddingBottom + bottomContentInset }]}
    scrollIndicatorInsets={{ bottom: bottomContentInset }}
    onRefresh={() => void refresh(async () => { await Promise.all([loadMe(), refreshVisibleProfile()]); })}
    refreshing={refreshing}
    ListHeaderComponent={<View style={styles.listCopy}>
      <View style={styles.profileTop}>
        <Avatar user={me} large />
        <View style={styles.profileIdentity}>
          <Text style={styles.eyebrow}>YOUR ADVENTURE LOG</Text>
          <Text style={styles.profileName}>{nameOf(me)}</Text>
          <Text style={styles.personMeta}>@{me?.username} · {me?.city || 'Everywhere'}</Text>
        </View>
      </View>
      <View style={styles.profileActions}>
        <Pressable accessibilityLabel="Edit profile" accessibilityRole="button" style={[styles.secondary, styles.profileEditAction, iconLabelRow]} onPress={openProfileEditor}>
          <Ionicons name="create-outline" size={18} color={colors.accent} />
          <Text style={styles.secondaryText}>Edit profile</Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          accessibilityLabel="Settings"
          accessibilityHint="Open your account and app preferences on a separate page."
          style={styles.profileSettingsButton} onPress={() => setTab('Settings')}>
          <GlassBackdrop native radius={14} /><Ionicons name="settings-outline" size={21} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.profileBio}>{me?.bio || 'Here for the little adventures that turn into real stories.'}</Text>
      <View style={styles.scores}>
        <Score tone="gold" label="XP EARNED" value={String(me?.xp || 0)} />
        <Score tone="mint" label="KARMA" value={String(me?.karma ?? 0)} />
      </View>
      <View style={socialStyles.followScores}>
        <Score tone="neutral" label="FOLLOWERS ›" value={String(me?.follower_count || 0)} onPress={() => me && openPeopleList('followers', me)} />
        <Score tone="neutral" label="FOLLOWING ›" value={String(me?.following_count || 0)} onPress={() => me && openPeopleList('following', me)} />
      </View>
      <Text style={styles.profileHelp}>XP tracks completed quests. Karma comes from fellow guests after events. Both are public and independent.</Text>
      {profileTabs(true)}
      {profileLoadNotice}
    </View>}
    ListEmptyComponent={profileSection === 'EVENTS' ? <View style={styles.listCopy}><Empty icon="⌖" title="Your quest log is ready." body="Events you host or join will appear here." /></View> : profileEmpty}
    renderItem={({ item }) => 'kind' in item ? renderProfilePost(item) : <Pressable accessibilityLabel={'Open ' + item.name} accessibilityRole="button" style={[styles.personCard, styles.insetListItem]} onPress={() => void openEvent(item.id)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.personName}>{item.name}</Text>
        <Text style={styles.personMeta}>{item.host.id === me?.id ? 'Hosting' : 'Attending'} · {dateOf(item.starts_at)} · {item.location_name}</Text>
      </View>
    </Pressable>}
    ListFooterComponent={<View style={styles.listCopy}>
      <Pressable accessibilityLabel="Share profile"
        accessibilityRole="button"
        style={[styles.secondary, iconLabelRow]} onPress={() => me && void shareResource('A SocialQuest profile', 'Meet ' + nameOf(me) + ' on SocialQuest.', '/?view=profile&profile=' + me.id)}>
        <Ionicons name="share-social-outline" size={18} color={colors.text} />
        <Text style={styles.secondaryText}>Share profile</Text>
      </Pressable>
    </View>}
  />;

  return profile;
});
