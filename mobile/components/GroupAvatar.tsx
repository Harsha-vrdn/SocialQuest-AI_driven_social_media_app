import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { getAppStyles } from '../appStyles';
import { useTheme } from '../ThemeProvider';

export function GroupAvatar() {
  const { theme } = useTheme();
  const styles = getAppStyles(theme);
  const { colors } = theme;
  return <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
    <Ionicons name="people" size={23} color={colors.accent} />
  </View>;
}

