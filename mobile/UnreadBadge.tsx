import {Text} from 'react-native';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';

export function UnreadBadge({count, label = 'unread messages'}: {count: number; label?: string}) {
  const {theme} = useTheme();
  if (!count) return null;
  return <Text accessibilityLabel={`${count} ${label}`} style={getStyles(theme).badge}>{count > 99 ? '99+' : count}</Text>;
}

const getStyles = createThemedStyles(({colors}) => ({
  badge: {overflow: 'hidden', backgroundColor: colors.unread, color: colors.onUnread, borderRadius: 12,
    minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, textAlign: 'center', alignSelf: 'center',
    fontFamily: fonts.bold, fontSize: 12, lineHeight: 18},
}));
