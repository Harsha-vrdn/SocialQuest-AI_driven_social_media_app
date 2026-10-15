import { ActivityIndicator, Text, View, type ViewProps } from 'react-native';
import { getAppStyles } from '../appStyles';
import { useTheme } from '../ThemeProvider';

function Empty({ icon, title, body, style, loading, ...viewProps }: ViewProps & { icon: string; title: string; body: string; loading?: boolean }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  // Preserve any layout and measurement props supplied by the parent list.
  if (loading) return <View {...viewProps} accessibilityRole="progressbar" accessibilityLabel="Loading" style={[styles.empty, style]}>
    <ActivityIndicator color={colors.accent} />
    <Text style={styles.emptyBody}>Loading…</Text>
  </View>;
  return <View {...viewProps} style={[styles.empty, style]}>
    <Text style={styles.emptyIcon}>{icon}</Text>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
  </View>;
}


export { Empty };
