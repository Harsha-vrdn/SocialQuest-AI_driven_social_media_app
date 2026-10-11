import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {fonts} from './theme';

export function QuestAttribution({quest, event}: {quest?: string; event?: string}) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  if (!quest && !event) return null;
  return <View style={s.row}><Ionicons name="sparkles-outline" size={13} color={colors.gold} /><Text style={s.text}>{[event, quest].filter(Boolean).join(' · ')}</Text></View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8},
  text: {fontFamily: fonts.copy, color: colors.muted, fontSize: 13, lineHeight: 18, flex: 1},
}));
