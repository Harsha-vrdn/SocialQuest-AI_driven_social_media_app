import { Text, View } from 'react-native';
import { getAppStyles } from '../appStyles';
import { SoftPressable as Pressable } from '../Motion';
import { type Accent } from '../theme';
import { useTheme } from '../ThemeProvider';

export function Score({ label, value, onPress, tone = 'purple' }: { label: string; value: string; onPress?: () => void; tone?: Accent }) {
  const { theme } = useTheme();
  const { accents } = theme;
  const styles = getAppStyles(theme);
  const accent = accents[tone];
  const cardStyle = [styles.score, { backgroundColor: accent.surface, borderColor: accent.border }];
  const content = <><Text style={[styles.scoreValue, { color: accent.text }]}>{value}</Text><Text style={styles.scoreLabel}>{label}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={value + ' ' + label.replace(' ›', '').toLowerCase()} style={cardStyle} onPress={onPress}>
    {content}
  </Pressable> : <View style={cardStyle}>
    {content}
  </View>;
}

