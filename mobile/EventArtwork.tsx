import {Image, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Ionicons} from '@expo/vector-icons';
import {accents, colors, fonts} from './theme';

export function EventArtwork({image, date, live, alternate = false, compact = false}: {
  image?: string; date: string; live: boolean; alternate?: boolean; compact?: boolean;
}) {
  return <View style={[s.art, compact && s.compact]}>
    {image ? <Image source={{uri: image}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <>
      <LinearGradient colors={alternate ? ['#182D57', '#121235', '#54275B'] : ['#263A74', '#733EB6']}
        start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={StyleSheet.absoluteFill} />
      <View style={s.orbit} /><View style={s.innerOrbit} />
      <View style={s.icon}><Ionicons name={alternate ? 'leaf-outline' : 'compass-outline'} size={42} color={alternate ? colors.sky : colors.gold} /></View>
      <View style={s.star}><Ionicons name="sparkles" size={15} color={colors.gold} /></View>
    </>}
    <LinearGradient colors={[colors.background + '00', colors.background + '66']} style={StyleSheet.absoluteFill} />
    <Text style={s.date}>{date}</Text>
    <View style={[s.status, !live && {backgroundColor: colors.surface}]}>{live ? <View style={s.dot} /> : <Ionicons name="sparkles-outline" size={12} color={colors.accent} />}<Text style={[s.statusText, !live && {color: colors.text}]}>{live ? 'Happening now' : 'Adventure awaits'}</Text></View>
  </View>;
}

const s = StyleSheet.create({
  art: {minHeight: 156, aspectRatio: 16 / 9, height: undefined, overflow: 'hidden', backgroundColor: colors.accentSoft},
  compact: {minHeight: 140, aspectRatio: 2, height: undefined},
  orbit: {position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: colors.accent + '17', right: -22, top: -55},
  innerOrbit: {position: 'absolute', width: 174, height: 174, borderRadius: 87, borderWidth: 1, borderColor: colors.accent + '1A', right: 16, top: -17},
  icon: {position: 'absolute', right: 68, top: 41, width: 70, height: 70, borderRadius: 25, borderCurve: 'continuous', backgroundColor: colors.accent + '0E', alignItems: 'center', justifyContent: 'center', transform: [{rotate: '-12deg'}]},
  star: {position: 'absolute', right: 30, top: 32},
  date: {fontFamily: fonts.bold, position: 'absolute', left: 16, top: 16, paddingHorizontal: 11, paddingVertical: 7, overflow: 'hidden', borderRadius: 11, backgroundColor: colors.background + 'CC', color: colors.text, fontSize: 11, },
  status: {position: 'absolute', left: 16, bottom: 16, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: accents.mint.surface},
  statusText: {fontFamily: fonts.bold, color: colors.mint, fontSize: 11, },
  dot: {width: 5, height: 5, borderRadius: 3, backgroundColor: colors.mint},
});
