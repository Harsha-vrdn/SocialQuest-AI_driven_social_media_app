import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { memo, useEffect, useRef, useState } from 'react';
import { Alert, Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Avatar } from '../components/Avatar';
import { ImageViewer } from '../ImageViewer';
import { LikeFeedback, Pop, SoftPressable as Pressable } from '../Motion';
import { RelativeTime } from '../PostTime';
import { getPostStyles } from '../postStyles';
import { QuestAttribution } from '../QuestAttribution';
import { useTheme } from '../ThemeProvider';
import type { Post, User } from '../types';
import { shallowEqualProps } from '../utils/memo';
import { nameOf } from '../utils/social';

function InteractivePostImage({ post, onLike }: { post: Post; onLike: (post: Post) => void }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getPostStyles(theme);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHeart, setShowHeart] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (heartTimer.current) clearTimeout(heartTimer.current);
  }, []);

  const handlePress = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!post.liked_by_me) onLike(post);
      setShowHeart(true);
      if (heartTimer.current) clearTimeout(heartTimer.current);
      heartTimer.current = setTimeout(() => setShowHeart(false), 650);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setViewerOpen(true);
    }, 230);
  };

  return <><Pressable accessibilityRole="button"
    accessibilityLabel={'Open photo by ' + nameOf(post.author)}
    accessibilityHint="Open fullscreen to pinch or double-tap to zoom. Double-tap here to like."
    onPress={handlePress} feedback="none"
    style={styles.postImageTouch}>
    <Image style={styles.postImage} source={{ uri: post.media }} resizeMode="cover" />
    {showHeart ? <LikeFeedback style={styles.postMediaHeart}>
      <Ionicons name="heart" size={76} color={colors.onMedia} />
    </LikeFeedback> : null}
  </Pressable>{viewerOpen && post.media ? <ImageViewer key={post.media} uri={post.media} onClose={() => setViewerOpen(false)} /> : null}</>;
}

type PostCardProps = {
  post: Post; mine: boolean;
  onLike: (post: Post) => void; onEdit: (post: Post) => void; onDelete: (post: Post) => void;
  onShare: (post: Post) => void; onComments: (post: Post) => void; onOpenProfile: (user: User) => void;
  onReport: (post: Post, reason: string) => void;
  onLikes?: (post: Post) => void;
};

function PostCaption({post}: {post: Post}) {
  const {theme} = useTheme();
  const styles = getPostStyles(theme);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const caption = <><Text style={styles.username}>{post.author.username}</Text>{' ' + post.body}</>;
  return <View style={styles.captionBlock}>
    <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={[styles.caption, styles.captionMeasure]} onTextLayout={event => setTruncated(event.nativeEvent.lines.length > 2)}>{caption}</Text>
    <Text style={styles.caption} numberOfLines={expanded ? undefined : 2} ellipsizeMode="tail">{caption}</Text>
    {truncated || expanded ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse post caption' : 'Show full post caption'}
      accessibilityState={{expanded}} style={styles.moreButton} onPress={() => setExpanded(value => !value)}>
      <Text style={styles.moreText}>{expanded ? 'less' : '… more'}</Text>
    </Pressable> : null}
  </View>;
}

