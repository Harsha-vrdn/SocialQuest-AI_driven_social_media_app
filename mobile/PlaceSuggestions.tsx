import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SoftPressable as Pressable} from './Motion';
import {usePlaceSuggestions, type Place} from './placeSearch';
import {fonts} from './theme';

// Tappable place list under a free-text location field.
// It stays quiet until the person types something new, so detected or saved venues don't trigger searches.
export function PlaceSuggestions({query, active = true, maxLength, onPick}: {query: string; active?: boolean; maxLength: number; onPick: (place: Place) => void}) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  const baseline = useRef(query);
  const [picked, setPicked] = useState<string | null>(null);
  const enabled = active && query !== baseline.current && query !== picked;
  const {places, loading, failed, query: answered} = usePlaceSuggestions(query, enabled, maxLength);
  if (!enabled || query.trim().length < 3) return null;
  const settled = !loading && answered === query.trim();
  return <View style={s.list}>
    {places.map(place => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={'Use ' + place.label} style={s.row}
      onPress={() => { setPicked(place.label); onPick(place); }}>
      <Ionicons name="location-outline" size={20} color={colors.accent} />
      <View style={s.copy}>
        <Text numberOfLines={1} style={s.title}>{place.title}</Text>
        {place.subtitle ? <Text numberOfLines={2} style={s.subtitle}>{place.subtitle}</Text> : null}
      </View>
    </Pressable>)}
    {loading ? <View accessibilityRole="progressbar" accessibilityLabel="Searching places" style={s.status}><ActivityIndicator color={colors.accent} /><Text style={s.hint}>Searching places…</Text></View> : null}
    {settled && !places.length ? <Text accessibilityLiveRegion="polite" style={s.hint}>{failed ? 'Place search is unavailable. You can keep typing the place yourself.' : 'No matching places. You can use exactly what you typed.'}</Text> : null}
    {places.length ? <Text style={s.credit}>© OpenStreetMap contributors</Text> : null}
  </View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  list: {backgroundColor: colors.elevated, borderColor: colors.borderBright, borderRadius: 16, borderWidth: 1, marginTop: 8, overflow: 'hidden', borderCurve: 'continuous'},
  row: {alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth},
  copy: {flex: 1, minWidth: 0},
  title: {fontFamily: fonts.bold, color: colors.text, fontSize: 14, lineHeight: 20},
  subtitle: {fontFamily: fonts.copy, color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2},
  status: {alignItems: 'center', flexDirection: 'row', gap: 12, padding: 16},
  hint: {fontFamily: fonts.copy, color: colors.muted, fontSize: 13, lineHeight: 20, padding: 16},
  credit: {fontFamily: fonts.copy, color: colors.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingVertical: 8, textAlign: 'right'},
}));
