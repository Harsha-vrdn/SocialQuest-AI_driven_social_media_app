import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {createContext, type PropsWithChildren, useContext, useEffect, useState} from 'react';
import {AccessibilityInfo, Platform, StyleSheet, View} from 'react-native';
import {GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable} from 'expo-glass-effect';
import {LinearGradient} from 'expo-linear-gradient';
import {type Accent} from './theme';

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
    let preferenceChanged = false;
    // Subscribe first: a delayed initial read must not undo a new system setting.
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      preferenceChanged = true;
      if (mounted) setReduceTransparency(value);
    });
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function') {
      void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
        if (mounted && !preferenceChanged) setReduceTransparency(value);
      }).catch(() => {});
    } else {
      setReduceTransparency(false);
    }
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return <ReduceTransparency.Provider value={reduceTransparency}>{children}</ReduceTransparency.Provider>;
}

export function useLiquidGlass() {
  const reduceTransparency = useContext(ReduceTransparency);
  return nativeGlassAvailable && !reduceTransparency;
}

// Decorative only: preserve each control's layout and touch target.
// Use native glass on navigation/control surfaces, never on nested content cards.
export function GlassBackdrop({accent = false, tone, native = false, radius = native ? 24 : 16}: {accent?: boolean; tone?: Accent; native?: boolean; radius?: number}) {
  const {theme} = useTheme();
  const {colors, accents} = theme;
  const s = getStyles(theme);
  const reduceTransparency = useContext(ReduceTransparency);
  const useNativeGlass = native && nativeGlassAvailable && !reduceTransparency;
  const solidColor = tone ? accents[tone].surface : accent ? colors.selection : colors.surface;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, s.clip, {borderRadius: radius}]}>
    {useNativeGlass ? <GlassView style={[StyleSheet.absoluteFill, {borderRadius: radius}]} glassEffectStyle="regular" colorScheme={theme.scheme}
      tintColor={tone ? accents[tone].text + '26' : accent ? colors.accent + '26' : undefined} />
      : <View style={[StyleSheet.absoluteFill, {backgroundColor: reduceTransparency ? solidColor : solidColor + 'F5'}]} />}
    {/* Let UIKit draw its own highlights/refraction. Simulated edges belong only to the fallback. */}
    {!useNativeGlass && !reduceTransparency ? <>
      <LinearGradient colors={accent ? [colors.accent + '12', colors.accent + '05', colors.accent + '00'] : ['#FFFFFF08', '#FFFFFF03', '#FFFFFF00']}
        locations={[0, 0.5, 1]} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.edge, {borderRadius: radius}]} />
    </> : null}
  </View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  clip: {overflow: 'hidden', borderCurve: 'continuous'},
  edge: {borderWidth: 1, borderColor: colors.borderBright + '44', borderCurve: 'continuous'},
}));
