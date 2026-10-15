import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {QuestAttribution} from './QuestAttribution';
import {fonts} from './theme';
import {SoftPressable as Pressable, MotionModal as Modal, ScreenTransition} from './Motion';
import {useEffect, useRef, useState} from 'react';
import {Ionicons} from '@expo/vector-icons';
import {GlassBackdrop} from './GlassBackdrop';
import {PlaceSuggestions} from './PlaceSuggestions';
import {Alert, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, useWindowDimensions} from 'react-native';
import type {ImagePickerAsset} from 'expo-image-picker';
import {useVideoPlayer, VideoView} from 'expo-video';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

type Props = {
  visible: boolean; editingPhoto: boolean; busy: boolean;
  media: ImagePickerAsset | null; caption: string; location: string;
  author: {username: string; display_name?: string; avatar?: string} | null;
  quest?: {id: number; title: string; xp_reward: number; event_name?: string} | null;
  onCaption: (value: string) => void; onLocation: (value: string) => void;
  onLibrary: (videoOnly: boolean) => void; onCamera: () => void; onEdit: () => void;
  onRemove: () => void; onLocate: () => void; onClose: (discard: boolean) => void;
  onPublish: () => void;
};

function VideoPreview({uri}: {uri: string}) {
  const {theme} = useTheme();
  const s = getStyles(theme);
  const player = useVideoPlayer(uri, instance => { instance.loop = true; });
  return <VideoView player={player} style={s.media} contentFit="contain" nativeControls />;
}

