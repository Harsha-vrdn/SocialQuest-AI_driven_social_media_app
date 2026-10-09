import {createContext, type PropsWithChildren, useContext, useEffect, useState} from 'react';
import {AccessibilityInfo, Platform, StyleSheet, View} from 'react-native';
import {GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable} from 'expo-glass-effect';
import {LinearGradient} from 'expo-linear-gradient';
import {accents, colors, type Accent} from './theme';

const ReduceTransparency = createContext(true);

const nativeGlassAvailable = (() => {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    // Existing development builds may not include the new native module yet.
    return false;
  }
})();

export function GlassPreferenceProvider({children}: PropsWithChildren) {
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let mounted = true;
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function') {
      void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
        if (mounted) setReduceTransparency(value);
      }).catch(() => {});
    } else {
      setReduceTransparency(false);
    }
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return <ReduceTransparency.Provider value={reduceTransparency}>{children}</ReduceTransparency.Provider>;
}

// Decorative only: preserve each control's layout and touch target.
// Native glass is reserved for the outer toolbars, avoiding nested glass surfaces.
export function GlassBackdrop({accent = false, tone, native = false, radius = native ? 24 : 16}: {accent?: boolean; tone?: Accent; native?: boolean; radius?: number}) {
  const reduceTransparency = useContext(ReduceTransparency);
  const useNativeGlass = native && nativeGlassAvailable && !reduceTransparency;
  const solidColor = tone ? accents[tone].surface : accent ? colors.selection : colors.surface;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, s.clip, {borderRadius: radius}]}>
    {useNativeGlass ? <GlassView style={[StyleSheet.absoluteFill, {borderRadius: radius}]} glassEffectStyle="regular" colorScheme="dark" tintColor={solidColor + 'B8'} />
      : <View style={[StyleSheet.absoluteFill, {backgroundColor: reduceTransparency ? solidColor : solidColor + 'F5'}]} />}
    {!reduceTransparency ? <>
      <LinearGradient colors={accent ? [colors.accent + '12', colors.accent + '05', colors.accent + '00'] : ['#FFFFFF08', '#FFFFFF03', '#FFFFFF00']}
        locations={[0, 0.5, 1]} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.edge, {borderRadius: radius}]} />
    </> : null}
  </View>;
}

const s = StyleSheet.create({
  clip: {overflow: 'hidden', borderCurve: 'continuous'},
  edge: {borderWidth: 1, borderColor: colors.borderBright + '44', borderCurve: 'continuous'},
});
