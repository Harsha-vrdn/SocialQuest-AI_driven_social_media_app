import { File } from 'expo-file-system';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { memo, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Alert, Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppStyles } from '../../appStyles';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { MotionModal as Modal, SoftPressable as Pressable } from '../../Motion';
import { PostComposer } from '../../PostComposer';
import { useTheme } from '../../ThemeProvider';
import type { PhotoEditorState, PhotoOperation, Quest } from '../../types';
import { MAX_UPLOAD_BYTES } from '../../utils/social';

type Props = Pick<SocialQuestController, 'api' | 'me' | 'refreshVisibleProfile' | 'loadFeed' | 'loadMe' | 'openEvent' | 'setComposeOpen'> & { ref?: Ref<PostComposerHandle> };

export type PostComposerHandle = { openComposer: (quest: Quest | null) => void };

export const PostComposerModal = memo(function PostComposerModal({ api, me, refreshVisibleProfile, loadFeed, loadMe, openEvent, setComposeOpen: onVisibilityChange, ref }: Props) {
  const { theme } = useTheme();
  const styles = getAppStyles(theme);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const uploadInFlight = useRef(false);
  const photoEditInFlight = useRef(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [moment, setMoment] = useState('');
  const [momentMedia, setMomentMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoEditor, setPhotoEditor] = useState<PhotoEditorState | null>(null);
  const [photoEditorBusy, setPhotoEditorBusy] = useState(false);
  const [momentLocation, setMomentLocation] = useState('');
  const [proofQuest, setProofQuest] = useState<Quest | null>(null);
  const composerDrafts = useRef(new Map<string, { caption: string; media: ImagePicker.ImagePickerAsset | null; location: string }>());
  const openComposer = (quest: Quest | null) => {
    const draft = composerDrafts.current.get(quest ? 'quest:' + quest.id : 'post');
    setMoment(draft?.caption || ''); setMomentMedia(draft?.media || null); setMomentLocation(draft?.location || '');
    setProofQuest(quest); setComposeOpen(true);
  };
  const closeComposer = (discard: boolean) => {
    const key = proofQuest ? 'quest:' + proofQuest.id : 'post';
    if (discard) composerDrafts.current.delete(key);
    else composerDrafts.current.set(key, { caption: moment, media: momentMedia, location: momentLocation });
    setMoment(''); setMomentMedia(null); setMomentLocation(''); setProofQuest(null); setComposeOpen(false);
  };
  const choosePhoto = async (videoOnly = false) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photos are off', 'Allow photo access to attach an image to this post.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: videoOnly ? ['videos'] : ['images', 'videos'], allowsEditing: false, quality: 0.82 });
    if (!result.canceled) {
      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? new File(asset.uri).size;
      if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) return Alert.alert('File is too large', 'Choose a photo or video that is 50 MB or smaller.');
      if (asset.type === 'video') setMomentMedia(asset);
      else setPhotoEditor({ original: asset, working: asset });
    }
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera is off', 'Allow camera access to take a photo for this post.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setPhotoEditor({ original: asset, working: asset });
    }
  };
  const saveEditedImage = async (configure: (context: ReturnType<typeof ImageManipulator.manipulate>) => void) => {
    if (!photoEditor || photoEditInFlight.current) return;
    const source = photoEditor.working;
    photoEditInFlight.current = true;
    setPhotoEditorBusy(true);
    try {
      const context = ImageManipulator.manipulate(source.uri);
      configure(context);
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });
      const working: ImagePicker.ImagePickerAsset = {
        ...source,
        assetId: null,
        base64: null,
        exif: null,
        fileName: 'socialquest-photo.jpg',
        fileSize: undefined,
        height: result.height,
        mimeType: 'image/jpeg',
        type: 'image',
        uri: result.uri,
        width: result.width,
      };
      setPhotoEditor(current => current?.working.uri === source.uri ? { ...current, working } : current);
    } catch (_) {
      Alert.alert('Could not edit photo', 'That edit could not be applied. Your original photo is still safe.');
    } finally {
      photoEditInFlight.current = false;
      setPhotoEditorBusy(false);
    }
  };
  const transformPhoto = (operation: PhotoOperation) => void saveEditedImage(context => {
    if (operation === 'rotate-left') context.rotate(-90);
    if (operation === 'rotate-right') context.rotate(90);
    if (operation === 'mirror') context.flip(FlipType.Horizontal);
  });
  const cropPhoto = (ratio: number) => {
    if (!photoEditor) return;
    const { width, height } = photoEditor.working;
    if (!width || !height) return Alert.alert('Crop unavailable', 'We could not read this photo’s dimensions.');
    let cropWidth = width;
    let cropHeight = height;
    if (width / height > ratio) cropWidth = Math.floor(height * ratio);
    else cropHeight = Math.floor(width / ratio);
    void saveEditedImage(context => context.crop({
      originX: Math.floor((width - cropWidth) / 2),
      originY: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    }));
  };
  const tagCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location is off', 'Allow location access only to add an optional place tag to this post.');
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      const label = [place?.district, place?.city, place?.region, place?.country].filter(Boolean).slice(0, 2).join(', ');
      setMomentLocation(label || 'Current location');
    } catch (_) { Alert.alert('Location unavailable', 'We could not look up a place name. You can still post without it.'); }
  };
  const share = async () => {
    if (uploadInFlight.current) return;
    if (proofQuest && !momentMedia) return Alert.alert('Add your quest moment', 'Choose a photo or video reel to complete this quest.');
    if (!proofQuest && !moment.trim() && !momentMedia) return Alert.alert('Add a moment', 'Write a few words or attach a photo before posting.');
    uploadInFlight.current = true; setBusy(true);
    try {
      const uploadMedia = momentMedia;
      const uploadSize = uploadMedia ? (uploadMedia.fileSize ?? new File(uploadMedia.uri).size) : 0;
      if (typeof uploadSize === 'number' && uploadSize > MAX_UPLOAD_BYTES) throw new Error('Choose a photo or video that is 50 MB or smaller.');
      const data = new FormData();
      if (proofQuest) {
        data.append('quest', String(proofQuest.id));
        data.append('caption', moment.trim());
        data.append('media_type', uploadMedia?.type === 'video' ? 'REEL' : 'IMAGE');
      } else {
        data.append('kind', uploadMedia?.type === 'video' ? 'REEL' : 'POST');
        data.append('body', moment.trim());
        if (momentLocation) data.append('location_name', momentLocation);
      }
      if (uploadMedia) data.append('media', new File(uploadMedia.uri));
      await api(proofQuest ? '/submissions/' : '/posts/', { method: 'POST', body: data });
      setMoment('');
      setMomentMedia(null);
      setMomentLocation('');
      const completedQuest = proofQuest;
      composerDrafts.current.delete(completedQuest ? 'quest:' + completedQuest.id : 'post');
      const refreshEventId = completedQuest?.event;
      setProofQuest(null);
      setComposeOpen(false);
      await Promise.allSettled([refreshVisibleProfile(), loadFeed(), loadMe(), ...(refreshEventId ? [openEvent(refreshEventId)] : [])]);
      if (completedQuest) Alert.alert('Quest complete! ✦', '+' + completedQuest.xp_reward + ' XP earned. Your ' + (uploadMedia?.type === 'video' ? 'reel' : 'photo') + ' is now part of ' + (completedQuest.event_name || 'the event') + '.');
    } catch (error: any) { Alert.alert(proofQuest ? 'Could not share quest proof' : 'Could not share moment', error.message); } finally { uploadInFlight.current = false; setBusy(false); }
  };

  useEffect(() => { onVisibilityChange(composeOpen); }, [composeOpen, onVisibilityChange]);
  useImperativeHandle(ref, () => ({ openComposer }));
  return <><PostComposer
    visible={composeOpen}
    editingPhoto={!!photoEditor}
    busy={busy}
    media={momentMedia}
    caption={moment}
    location={momentLocation}
    author={me}
    quest={proofQuest}
    onCaption={setMoment}
    onLocation={setMomentLocation}
    onLibrary={videoOnly => void choosePhoto(videoOnly)}
    onCamera={() => void takePhoto()}
    onEdit={() => momentMedia && setPhotoEditor({ original: momentMedia, working: momentMedia })}
    onRemove={() => setMomentMedia(null)}
    onLocate={() => void tagCurrentLocation()}
    onClose={closeComposer}
    onPublish={() => void share()}
  />
    <Modal visible={!!photoEditor} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !photoEditorBusy && setPhotoEditor(null)}>
      <View style={[styles.photoEditorScreen, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.photoEditorHeader}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Cancel photo edits"
            disabled={photoEditorBusy}
            style={styles.photoEditorHeaderAction} onPress={() => setPhotoEditor(null)}>
            <Text style={styles.photoEditorCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.photoEditorTitle}>EDIT PHOTO</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Use edited photo"
            disabled={photoEditorBusy}
            style={[styles.photoEditorHeaderAction, styles.photoEditorDoneButton, photoEditorBusy && styles.dim]} onPress={() => { if (photoEditor) setMomentMedia(photoEditor.working); setPhotoEditor(null); }}>
            <Text style={styles.photoEditorDone}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.photoEditorStage}>
          {photoEditor ? <Image accessible
            accessibilityLabel="Photo being edited"
            key={photoEditor.working.uri}
            style={styles.photoEditorImage}
            source={{ uri: photoEditor.working.uri }}
            resizeMode="contain" /> : null}
          <View pointerEvents="none" style={styles.cropGrid}>
            <View style={[styles.cropGridLine, styles.cropGridVerticalOne]} />
            <View style={[styles.cropGridLine, styles.cropGridVerticalTwo]} />
            <View style={[styles.cropGridLine, styles.cropGridHorizontalOne]} />
            <View style={[styles.cropGridLine, styles.cropGridHorizontalTwo]} />
          </View>
          {photoEditorBusy ? <View style={styles.photoEditorLoading}>
            <Text style={styles.photoEditorLoadingText}>APPLYING EDIT…</Text>
          </View> : null}
        </View>
        <ScrollView style={styles.photoEditorControls} contentContainerStyle={styles.photoEditorControlsContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.photoEditorHint}>Center-crop for the feed, then rotate or mirror until the frame feels right.</Text>
          <Text style={styles.photoEditorSectionLabel}>ASPECT RATIO</Text>
          <View style={styles.photoEditorRow}>
            <Pressable accessibilityLabel="Restore original photo"
              accessibilityRole="button"
              disabled={photoEditorBusy}
              style={styles.photoEditorControl} onPress={() => setPhotoEditor(current => current ? { ...current, working: current.original } : current)}>
              <Text style={styles.photoEditorControlIcon}>↺</Text>
              <Text style={styles.photoEditorControlText}>Original</Text>
            </Pressable>
            <Pressable accessibilityLabel="Crop photo to square" accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(1)}>
              <View style={styles.ratioSquare} />
              <Text style={styles.photoEditorControlText}>Square</Text>
            </Pressable>
            <Pressable accessibilityLabel="Crop photo to portrait" accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(4 / 5)}>
              <View style={styles.ratioPortrait} />
              <Text style={styles.photoEditorControlText}>Portrait</Text>
            </Pressable>
            <Pressable accessibilityLabel="Crop photo to wide" accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => cropPhoto(16 / 9)}>
              <View style={styles.ratioLandscape} />
              <Text style={styles.photoEditorControlText}>Wide</Text>
            </Pressable>
          </View>
          <Text style={styles.photoEditorSectionLabel}>TRANSFORM</Text>
          <View style={styles.photoEditorRow}>
            <Pressable accessibilityLabel="Rotate photo left"
              accessibilityRole="button"
              disabled={photoEditorBusy}
              style={styles.photoEditorControl} onPress={() => transformPhoto('rotate-left')}>
              <Text style={styles.photoEditorControlIcon}>↶</Text>
              <Text style={styles.photoEditorControlText}>Left</Text>
            </Pressable>
            <Pressable accessibilityLabel="Rotate photo right"
              accessibilityRole="button"
              disabled={photoEditorBusy}
              style={styles.photoEditorControl} onPress={() => transformPhoto('rotate-right')}>
              <Text style={styles.photoEditorControlIcon}>↷</Text>
              <Text style={styles.photoEditorControlText}>Right</Text>
            </Pressable>
            <Pressable accessibilityLabel="Mirror photo" accessibilityRole="button" disabled={photoEditorBusy} style={styles.photoEditorControl} onPress={() => transformPhoto('mirror')}>
              <Text style={styles.photoEditorControlIcon}>⇆</Text>
              <Text style={styles.photoEditorControlText}>Mirror</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal></>;
});