export function PostComposer(props: Props) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<'POST' | 'REEL'>('POST');
  const [error, setError] = useState('');
  const [placeSearch, setPlaceSearch] = useState(false);
  const limit = props.quest ? 280 : 1200;
  const name = props.author?.display_name || props.author?.username || 'You';
  const video = props.media?.type === 'video';
  const hasDraft = !!(props.media || props.caption.trim() || props.location.trim());
  useEffect(() => { if (props.visible) { setStep(0); setError(''); setPlaceSearch(false); setKind(props.media?.type === 'video' ? 'REEL' : 'POST'); } }, [props.visible, props.quest?.id]);
  useEffect(() => { if (props.media) { setKind(props.media.type === 'video' ? 'REEL' : 'POST'); setError(''); } }, [props.media]);

  useEffect(() => { scrollRef.current?.scrollTo({y: 0, animated: false}); }, [step, props.visible]);

  const close = () => {
    if (props.busy) return;
    Keyboard.dismiss();
    if (!hasDraft) return props.onClose(false);
    Alert.alert('Leave this post?', 'A saved draft stays here until you close the app.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard draft', style: 'destructive', onPress: () => props.onClose(true)},
      {text: 'Save draft', onPress: () => props.onClose(false)},
    ]);
  };
  const next = () => {
    Keyboard.dismiss(); setError('');
    if ((props.quest || kind === 'REEL') && !props.media) return setError(kind === 'REEL' ? 'Choose a video for your reel.' : 'Add a photo or video as your quest proof.');
    if (step > 0 && !props.media && !props.caption.trim()) return setError('Write a caption or add a photo before sharing.');
    if (step < 2) setStep(step + 1);
    else props.onPublish();
  };
  const selectKind = (value: 'POST' | 'REEL') => {
    if (value === kind) return;
    setKind(value); setError('');
    if (props.media) props.onRemove();
  };
  const preview = props.media ? <View style={[s.preview, video && s.videoPreview]}>
    {video ? <VideoPreview key={props.media.uri} uri={props.media.uri} /> : <Image source={{uri: props.media.uri}} style={s.media} resizeMode="contain" accessibilityLabel="Your selected photo" />}
  </View> : <View style={s.textPreview}><Ionicons name="sparkles-outline" size={26} color={colors.accent} /><Text style={s.textPreviewCopy}>{props.caption || 'Your next story starts here.'}</Text></View>;

  return <Modal visible={props.visible && !props.editingPhoto} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <KeyboardAvoidingView style={[s.screen, {paddingTop: insets.top}]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close post creator" disabled={props.busy} onPress={close} style={s.iconButton}><GlassBackdrop native radius={16} /><Ionicons name="close" size={26} color={colors.text} /></Pressable>
        <View style={s.headerCopy}><Text style={s.eyebrow}>SOCIALQUEST STUDIO</Text><Text style={s.title}>{props.quest ? 'Complete quest' : 'Create a post'}</Text></View>
        {width >= 360 ? <View style={s.stepBadge}><Text style={s.stepBadgeText}>{step + 1} / 3</Text></View> : null}
      </View>
      <View style={s.steps}>{['Media', 'Details', 'Preview'].map((label, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label + ', step ' + (index + 1)} accessibilityState={{selected: index === step, disabled: index > step || props.busy}} disabled={index > step || props.busy} onPress={() => {setStep(index); setError('');}} style={[s.step, index === step && s.activeStep]}><View style={s.stepLabelRow}>{index < step ? <Ionicons name="checkmark-circle" size={16} color={colors.mint} /> : <Text style={[s.stepText, index === step && s.activeStepText]}>{'0' + (index + 1)}</Text>}<Text style={[s.stepText, index === step && s.activeStepText]}>{label}</Text></View></Pressable>)}</View>
      <ScreenTransition style={s.scroll} transitionKey={step}><ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={[s.body, width >= 800 && s.wideBody]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {props.quest ? <View style={s.quest}><View style={s.labelRow}><Ionicons name="sparkles-outline" size={18} color={colors.mint} /><Text style={s.questLabel}>{props.quest.title}</Text></View><Text style={s.subtle}>{props.quest.event_name ? props.quest.event_name + ' · ' : ''}Post a photo or reel to claim +{props.quest.xp_reward} XP.</Text></View> : null}
        {step === 0 ? <>
          {!props.media ? <>
            <View style={s.typeRow}>{(['POST', 'REEL'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{selected:kind === value}} onPress={() => selectKind(value)} style={[s.typeButton, kind === value && s.selectedType]}><View style={s.labelRow}><Ionicons name={value === 'POST' ? 'image-outline' : 'videocam-outline'} size={20} color={kind === value ? colors.accent : colors.muted} /><Text style={[s.typeTitle, kind === value && s.selectedTypeTitle]}>{value === 'POST' ? 'Post' : 'Reel'}</Text></View><Text style={s.subtle}>{value === 'POST' ? (props.quest ? 'A photo from your quest' : 'Photo or a thought') : 'A moment in motion'}</Text></Pressable>)}</View>
            <View style={s.uploadZone}>
              <View style={s.art}><View style={s.artBack} /><View style={s.artFront}><Ionicons name={kind === 'REEL' ? 'videocam-outline' : 'images-outline'} size={42} color={colors.accent} /></View></View>
              <Text style={s.heroTitle}>{kind === 'REEL' ? 'Give your story a little motion.' : 'A moment worth sharing.'}</Text>
              <Text style={s.heroCopy}>{props.quest ? 'Share a photo or video of your quest. Your caption is optional.' : kind === 'REEL' ? 'Choose a video and make it part of the adventure.' : 'Start with a photo, or let your words do the talking.'}</Text>
              <Pressable accessibilityRole="button" style={s.primary} onPress={() => props.onLibrary(kind === 'REEL')}><Text style={s.primaryText}>{kind === 'REEL' ? 'Choose a video' : 'Choose photo / video'}</Text></Pressable>
              {kind === 'POST' ? <Pressable accessibilityRole="button" style={[s.secondary, s.labelRow]} onPress={props.onCamera}><Ionicons name="camera-outline" size={20} color={colors.text} /><Text style={s.secondaryText}>Open camera</Text></Pressable> : null}
              <Text style={s.finePrint}>One photo or video · up to 50 MB</Text>
            </View>
            {!props.quest && kind === 'POST' ? <Pressable accessibilityRole="button" style={[s.textOnly, s.labelRow]} onPress={() => setStep(1)}><Text style={s.secondaryText}>Just writing? Create a text post</Text><Ionicons name="arrow-forward" size={18} color={colors.text} /></Pressable> : null}
          </> : <>
            <View style={s.sectionHeading}><Text style={s.sectionTitle}>{video ? 'Your reel' : 'Your photo'}</Text><Text style={s.pill}>{video ? 'REEL' : 'POST'}</Text></View>
            {preview}
            <View style={s.mediaTools}>
              {!video ? <Pressable accessibilityRole="button" style={s.tool} onPress={props.onEdit}><Ionicons name="options-outline" size={18} color={colors.text} /><Text style={s.secondaryText}>Edit photo</Text></Pressable> : null}
              <Pressable accessibilityRole="button" style={s.tool} onPress={() => props.onLibrary(video)}><Ionicons name="swap-horizontal-outline" size={18} color={colors.text} /><Text style={s.secondaryText}>Replace</Text></Pressable>
              <Pressable accessibilityRole="button" style={s.tool} onPress={props.onRemove}><Ionicons name="trash-outline" size={18} color={colors.danger} /><Text style={s.removeText}>Remove</Text></Pressable>
            </View>
            <Text style={s.finePrint}>{video ? 'Play your video to check it before sharing.' : 'Crop, rotate, or mirror your photo with Edit photo.'}</Text>
          </>}
        </> : step === 1 ? <>
          <View style={s.author}><View style={s.avatar}>{props.author?.avatar ? <Image source={{uri:props.author.avatar}} style={s.avatarImage} /> : <Text style={s.avatarLetter}>{name.slice(0,1)}</Text>}</View><View style={{flex: 1, minWidth: 0}}><Text style={s.authorName}>{name}</Text><Text style={s.subtle}>{props.quest ? 'Quest moment' : 'Sharing with the community'}</Text></View></View>
          <View style={s.fieldHeading}><Text style={s.sectionTitle}>Tell the story</Text><Text style={s.subtle}>{props.caption.length} / {limit}</Text></View>
          <TextInput accessibilityLabel="Post caption" style={s.caption} value={props.caption} onChangeText={props.onCaption} maxLength={limit} multiline textAlignVertical="top" placeholder="What made this moment yours?" placeholderTextColor={colors.muted} />
          <Text style={s.finePrint}>{props.quest ? 'A caption is optional. Your proof tells the story.' : 'A little context goes a long way.'}</Text>
          {!props.quest ? <View style={s.locationCard}><View style={s.labelRow}><Ionicons name="location-outline" size={20} color={colors.accent} /><Text style={s.sectionTitle}>Add a place</Text></View><TextInput accessibilityLabel="Post location" style={s.locationInput} value={props.location} onChangeText={value => { setPlaceSearch(true); props.onLocation(value); }} maxLength={120} placeholder="Where did it happen? (optional)" placeholderTextColor={colors.muted} /><PlaceSuggestions query={props.location} active={placeSearch} maxLength={120} onPick={place => { setPlaceSearch(false); props.onLocation(place.label); Keyboard.dismiss(); }} /><Pressable accessibilityRole="button" style={[s.locate, s.labelRow]} onPress={() => { setPlaceSearch(false); props.onLocate(); }}><Ionicons name="navigate-outline" size={18} color={colors.accent} /><Text style={s.link}>Use my current location</Text></Pressable></View> : null}
          <View style={s.info}><Ionicons name="information-circle-outline" size={22} color={colors.muted} /><Text style={s.infoText}>{props.quest ? 'Your proof will appear in this event’s Quest moments.' : 'Your post will appear on your profile and in the community feed.'}</Text></View>
        </> : <>
          <Text style={s.heroTitle}>{props.quest ? 'Ready to complete your quest.' : 'Ready for the feed.'}</Text><Text style={s.heroCopy}>One last look before your community sees it.</Text>
          <View style={s.postCard}><View style={s.author}><View style={s.avatar}>{props.author?.avatar ? <Image source={{uri:props.author.avatar}} style={s.avatarImage} /> : <Text style={s.avatarLetter}>{name.slice(0,1)}</Text>}</View><View style={{flex:1}}><Text style={s.authorName}>{name}</Text><Text style={s.subtle}>{props.location || 'SocialQuest community'}</Text></View><Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /></View><QuestAttribution quest={props.quest?.title} event={props.quest?.event_name} />{preview}{props.media && props.caption ? <Text style={s.previewCaption}>{props.caption}</Text> : null}<View style={s.previewActions}><View style={s.previewActionRow}><Ionicons name="heart-outline" size={23} color={colors.muted} /><Ionicons name="chatbubble-outline" size={22} color={colors.muted} /><Ionicons name="paper-plane-outline" size={22} color={colors.muted} /></View><Text style={s.subtle}>Preview</Text></View></View>
          <Pressable accessibilityRole="button" disabled={props.busy} style={s.textOnly} onPress={() => setStep(1)}><Text style={s.link}>Edit caption & details</Text></Pressable>
        </>}
      </ScrollView></ScreenTransition>
      <View style={[s.footer, {paddingBottom: Math.max(insets.bottom, 14)}]}><GlassBackdrop native />
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <View style={s.footerRow}>{step > 0 ? <Pressable accessibilityRole="button" disabled={props.busy} style={[s.back, s.labelRow]} onPress={() => {setStep(step-1); setError('');}}><Ionicons name="chevron-back" size={19} color={colors.text} /><Text style={s.secondaryText}>Back</Text></Pressable> : <Text style={s.footerHint}>Make it a moment.</Text>}<Pressable accessibilityRole="button" disabled={props.busy} style={[s.primary, s.next, props.busy && s.disabled]} onPress={next}><View style={s.labelRow}><Text style={s.primaryText}>{props.busy ? 'Publishing…' : step < 2 ? 'Next' : props.quest ? 'Post & complete' : 'Share ' + (video ? 'reel' : 'post')}</Text>{!props.busy ? <Ionicons name={step < 2 ? 'arrow-forward' : 'paper-plane-outline'} size={18} color={colors.onPrimary} /> : null}</View></Pressable></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const getStyles = createThemedStyles(({colors, accents}) => ({
  screen: {flex: 1, backgroundColor: colors.background},
  header: {borderRadius: 0, flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 0, borderColor: colors.border, borderCurve: "continuous", paddingHorizontal: 20, paddingVertical: 16},
  headerCopy: {minWidth: 0, flex: 1},
  eyebrow: {fontFamily: fonts.bold, fontSize: 11, color: colors.muted, lineHeight: 16, letterSpacing: 1.3},
  title: {lineHeight: 28, fontFamily: fonts.bold, color: colors.text, fontSize: 22, marginTop: 4, letterSpacing: 0},
  iconButton: {width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderRadius: 16, borderCurve: "continuous"},
  stepBadge: {padding: 8, backgroundColor: colors.accentSoft, borderRadius: 12, borderCurve: "continuous"},
  stepBadgeText: {fontFamily: fonts.copy, color: colors.muted, fontSize: 12},
  steps: {flexDirection: "row", paddingHorizontal: 4, gap: 4, backgroundColor: colors.surface, borderRadius: 20, marginHorizontal: 20, paddingVertical: 4, marginBottom: 6},
  step: {justifyContent: "center", minHeight: 44, flex: 1, paddingVertical: 10, borderBottomWidth: 0, borderBottomColor: colors.border, alignItems: "center", borderRadius: 16},
  activeStep: {borderBottomColor: colors.accent, backgroundColor: colors.selection},
  stepLabelRow: {alignItems: "center", flexDirection: "row", gap: 4},
  stepText: {lineHeight: 18, fontFamily: fonts.bold, color: colors.muted, fontSize: 12, },
  activeStepText: {color: colors.accent},
  scroll: {flex: 1},
  body: {padding: 20, gap: 16, paddingBottom: 32},
  wideBody: {width: 700, alignSelf: "center"},
  labelRow: {flexShrink: 1, alignItems: "center", flexDirection: "row", gap: 8},
  typeRow: {flexDirection: "row", gap: 12},
  typeButton: {minWidth: 0, flex: 1, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, borderCurve: "continuous", backgroundColor: colors.surface},
  selectedType: {backgroundColor: colors.selection, borderColor: accents.purple.border},
  typeTitle: {lineHeight: 24, fontFamily: fonts.bold, fontSize: 16, color: colors.muted},
  selectedTypeTitle: {color: colors.accent},
  subtle: {fontFamily: fonts.copy, color: colors.muted, fontSize: 12, lineHeight: 18},
  uploadZone: {backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderStyle: "solid", borderColor: colors.border, alignItems: "center", paddingHorizontal: 20, paddingVertical: 32, gap: 16, borderCurve: "continuous"},
  art: {width: 116, height: 100, marginVertical: 4},
  artBack: {position: "absolute", width: 76, height: 80, backgroundColor: colors.primary, borderRadius: 16, transform: [{rotate: "-14deg"}], top: 4, left: 7, borderColor: colors.border, borderWidth: 1, borderCurve: "continuous"},
  artFront: {position: "absolute", width: 76, height: 80, backgroundColor: colors.goldSoft, borderRadius: 16, transform: [{rotate: "12deg"}], left: 34, top: 15, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: accents.purple.border, borderCurve: "continuous"},
  heroTitle: {fontFamily: fonts.bold, color: colors.text, fontSize: 22, lineHeight: 28, textAlign: "center"},
  heroCopy: {fontFamily: fonts.copy, color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 4},
  primary: {backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, minHeight: 48, alignItems: "center", justifyContent: "center", borderCurve: "continuous"},
  primaryText: {flexShrink: 1, textAlign: "center", lineHeight: 20, fontFamily: fonts.bold, color: colors.onPrimary, fontSize: 14, },
  secondary: {minHeight: 44, justifyContent: "center", paddingHorizontal: 12},
  secondaryText: {flexShrink: 1, textAlign: "center", lineHeight: 20, fontFamily: fonts.bold, color: colors.text, fontSize: 13, },
  finePrint: {fontFamily: fonts.copy, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center"},
  textOnly: {padding: 12, minHeight: 44, alignItems: "center"},
  sectionHeading: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
  sectionTitle: {flexShrink: 1, lineHeight: 24, fontFamily: fonts.bold, color: colors.text, fontSize: 16, },
  pill: {fontFamily: fonts.bold, color: colors.accent, fontSize: 11, backgroundColor: colors.selection, padding: 8, borderRadius: 8, borderCurve: "continuous"},
  preview: {width: "100%", aspectRatio: 1, backgroundColor: colors.mediaBackground, borderRadius: 20, overflow: "hidden", borderCurve: "continuous"},
  videoPreview: {aspectRatio: 0.8},
  media: {width: "100%", height: "100%"},
  mediaTools: {flexDirection: "row", gap: 8, justifyContent: "space-between"},
  tool: {minWidth: 0, minHeight: 64, justifyContent: "center", alignItems: "center", gap: 4, paddingHorizontal: 4, backgroundColor: colors.elevated, borderRadius: 16, flex: 1, borderCurve: "continuous"},
  removeText: {fontFamily: fonts.copy, color: colors.danger, fontSize: 13},
  author: {flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12},
  avatar: {width: 44, height: 44, backgroundColor: colors.selection, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", borderCurve: "continuous"},
  avatarImage: {height: 44, width: 44},
  avatarLetter: {fontFamily: fonts.bold, fontSize: 18, color: colors.accent, },
  authorName: {fontFamily: fonts.bold, color: colors.text, fontSize: 15, },
  fieldHeading: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12},
  caption: {fontFamily: fonts.copy, minHeight: 180, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderBright, borderRadius: 16, padding: 16, color: colors.text, fontSize: 16, lineHeight: 24, borderCurve: "continuous"},
  locationCard: {backgroundColor: colors.surface, padding: 16, borderRadius: 20, gap: 12, borderCurve: "continuous"},
  locationInput: {lineHeight: 24, minHeight: 48, fontFamily: fonts.copy, borderBottomWidth: 1, borderColor: colors.borderBright, paddingVertical: 12, color: colors.text, fontSize: 16},
  locate: {minHeight: 44, justifyContent: "center"},
  link: {flexShrink: 1, lineHeight: 20, fontFamily: fonts.bold, color: colors.accent, fontSize: 13, },
  info: {backgroundColor: colors.surface, flexDirection: "row", gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, borderCurve: "continuous"},
  infoText: {fontFamily: fonts.copy, color: colors.muted, fontSize: 13, lineHeight: 20, flex: 1},
  postCard: {backgroundColor: colors.surface, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 24, borderCurve: "continuous"},
  textPreview: {minHeight: 200, backgroundColor: colors.accentSoft, padding: 24, justifyContent: "center", gap: 16, borderRadius: 20, borderCurve: "continuous"},
  textPreviewCopy: {fontFamily: fonts.copy, color: colors.text, fontSize: 20, lineHeight: 28},
  previewCaption: {fontFamily: fonts.copy, color: colors.text, fontSize: 16, lineHeight: 24, paddingVertical: 16},
  previewActions: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 16},
  previewActionRow: {alignItems: "center", flexDirection: "row", gap: 20},
  footer: {borderRadius: 24, backgroundColor: "transparent", borderTopWidth: 0, borderColor: colors.border, paddingHorizontal: 12, paddingTop: 12, gap: 12, borderCurve: "continuous", marginHorizontal: 8, marginBottom: 8},
  footerRow: {flexDirection: "row", alignItems: "center", gap: 8},
  footerHint: {lineHeight: 18, fontFamily: fonts.copy, color: colors.muted, fontSize: 12, flex: 1},
  back: {minHeight: 48, justifyContent: "center", paddingRight: 4},
  next: {flexShrink: 1, marginLeft: "auto", minWidth: 112},
  disabled: {opacity: 0.6},
  error: {lineHeight: 20, fontFamily: fonts.copy, color: colors.danger, fontSize: 14},
  quest: {padding: 16, backgroundColor: colors.mintSoft, borderRadius: 16, gap: 8, borderCurve: "continuous"},
  questLabel: {fontFamily: fonts.bold, color: colors.mint, fontSize: 15, },
}));
