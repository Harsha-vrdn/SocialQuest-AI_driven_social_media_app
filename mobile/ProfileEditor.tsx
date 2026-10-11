import {useEffect, useRef, useState} from 'react';
import {Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MotionModal, SoftPressable as Pressable} from './Motion';
import {getAppStyles} from './appStyles';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';

export type ProfileDraft = {display_name: string; bio: string; city: string};
type Props = {
  user: {id: number; username: string; avatar?: string} & Partial<ProfileDraft>;
  onClose: () => void;
  onSave: (draft: ProfileDraft, avatar: ImagePicker.ImagePickerAsset | null) => Promise<void>;
};

export function ProfileEditor({user, onClose, onSave}: Props) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getAppStyles(theme);
  const local = getLocalStyles(theme);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ProfileDraft>({display_name: user.display_name || '', bio: user.bio || '', city: user.city || ''});
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = (key: keyof ProfileDraft, value: string) => setDraft(current => ({...current, [key]: value}));

  const chooseAvatar = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setPicking(true); setError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) throw new Error('Allow photo access to choose an avatar. You can still edit your details.');
      const result = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85});
      if (!mounted.current || result.canceled) return;
      const asset = result.assets[0];
      if ((asset.fileSize ?? new File(asset.uri).size) > 50 * 1024 * 1024) throw new Error('Choose a photo smaller than 50 MB.');
      setPhoto(asset);
    } catch (cause: any) { if (mounted.current) setError(cause.message || 'Could not open your photos.'); }
    finally { inFlight.current = false; if (mounted.current) setPicking(false); }
  };
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try {
      await onSave({display_name: draft.display_name.trim(), bio: draft.bio.trim(), city: draft.city.trim()}, photo);
      if (mounted.current) onClose();
    } catch (cause: any) { if (mounted.current) setError(cause.message || 'Could not save your profile. Try again.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const avatar = photo?.uri || user.avatar;
  return <MotionModal visible presentationStyle="pageSheet" onRequestClose={() => !inFlight.current && onClose()}>
    <KeyboardAvoidingView style={[s.app, {paddingTop: Math.max(insets.top, 18)}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={local.header}><Text style={s.sheetTitle}>Edit profile</Text><Pressable disabled={busy || picking} accessibilityRole="button" accessibilityLabel="Close profile editor" style={s.commentsClose} onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[local.form, {paddingBottom: insets.bottom + 28}]}>
        <View style={local.avatarRow}>
          {avatar ? <Image source={{uri: avatar}} style={local.avatar} /> : <View style={[local.avatar, local.placeholder]}><Text style={local.initial}>{(draft.display_name || user.username).slice(0, 1).toUpperCase()}</Text></View>}
          <View style={{flex: 1}}><Text style={s.personName}>@{user.username}</Text><Pressable disabled={busy || picking} accessibilityRole="button" style={s.outline} onPress={() => void chooseAvatar()}><Text style={s.outlineText}>{picking ? 'Opening photos…' : 'Change photo'}</Text></Pressable></View>
        </View>
        <Text style={s.sheetCopy}>Your player card. Make it feel like you.</Text>
        <Text style={s.authLabel}>DISPLAY NAME</Text><TextInput accessibilityLabel="Display name" editable={!busy} style={s.input} value={draft.display_name} onChangeText={value => change('display_name', value)} maxLength={80} placeholder={user.username} placeholderTextColor={colors.muted} autoCapitalize="words" />
        <Text style={s.authLabel}>BIO</Text><TextInput accessibilityLabel="Bio" editable={!busy} style={[s.input, local.bio]} value={draft.bio} onChangeText={value => change('bio', value)} maxLength={280} placeholder="Your interests, your next adventure…" placeholderTextColor={colors.muted} multiline textAlignVertical="top" /><Text style={local.counter}>{draft.bio.length} / 280</Text>
        <Text style={s.authLabel}>CITY</Text><TextInput accessibilityLabel="City" editable={!busy} style={s.input} value={draft.city} onChangeText={value => change('city', value)} maxLength={80} placeholder="Where do you adventure?" placeholderTextColor={colors.muted} autoCapitalize="words" />
        {error ? <Text accessibilityRole="alert" style={local.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || picking} style={[s.primary, (busy || picking) && s.dim]} onPress={() => void save()}><Text style={s.primaryText}>{busy ? 'Saving…' : 'Save profile'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy || picking} style={s.secondary} onPress={onClose}><Text style={s.secondaryText}>Cancel</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </MotionModal>;
}

const getLocalStyles = createThemedStyles(({colors}) => ({
  header: {paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  form: {paddingHorizontal: 20},
  avatarRow: {flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 12},
  avatar: {width: 80, height: 80, borderRadius: 28, borderCurve: 'continuous'},
  placeholder: {backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center'},
  initial: {fontFamily: fonts.heading, fontSize: 28, color: colors.accent},
  bio: {minHeight: 120},
  counter: {fontFamily: fonts.copy, fontSize: 13, color: colors.muted, textAlign: 'right', marginTop: 6},
  error: {fontFamily: fonts.copy, color: colors.danger, fontSize: 15, lineHeight: 22, marginTop: 16},
}));
