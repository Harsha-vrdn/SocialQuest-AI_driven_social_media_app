import {Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SoftPressable as Pressable} from './Motion';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';

const options = [
  {value: 'light', label: 'Light', icon: 'sunny-outline'},
  {value: 'dark', label: 'Dark', icon: 'moon-outline'},
  {value: 'system', label: 'System', icon: 'phone-portrait-outline'},
] as const;

export function AppearanceSettings() {
  const {theme, preference, setPreference, preferenceError} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  return <View style={s.card}>
    <View style={s.heading}><Ionicons name="color-palette-outline" size={20} color={colors.accent} /><Text style={s.title}>Appearance</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="App appearance" style={s.options}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label + ' appearance'}
        accessibilityState={{checked: preference === option.value}} onPress={() => setPreference(option.value)}
        style={[s.option, preference === option.value && s.selected]}>
        <Ionicons name={option.icon} size={21} color={preference === option.value ? colors.accent : colors.muted} />
        <Text style={[s.label, preference === option.value && s.selectedLabel]}>{option.label}</Text>
      </Pressable>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={s.hint}>{preference === 'system' ? `Following your device · ${theme.scheme} mode` : `${preference === 'dark' ? 'Dark' : 'Light'} mode · ${preferenceError ? 'active for this session' : 'saved on this device'}`}</Text>
    {preferenceError ? <Text accessibilityRole="alert" style={s.error}>{preferenceError}</Text> : null}
  </View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  card: {marginTop: 24, padding: 16, gap: 12, borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1},
  heading: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.text},
  options: {flexDirection: 'row', gap: 8},
  option: {flex: 1, minWidth: 0, minHeight: 68, padding: 8, gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.field},
  selected: {backgroundColor: colors.selection, borderColor: colors.accent},
  label: {fontFamily: fonts.copy, fontSize: 12, lineHeight: 18, color: colors.muted},
  selectedLabel: {color: colors.accent},
  hint: {fontFamily: fonts.copy, fontSize: 11, lineHeight: 17, color: colors.muted},
  error: {fontFamily: fonts.copy, fontSize: 12, lineHeight: 18, color: colors.danger},
}));
