import {useEffect, useRef, useState, type ReactNode} from 'react';
import {ActivityIndicator, Alert, Keyboard, Linking, ScrollView, Text, TextInput, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AppearanceSettings} from './AppearanceSettings';
import {GlassBackdrop} from './GlassBackdrop';
import {SoftPressable as Pressable} from './Motion';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';
import {citySuggestions, type AccountSettings, type LocationPreference, type SavedCity} from './accountSettings';

type Props = {
  userId: number; profileCity?: string; notifications: ReactNode;
  api: (path: string, options?: any) => Promise<any>;
  onLocationSaved: () => void; onLogout: () => void; onAccountSuspended: () => Promise<void>;
  onBack: () => void;
  bottomInset?: number;
};
export function SettingsScreen(props: Props) {
  const {theme} = useTheme(), s = getStyles(theme), {colors} = theme;
  const latest = useRef(props); latest.current = props;
  const [location, setLocation] = useState<LocationPreference | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(''), [locationStatus, setLocationStatus] = useState('');
  const [cityOpen, setCityOpen] = useState(false), [query, setQuery] = useState('');
  const [action, setAction] = useState<'deactivate' | 'delete' | null>(null);
  const [password, setPassword] = useState(''), [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const operation = useRef(false), mounted = useRef(true), loadVersion = useRef(0);
  const load = async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      const data: AccountSettings = await latest.current.api('/auth/settings/');
      if (!mounted.current || version !== loadVersion.current) return;
      setLocation({location_mode: data.location_mode, saved_city: data.saved_city,
        saved_latitude: data.saved_latitude, saved_longitude: data.saved_longitude});
    } catch (error: any) {if (mounted.current && version === loadVersion.current) setLoadError(error.message);}
    finally {if (mounted.current && version === loadVersion.current) setLoading(false);}
  };
  useEffect(() => {mounted.current = true; void load(); return () => {mounted.current = false; loadVersion.current++;};}, [props.userId]);
  const edit = (changes: Partial<LocationPreference>) => {setLocation(value => value && {...value, ...changes}); setLocationStatus('');};
  const pickCity = (city: SavedCity) => {
    edit({saved_city: city.name.slice(0, 80), saved_latitude: city.latitude, saved_longitude: city.longitude});
    setCityOpen(false); setQuery(''); Keyboard.dismiss();
  };
  const saveLocation = async () => {
    if (!location || operation.current) return;
    if (location.location_mode === 'SAVED' && !location.saved_city.trim()) {setLocationStatus('Choose a city first.'); return;}
    operation.current = true; setSaving(true); setLocationStatus('');
    try {
      await props.api('/auth/settings/', {method: 'PATCH', body: JSON.stringify(location)});
      if (mounted.current) {setLocationStatus('Location preference saved.'); props.onLocationSaved();}
    } catch (error: any) {if (mounted.current) setLocationStatus(error.message);}
    finally {operation.current = false; if (mounted.current) setSaving(false);}
  };
  const performAction = async () => {
    if (!action || operation.current || !mounted.current) return;
    operation.current = true; setAccountBusy(true); setAccountError(''); Keyboard.dismiss();
    try {
      const result = await props.api(action === 'delete' ? '/auth/request-deletion/' : '/auth/deactivate/', {
        method: 'POST', body: JSON.stringify({password}),
      });
      setPassword('');
      await props.onAccountSuspended();
      Alert.alert(action === 'delete' ? 'Deletion scheduled' : 'Account deactivated', action === 'delete'
        ? 'Your account is retained until ' + new Date(result.deletion_due_at).toLocaleString() + '. Log in before that deadline to cancel deletion and continue using it.'
        : 'Your profile is hidden. Log in whenever you are ready to reactivate your account.');
    } catch (error: any) {if (mounted.current) setAccountError(error.message);}
    finally {operation.current = false; if (mounted.current) setAccountBusy(false);}
  };
  const confirmAction = () => {
    if (!password || operation.current) {if (!password) setAccountError('Enter your current password.'); return;}
    Alert.alert(action === 'delete' ? 'Start the 90-day deletion countdown?' : 'Deactivate your account?',
      action === 'delete' ? 'You will be signed out on every device. Log in within 90 days to cancel. After the deadline your account and hosted events will be permanently deleted.'
        : 'Your profile, posts, and hosted events will be hidden. Your data is kept until you return and log in.',
      [{text: 'Keep account active', style: 'cancel'}, {text: action === 'delete' ? 'Schedule deletion' : 'Deactivate', style: 'destructive', onPress: () => void performAction()}]);
  };
  return <ScrollView testID="settings-page" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.page, {paddingBottom: s.page.paddingBottom + (props.bottomInset || 0)}]} scrollIndicatorInsets={{bottom: props.bottomInset || 0}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" style={s.back} onPress={() => {Keyboard.dismiss(); props.onBack();}}><GlassBackdrop native radius={16} /><Ionicons name="chevron-back" size={20} color={colors.text} /><Text style={s.buttonText}>Profile</Text></Pressable>
    <Text style={s.eyebrow}>MAKE IT YOURS</Text><Text style={s.title}>Settings</Text>
    <Text style={s.copy}>Your preferences and account, all in one place.</Text>
    <AppearanceSettings />
    <View style={s.card}><Text style={s.heading}>Notifications</Text><Text style={s.copy}>Manage alerts on this device. Your in-app inbox is always available from the bell.</Text>{props.notifications}</View>
    <View style={s.card}><Text style={s.heading}>Location</Text><Text style={s.copy}>Choose the default for nearby events. This does not change your public profile city or an event’s venue.</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading location settings" color={colors.accent} /> : loadError ? <><Text accessibilityRole="alert" style={s.error}>{loadError}</Text><Pressable accessibilityRole="button" style={s.button} onPress={() => void load()}><Text style={s.buttonText}>Retry loading settings</Text></Pressable></> : location ? <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Default location" style={s.gap}>
          {(['CURRENT', 'SAVED'] as const).map(mode => <Pressable key={mode} accessibilityRole="radio" accessibilityLabel={mode === 'CURRENT' ? 'Device location' : 'Saved city'} accessibilityState={{checked: location.location_mode === mode, disabled: saving || accountBusy}} disabled={saving || accountBusy} style={[s.choice, location.location_mode === mode && s.selected]} onPress={() => {edit({location_mode: mode}); setCityOpen(false);}}>
            <Ionicons name={mode === 'CURRENT' ? 'navigate-outline' : 'location-outline'} size={22} color={colors.accent} /><View style={s.flex}><Text style={s.heading}>{mode === 'CURRENT' ? 'Device location (default)' : 'Saved city'}</Text><Text style={s.small}>{mode === 'CURRENT' ? 'Ask for permission when you use Nearby.' : 'Explore a city without sharing GPS.'}</Text></View><Ionicons name={location.location_mode === mode ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.accent} />
          </Pressable>)}
        </View>
        {location.location_mode === 'SAVED' ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose saved city" accessibilityState={{expanded: cityOpen, disabled: saving || accountBusy}} disabled={saving || accountBusy} style={s.choice} onPress={() => setCityOpen(value => !value)}><Text style={[s.buttonText, s.flex]}>{location.saved_city || 'Choose a city'}</Text><Ionicons name={cityOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text} /></Pressable>
          {cityOpen ? <View style={s.dropdown}><TextInput accessibilityLabel="Search cities" placeholder="Search or enter a city" placeholderTextColor={colors.muted} style={s.input} value={query} maxLength={80} onChangeText={setQuery} autoCorrect={false} />
            {citySuggestions(query, props.profileCity).map(city => <Pressable key={city.name} accessibilityRole="button" accessibilityLabel={'Use ' + city.name} style={s.city} onPress={() => pickCity(city)}><Text style={s.buttonText}>{city.name}</Text></Pressable>)}
            {query.trim() ? <Pressable accessibilityRole="button" style={s.city} onPress={() => pickCity({name: query.trim(), latitude: null, longitude: null})}><Text style={s.buttonText}>Use “{query.trim()}”</Text><Text style={s.small}>Custom city · matches event location names</Text></Pressable> : <Text style={s.small}>Suggested cities, or type any other city.</Text>}
          </View> : null}
        </> : <Text style={s.small}>No background location tracking. GPS is used only for a nearby search.</Text>}
        <Pressable accessibilityRole="button" disabled={saving || accountBusy} style={s.button} onPress={() => void saveLocation()}><Text style={s.buttonText}>{saving ? 'Saving…' : 'Save location preference'}</Text></Pressable>
        {locationStatus ? <Text accessibilityLiveRegion="polite" style={s.copy}>{locationStatus}</Text> : null}
        <Pressable accessibilityRole="button" style={s.city} onPress={() => void Linking.openSettings().catch(() => Alert.alert('Settings unavailable', 'Open location permissions in your phone settings.'))}><Text style={s.link}>Phone location permissions ↗</Text></Pressable>
      </> : null}
    </View>
    <View style={s.card}><Text style={s.heading}>Account</Text><Text style={s.copy}>Take a break or manage your account.</Text>
      <Pressable accessibilityRole="button" style={s.choice} disabled={accountBusy || saving} onPress={props.onLogout}><Text style={s.buttonText}>Log out of this device</Text><Ionicons name="log-out-outline" size={21} color={colors.text} /></Pressable>
      <Pressable accessibilityRole="button" style={s.choice} disabled={accountBusy || saving} onPress={() => {setAction('deactivate'); setPassword(''); setAccountError('');}}><Text style={s.buttonText}>Deactivate account</Text><Ionicons name="pause-circle-outline" size={21} color={colors.text} /></Pressable>
      <Text style={s.small}>Hide your profile and keep your data indefinitely. Log in again to reactivate. Messages already shared in chats can remain visible.</Text>
      <Pressable accessibilityRole="button" style={[s.choice, s.dangerBorder]} disabled={accountBusy || saving} onPress={() => {setAction('delete'); setPassword(''); setAccountError('');}}><Text style={s.error}>Delete account</Text><Ionicons name="trash-outline" size={21} color={colors.danger} /></Pressable>
      <Text style={s.small}>A 90-day recovery window starts when you confirm. A successful login before the deadline cancels deletion. After 90 days, recovery is no longer available.</Text>
      {action ? <View style={s.confirmation}><Text style={s.heading}>{action === 'delete' ? 'Confirm scheduled deletion' : 'Confirm deactivation'}</Text><Text style={s.copy}>{action === 'delete' ? 'Your profile is hidden immediately. Your account, posts, uploaded media, messages, and hosted events are scheduled for deletion after 90 days. Copies saved by other people cannot be recalled.' : 'You will be signed out everywhere. Your account and data remain saved, with no deletion countdown.'}</Text>
        <Text style={s.small}>Current password</Text><TextInput accessibilityLabel="Current password to confirm account action" secureTextEntry value={password} onChangeText={setPassword} editable={!accountBusy} autoCapitalize="none" autoCorrect={false} textContentType="password" style={s.input} />
        {accountError ? <Text accessibilityRole="alert" style={s.error}>{accountError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={accountBusy || saving} style={[s.button, s.dangerBorder]} onPress={confirmAction}><Text style={s.error}>{accountBusy ? 'Please wait…' : action === 'delete' ? 'Schedule deletion in 90 days' : 'Deactivate now'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={accountBusy} style={s.city} onPress={() => {setAction(null); setPassword(''); setAccountError('');}}><Text style={s.buttonText}>Cancel</Text></Pressable>
      </View> : null}
    </View>
  </ScrollView>;
}

const getStyles = createThemedStyles(({colors}) => ({
  page: {padding: 20, paddingBottom: 32},
  back: {alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 16, marginBottom: 8},
  title: {fontFamily: fonts.heading, fontSize: 26, lineHeight: 34, color: colors.text},
  eyebrow: {fontFamily: fonts.bold, fontSize: 11, lineHeight: 18, letterSpacing: 1, color: colors.accent, marginBottom: 4},
  card: {marginTop: 20, padding: 16, gap: 12, borderRadius: 20, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface},
  heading: {fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: colors.text},
  copy: {fontFamily: fonts.copy, fontSize: 13, lineHeight: 21, color: colors.muted},
  small: {fontFamily: fonts.copy, fontSize: 11, lineHeight: 18, color: colors.muted},
  buttonText: {fontFamily: fonts.copy, fontSize: 13, lineHeight: 21, color: colors.text, flexShrink: 1},
  error: {fontFamily: fonts.copy, fontSize: 13, lineHeight: 21, color: colors.danger, flexShrink: 1},
  button: {minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selection, borderRadius: 14, padding: 12},
  choice: {minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12},
  selected: {borderColor: colors.accent, backgroundColor: colors.selection},
  flex: {flex: 1, minWidth: 0}, gap: {gap: 8},
  input: {minHeight: 48, padding: 12, borderColor: colors.borderBright, borderWidth: 1, borderRadius: 12, color: colors.text, backgroundColor: colors.field, fontFamily: fonts.copy, fontSize: 14},
  dropdown: {padding: 8, gap: 4, borderRadius: 14, backgroundColor: colors.field},
  city: {minHeight: 44, justifyContent: 'center', padding: 8},
  link: {fontFamily: fonts.copy, fontSize: 12, lineHeight: 20, color: colors.accent},
  dangerBorder: {borderWidth: 1, borderColor: colors.danger},
  confirmation: {gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border},
}));
