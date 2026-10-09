import {StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {colors, fonts} from './theme';

export function QuestAttribution({quest, event}: {quest?: string; event?: string}) {
  if (!quest && !event) return null;
  return <View style={s.row}><Ionicons name="sparkles-outline" size={13} color={colors.gold} /><Text style={s.text}>{[event, quest].filter(Boolean).join(' · ')}</Text></View>;
}

const s = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8},
  text: {fontFamily: fonts.copy, color: colors.muted, fontSize: 13, lineHeight: 18, flex: 1},
});
