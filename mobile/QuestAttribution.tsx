import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {fonts} from './theme';

export function QuestAttribution({quest, event, overlay = false}: {quest?: string; event?: string; overlay?: boolean}) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  if (!quest && !event) return null;
  return <View style={[s.row, overlay && s.badge]}><Ionicons name="sparkles-outline" size={13} color={overlay ? '#FFFFFF' : colors.gold} /><Text style={[s.text, overlay && s.overlayText]}>{[event, quest].filter(Boolean).join(' · ')}</Text></View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8},
  text: {fontFamily: fonts.copy, color: colors.muted, fontSize: 13, lineHeight: 18, flex: 1},
  badge: {marginTop: 0, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)'},
  overlayText: {color: '#FFFFFF'},
}));
