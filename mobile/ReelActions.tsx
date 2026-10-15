import {Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SoftPressable as Pressable, Pop} from './Motion';
import {useTheme} from './ThemeProvider';
import {getAppStyles} from './appStyles';

export function ReelActions({liked, likes, comments, onLike, onComments, onShare, vertical = false, compact = false}: {
  liked: boolean; likes: number; comments: number;
  onLike: () => void; onComments: () => void; onShare: () => void;
  vertical?: boolean; compact?: boolean;
}) {
  const {theme} = useTheme(), {colors} = theme;
  const styles = getAppStyles(theme);
  const actionStyle = vertical ? (compact ? styles.reelCompactAction : styles.reelRailAction) : styles.reelAction;
  const textStyle = vertical ? styles.reelRailText : styles.reelActionText;
  const ink = vertical ? '#FFFFFF' : colors.text;
  const heart = vertical ? '#FF637C' : colors.rose;
  const iconSize = vertical ? (compact ? 24 : 30) : 21;
  return <View style={vertical ? (compact ? styles.reelCompactRailActions : styles.reelRailActions) : styles.postFooter}>
    <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike reel' : 'Like reel'} accessibilityState={{selected: liked}}
      accessibilityValue={{text: likes + (likes === 1 ? ' like' : ' likes')}} style={actionStyle} onPress={onLike}>
      <Pop active={liked}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={iconSize} color={liked ? heart : ink} /></Pop>
      <Text style={[textStyle, liked && {color: heart}]}>{likes}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open reel comments" accessibilityValue={{text: comments + (comments === 1 ? ' comment' : ' comments')}} style={actionStyle} onPress={onComments}>
      <Ionicons name="chatbubble-outline" size={vertical ? iconSize : 20} color={ink} /><Text style={textStyle}>{vertical ? comments : comments + (comments === 1 ? ' comment' : ' comments')}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Share reel" style={actionStyle} onPress={onShare}>
      <Ionicons name={vertical ? 'share-social-outline' : 'paper-plane-outline'} size={vertical ? iconSize : 20} color={ink} /><Text style={textStyle}>Share</Text>
    </Pressable>
  </View>;
}
