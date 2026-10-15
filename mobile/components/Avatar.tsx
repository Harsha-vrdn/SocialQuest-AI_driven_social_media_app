import { Image, Text, View } from 'react-native';
import { getAppStyles } from '../appStyles';
import { useTheme } from '../ThemeProvider';
import type { User } from '../types';
import { initial, nameOf } from '../utils/social';

export function Avatar({ user, large = false, size }: { user?: User | null; large?: boolean; size?: number }) {
  const { theme } = useTheme();
  const { accents } = theme;
  const avatarAccents = [accents.purple, accents.sky, accents.rose, accents.mint, accents.gold];
  const styles = getAppStyles(theme);
  const tone = avatarAccents[Math.abs(user?.id || 0) % avatarAccents.length];
  const avatarStyle = [styles.avatar, large && styles.avatarLarge, size !== undefined && {width: size, height: size, borderRadius: size / 2}];
  return user?.avatar
    ? <Image accessible accessibilityLabel={nameOf(user) + "'s profile photo"} style={avatarStyle} source={{ uri: user.avatar }} />
    : <View style={[avatarStyle, { backgroundColor: tone.surface }]}>
      <Text style={[styles.avatarText, { color: tone.text }, large && styles.avatarLargeText]}>{initial(user)}</Text>
    </View>;
}

