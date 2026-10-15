import {Ionicons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import {VideoView} from 'expo-video';
import {memo, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Animated, ScrollView, StyleSheet, Text, View, type GestureResponderEvent} from 'react-native';
import {useReelPlayback} from '../hooks/useReelPlayback';
import {LikeFeedback, SoftPressable as Pressable, useReducedMotion} from '../Motion';
import {RelativeTime} from '../PostTime';
import {QuestAttribution} from '../QuestAttribution';
import {ReelActions} from '../ReelActions';
import {getReelStyles} from '../reelStyles';
import {useTheme} from '../ThemeProvider';
import type {Post, User} from '../types';
import {shallowEqualProps} from '../utils/memo';
import {nameOf} from '../utils/social';
import {Avatar} from './Avatar';

type Props = {
  item: Post; itemHeight: number; isActive: boolean;
  toggleLike: (post: Post) => void; openComments: (post: Post) => void;
  shareResource: (title: string, message: string, path: string) => void;
  setSelectedUser: (user: User) => void;
};

// A replaced video source gets a fresh player, buffering state and gesture timers.
export const ReelItem = memo(function ReelItem(props: Props) {
  return <ReelSlide key={props.item.media ?? 'no-video'} {...props} />;
}, shallowEqualProps);

function ReelSlide({item, itemHeight, isActive, toggleLike, openComments, shareResource, setSelectedUser}: Props) {
  const {theme} = useTheme();
  const styles = getReelStyles(theme);
  const reduced = useReducedMotion();
  const {player, status, isPlaying, paused, loading, togglePlayback, onFirstFrameRender} = useReelPlayback(item.media, isActive);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [feedback, setFeedback] = useState<'play' | 'pause' | null>(null);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const [heartBurst, setHeartBurst] = useState<{id: number; x: number; y: number} | null>(null);
  const sequence = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useRef(0);
  const compact = itemHeight < 400;
  const caption = item.body || 'A moment worth keeping.';

  useEffect(() => {
    if (!isActive) {setHeartBurst(null); setFeedback(null); setExpanded(false);}
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (heartTimer.current) clearTimeout(heartTimer.current);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      tapTimer.current = null;
      feedbackOpacity.stopAnimation();
    };
  }, [isActive, feedbackOpacity]);

  const handleVideoPress = (event: GestureResponderEvent) => {
    if (!isActive || !item.media) return;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!item.liked_by_me) toggleLike(item);
      setHeartBurst({id: ++sequence.current,
        x: Math.max(48, Math.min(width.current - 48, event.nativeEvent.locationX)),
        y: Math.max(48, Math.min(itemHeight - 48, event.nativeEvent.locationY))});
      if (heartTimer.current) clearTimeout(heartTimer.current);
      heartTimer.current = setTimeout(() => setHeartBurst(null), 700);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      const nextPaused = togglePlayback();
      if (nextPaused === null) return;
      setFeedback(nextPaused ? 'pause' : 'play');
      feedbackOpacity.stopAnimation();
      feedbackOpacity.setValue(1);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      if (reduced) {
        feedbackTimer.current = setTimeout(() => setFeedback(null), 450);
      } else {
        Animated.sequence([Animated.delay(180), Animated.timing(feedbackOpacity, {toValue: 0, duration: 270, useNativeDriver: true})])
          .start(({finished}) => {if (finished) setFeedback(null);});
      }
    }, 230);
  };

  return <View style={[styles.page, {height: itemHeight}]} onLayout={event => {width.current = event.nativeEvent.layout.width;}}>
    {item.media ? <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false}
      surfaceType="textureView" allowsPictureInPicture={false} allowsVideoFrameAnalysis={false}
      pointerEvents="none" accessible={false} onFirstFrameRender={onFirstFrameRender} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play reel' : 'Pause reel'}
      accessibilityHint="Tap to play or pause. Double-tap to like. Swipe up for the next reel."
      accessibilityState={{disabled: !isActive || !item.media, selected: isPlaying}}
      disabled={!isActive || !item.media} feedback="none" style={StyleSheet.absoluteFill} onPress={handleVideoPress} />
    <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gradient} />
    {loading ? <View pointerEvents="none" style={[styles.center, styles.loading]} accessibilityRole="progressbar" accessibilityLabel="Loading reel">
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={styles.statusText}>Loading reel…</Text>
    </View> : !item.media || status === 'error' ? <View pointerEvents="none" style={[styles.center, styles.loading]}>
      <Ionicons name="videocam-off-outline" size={40} color="#FFFFFF" />
      <Text style={styles.statusText}>Video unavailable. Swipe for the next reel.</Text>
    </View> : null}
    {feedback ? <Animated.View pointerEvents="none" accessible={false} style={[styles.center, {opacity: feedbackOpacity}]}>
      <View style={styles.feedback}><Ionicons name={feedback} size={40} color="#FFFFFF" /></View>
    </Animated.View> : null}
    {heartBurst ? <LikeFeedback key={heartBurst.id} style={[styles.heart, {left: heartBurst.x - 48, top: heartBurst.y - 48}]}>
      <Ionicons name="heart" size={88} color="#FFFFFF" />
    </LikeFeedback> : null}
    <View pointerEvents="box-none" style={[styles.meta, compact && styles.compactMeta]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(item.author) + "'s profile"}
        style={styles.author} onPress={() => setSelectedUser(item.author)}>
        <Avatar user={item.author} />
        <Text style={styles.username} numberOfLines={1}>@{item.author.username}</Text>
      </Pressable>
      <View>
        <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
          style={[styles.caption, styles.captionMeasure]} onTextLayout={event => setTruncated(event.nativeEvent.lines.length > 3)}>{caption}</Text>
        {expanded ? <ScrollView style={{maxHeight: itemHeight * 0.35}} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.caption}>{caption}</Text>
        </ScrollView> : <Text style={styles.caption} numberOfLines={3}>{caption}</Text>}
        {truncated || expanded ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse reel caption' : 'Show full reel caption'}
          accessibilityState={{expanded}} style={styles.moreButton} onPress={() => setExpanded(value => !value)}>
          <Text style={styles.moreText}>{expanded ? 'less' : 'more'}</Text>
        </Pressable> : null}
      </View>
      <QuestAttribution quest={item.quest_title} event={item.event_name} overlay />
      <RelativeTime value={item.created_at} style={styles.timestamp} />
    </View>
    <View pointerEvents="box-none" style={[styles.rail, compact && styles.compactRail]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'View ' + nameOf(item.author) + "'s profile"}
        style={styles.profileButton} onPress={() => setSelectedUser(item.author)}><Avatar user={item.author} /></Pressable>
      <ReelActions vertical compact={compact} liked={!!item.liked_by_me}
        likes={item.like_count} comments={item.comment_count}
        onLike={() => void toggleLike(item)}
        onComments={() => void openComments(item)}
        onShare={() => void shareResource('A SocialQuest reel', 'Come see this community reel on SocialQuest.', '/s/post/' + item.id + '/')} />
    </View>
  </View>;
}