const PostCardView = function PostCard({post, onLike, mine, onEdit, onDelete, onShare, onComments, onOpenProfile, onReport, onLikes}: PostCardProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getPostStyles(theme);
  const hasQuest = !!(post.quest_title || post.event_name);
  const likes = post.like_count + (post.like_count === 1 ? ' like' : ' likes');
  const report = () => Alert.alert('Report post', 'Why are you reporting this post?', [
    {text: 'Spam or scam', onPress: () => onReport(post, 'Spam or scam')},
    {text: 'Abuse or harmful content', onPress: () => onReport(post, 'Abuse or harmful content')},
    {text: 'Cancel', style: 'cancel'},
  ]);
  const openPostOptions = () => Alert.alert('Post options', undefined, mine ? [
    {text: 'Edit', onPress: () => onEdit(post)},
    {text: 'Delete', style: 'destructive', onPress: () => onDelete(post)},
    {text: 'Cancel', style: 'cancel'},
  ] : [
    {text: 'Share', onPress: () => onShare(post)},
    {text: 'Report', onPress: report},
    {text: 'Cancel', style: 'cancel'},
  ]);
  return <View style={styles.post}>
    {post.recommendation_reason ? <Text style={styles.recommendation}>For you · {post.recommendation_reason}</Text> : null}
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(post.author) + "'s profile"} style={styles.profileLink} onPress={() => onOpenProfile(post.author)}>
        <Avatar user={post.author} size={40} />
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, styles.headerName]} numberOfLines={1}>{post.author.username}</Text>
            <RelativeTime value={post.created_at} compact prefix=" · " style={styles.headerTime} />
          </View>
          {post.location_name ? <Text style={styles.location} numberOfLines={1}>{post.location_name}</Text> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Post options" accessibilityHint="Open actions for this post."
        style={styles.options} onPress={openPostOptions}><Ionicons name="ellipsis-horizontal" size={23} color={colors.text} /></Pressable>
    </View>
    {post.media ? post.kind === 'POST' ? <InteractivePostImage key={post.media} post={post} onLike={onLike} /> : <ReelVideo key={post.media} uri={post.media} /> : null}
    <View style={styles.copy}>
      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <Pressable style={styles.action} accessibilityRole="button" accessibilityLabel={post.liked_by_me ? 'Unlike post' : 'Like post'}
            accessibilityState={{selected: !!post.liked_by_me}} accessibilityValue={{text: likes}} onPress={() => onLike(post)}>
            <Pop active={!!post.liked_by_me}><Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={28} color={post.liked_by_me ? colors.rose : colors.text} /></Pop>
          </Pressable>
          <Pressable style={styles.action} accessibilityRole="button" accessibilityLabel="Open comments"
            accessibilityValue={{text: post.comment_count + (post.comment_count === 1 ? ' comment' : ' comments')}} onPress={() => onComments(post)}>
            <Ionicons name="chatbubble-outline" size={26} color={colors.text} />
          </Pressable>
          <Pressable style={styles.action} accessibilityRole="button" accessibilityLabel="Share post" onPress={() => onShare(post)}>
            <Ionicons name="paper-plane-outline" size={27} color={colors.text} />
          </Pressable>
        </View>
        {hasQuest ? <View accessible accessibilityLabel="Quest moment" style={styles.questIndicator}>
          <Ionicons name="sparkles-outline" size={22} color={colors.gold} />
        </View> : null}
      </View>
      {onLikes && post.like_count > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={'View ' + likes} style={styles.likesButton} onPress={() => onLikes(post)}>
        <Text style={styles.likeCount}>{likes}</Text>
      </Pressable> : <Text style={styles.likeCount}>{likes}</Text>}
      {post.body ? <PostCaption key={post.id + ':' + post.body} post={post} /> : null}
      {hasQuest ? <View style={styles.attribution}><QuestAttribution quest={post.quest_title} event={post.event_name} /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Open replies" onPress={() => onComments(post)} style={styles.replies}>
        <Text style={styles.repliesText}>{post.comment_count ? 'View all ' + post.comment_count + (post.comment_count === 1 ? ' comment' : ' comments') : 'Add a comment…'}</Text>
      </Pressable>
      <RelativeTime value={post.created_at} style={styles.timestamp} />
    </View>
  </View>;
};

export const PostCard = memo(PostCardView, shallowEqualProps);

export function ReelVideo({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getPostStyles(theme);
  const player = useVideoPlayer(uri, video => {video.muted = true; video.loop = true;});
  const {muted} = useEvent(player, 'mutedChange', {muted: player.muted});
  return <View style={styles.postImageTouch}><VideoView player={player}
    nativeControls
    surfaceType="textureView"
    contentFit="cover"
    style={[styles.video, style]} />
    <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute post video' : 'Mute post video'}
      accessibilityState={{selected: !muted}} style={styles.audioButton} onPress={() => {player.muted = !player.muted;}}>
      <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={colors.onMedia} />
    </Pressable>
  </View>;
}

