import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {Image, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Ionicons} from '@expo/vector-icons';
import {artwork, fonts} from './theme';

export function EventArtwork({image, date, live, alternate = false, compact = false}: {
  image?: string; date: string; live: boolean; alternate?: boolean; compact?: boolean;
}) {
  const {theme} = useTheme();
  const {colors, gradients} = theme;
  const s = getStyles(theme);
  return <View style={[s.art, compact && s.compact]}>
    {image ? <Image source={{uri: image}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={alternate ? gradients.eventAlternate : gradients.event}
        start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={StyleSheet.absoluteFill} />
      <View style={[s.orbit, alternate && s.orbitAlternate]} /><View style={s.innerOrbit} />
      <View style={[s.icon, alternate && s.iconAlternate]}><Ionicons name={alternate ? 'leaf-outline' : 'compass-outline'} size={44} color={alternate ? artwork.green : artwork.purple} /></View>
      <View style={s.star}><Ionicons name="sparkles" size={24} color={artwork.purple} /></View>
      <View style={s.confetti} /><View style={s.dotConfetti} />
    </View>}
    <Text style={s.date}>{date}</Text>
    <View style={[s.status, !live && {backgroundColor: colors.surface}]}>{live ? <View style={s.dot} /> : <Ionicons name="sparkles-outline" size={12} color={colors.accent} />}<Text style={[s.statusText, !live && {color: colors.text}]}>{live ? 'Happening now' : 'Adventure awaits'}</Text></View>
  </View>;
}

const getStyles = createThemedStyles(({colors, accents}) => ({
  art: {minHeight: 156, aspectRatio: 16 / 9, height: undefined, overflow: 'hidden', backgroundColor: colors.accentSoft},
  compact: {minHeight: 140, aspectRatio: 2, height: undefined},
  orbit: {position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: artwork.yellow, right: -55, top: -90},
  orbitAlternate: {backgroundColor: artwork.mint},
  innerOrbit: {position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 2, borderColor: artwork.purple + '26', right: -10, top: -22},
  icon: {position: 'absolute', right: 24, top: 38, width: 78, height: 78, borderRadius: 24, borderCurve: 'continuous', backgroundColor: artwork.lavender, borderWidth: 1.5, borderColor: artwork.purple, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '12deg'}]},
  iconAlternate: {backgroundColor: artwork.mint, borderColor: artwork.green, transform: [{rotate: '-10deg'}]},
  star: {position: 'absolute', right: 112, top: 20, transform: [{rotate: '-10deg'}]},
  confetti: {position: 'absolute', left: 32, top: 70, width: 26, height: 7, borderRadius: 4, backgroundColor: artwork.purple, transform: [{rotate: '-25deg'}]},
  dotConfetti: {position: 'absolute', left: 74, top: 67, width: 10, height: 10, borderRadius: 5, backgroundColor: artwork.rose},
  date: {fontFamily: fonts.bold, position: 'absolute', left: 16, top: 16, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 11, },
  status: {position: 'absolute', left: 16, bottom: 16, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: accents.mint.surface},
  statusText: {fontFamily: fonts.bold, color: colors.mint, fontSize: 11, },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mint},
}));
