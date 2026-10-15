import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../appStyles';
import { Empty } from '../components/Empty';
import { PostCard } from '../components/PostCard';
import { GlassBackdrop } from '../GlassBackdrop';
import { usePostActions } from '../hooks/usePostActions';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';
import type { Post } from '../types';
import { iconLabelRow } from '../utils/social';

export type ProfileContentProps = Pick<SocialQuestController, 'hostedEvents' | 'joinedEvents' | 'profilePostsOwner' | 'profileUserId' | 'profilePosts' | 'profileSection' | 'setProfileSection' | 'profilePostsLoading' | 'profilePostsError' | 'me' | 'toggleLike' | 'beginEditPost' | 'deletePost' | 'shareResource' | 'openComments' | 'setSelectedUser' | 'refreshVisibleProfile' | 'reportPost'>;

export function useProfileContent({ hostedEvents, joinedEvents, profilePostsOwner, profileUserId, profilePosts, profileSection, setProfileSection, profilePostsLoading, profilePostsError, me, toggleLike, beginEditPost, deletePost, shareResource, openComments, setSelectedUser, refreshVisibleProfile, reportPost }: ProfileContentProps) {
  const postActions = usePostActions({ toggleLike, beginEditPost, deletePost, shareResource, openComments, setSelectedUser, reportPost });
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  const ownProfileEvents = [...hostedEvents, ...joinedEvents.filter(event => !hostedEvents.some(hosted => hosted.id === event.id))];
  const visibleProfilePosts = profilePostsOwner === profileUserId ? profilePosts : [];
  const filteredProfilePosts = visibleProfilePosts.filter(post => post.kind === profileSection);
  const renderProfilePost = (post: Post) => <PostCard {...postActions} post={post} mine={post.author.id === me?.id} />;
  const profileTabs = (includeEvents: boolean) => <View style={socialStyles.profileTabs}>
    {(['POST', 'REEL', ...(includeEvents ? ['EVENTS'] : [])] as Array<'POST' | 'REEL' | 'EVENTS'>).map(section => {
      const label = section === 'POST' ? 'Posts' : section === 'REEL' ? 'Reels' : 'Events';
      const count = section === 'EVENTS' ? ownProfileEvents.length : visibleProfilePosts.filter(post => post.kind === section).length;
      return <Pressable key={section}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: profileSection === section }}
        style={[socialStyles.profileTab, profileSection === section && socialStyles.profileTabActive]} onPress={() => setProfileSection(section)}>
        <GlassBackdrop accent={profileSection === section} />
        <Text style={[socialStyles.profileTabText, profileSection === section && socialStyles.profileTabTextActive]}>{label}</Text>
        <Text style={[socialStyles.profileTabCount, profileSection === section && socialStyles.profileTabTextActive]}>{section !== 'EVENTS' && (profilePostsLoading || profilePostsError) ? '—' : count}</Text>
      </Pressable>;
    })}
  </View>;
  const profileLoadNotice = profileSection !== 'EVENTS' && (profilePostsLoading || profilePostsError) ? <View style={socialStyles.profileNotice}>
    <Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{profilePostsLoading ? 'Loading quest moments…' : profilePostsError}</Text>
    {profilePostsError && !profilePostsLoading ? <Pressable accessibilityLabel="Try again" accessibilityRole="button" style={[styles.secondary, iconLabelRow]} onPress={() => void refreshVisibleProfile()}>
      <Ionicons name="refresh-outline" size={18} color={colors.text} />
      <Text style={styles.secondaryText}>Try again</Text>
    </Pressable> : null}
  </View> : null;
  const profileEmpty = !profilePostsLoading && !profilePostsError ? <View style={styles.listCopy}><Empty icon={profileSection === 'REEL' ? '◉' : '✦'}
    title={profileSection === 'REEL' ? 'No reels yet.' : 'No posts yet.'}
    body={profileUserId === me?.id ? 'Share a moment from your next quest. It will appear here.' : 'This adventurer hasn’t shared any visible moments here yet.'} /></View> : null;

  return { ownProfileEvents, filteredProfilePosts, renderProfilePost, profileTabs, profileLoadNotice, profileEmpty };
}
