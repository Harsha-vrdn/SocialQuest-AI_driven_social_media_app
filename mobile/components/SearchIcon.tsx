import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeProvider';

export function SearchIcon() {
  const { theme } = useTheme();
  const { colors } = theme;
  return <Ionicons name="search-outline" size={22} color={colors.text} accessible={false} />;
}
