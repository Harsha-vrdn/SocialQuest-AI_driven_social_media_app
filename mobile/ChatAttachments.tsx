import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import {Directory, File, Paths} from 'expo-file-system';
import {useVideoPlayer, VideoView} from 'expo-video';
import {DetailSheet} from './DetailSheet';
import {ImageViewer} from './ImageViewer';
import {SoftPressable as Pressable} from './Motion';
import {useTheme} from './ThemeProvider';
import {MessageStatus} from './MessageStatus';
import {AttachmentClient, checkSize, fileSize, imageMime, videoMime, type AttachmentRef, type Context, type Metadata, type Prepared} from './attachmentProtocol';

type Draft = Metadata & {uri: string};
export function ChatAttachmentButton({client, conversation, onSent}: {client: AttachmentClient | null; conversation: number; onSent: (message: any) => void}) {
  const {theme: {colors}} = useTheme();
  const [draft, setDraft] = useState<Draft | null>(null), [caption, setCaption] = useState(''), [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const prepared = useRef<Prepared | null>(null), sending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => {mounted.current = false;}; }, []);
  const choose = async (photos: boolean) => {
    try {
      let item: Draft;
      if (photos) {
        const picked = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images', 'videos'], quality: 1});
        if (picked.canceled) return;
        const asset = picked.assets[0], file = new File(asset.uri);
        item = {uri: asset.uri, name: asset.fileName || file.name || 'photo', mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'), size: file.size};
      } else {
        const picked = await DocumentPicker.getDocumentAsync({copyToCacheDirectory: true, multiple: false});
        if (picked.canceled) return;
        const asset = picked.assets[0];
        item = {uri: asset.uri, name: asset.name, mime: asset.mimeType || 'application/octet-stream', size: new File(asset.uri).size};
      }
      checkSize(item.size);
      if (mounted.current) { prepared.current = null; setCaption(''); setSendError(''); setDraft(item); }
    } catch (error: any) { if (mounted.current) Alert.alert('Could not attach file', error.message); }
  };
  const send = async () => {
    if (!draft || !client || sending.current) return;
    sending.current = true; setBusy(true); setSendError('');
    try {
      if (!prepared.current) prepared.current = await client.prepare(conversation, await new File(draft.uri).bytes(), draft, caption);
      const message = await client.send(prepared.current);
      // The server accepted it: UI refresh failures must never trigger a re-send.
      prepared.current = null;
      if (mounted.current) {setDraft(null); setCaption(''); onSent(message);}
    } catch (error: any) {
      if (mounted.current) {setSendError(error.message || 'Check your connection and retry.'); Alert.alert('Attachment not sent', error.message + '\nYou can retry this exact attachment.');}
    } finally {sending.current = false; if (mounted.current) setBusy(false);}
  };
  return <><Pressable accessibilityRole="button" accessibilityLabel="Attach photo, video, or file" onPress={() => client ? Alert.alert('Add an attachment', 'Up to 25 MB. Encrypted files stay on the relay for at most 24 hours.', [{text: 'Photos / videos', onPress: () => void choose(true)}, {text: 'Files', onPress: () => void choose(false)}, {text: 'Cancel', style: 'cancel'}]) : Alert.alert('Attachments unavailable', 'Wait for your account to finish loading, then try again.')} style={{width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}}><Ionicons name="add" size={24} color={colors.muted} /></Pressable>
    {draft ? <DetailSheet visible onClose={() => {if (!sending.current) setDraft(null);}} title="Send attachment" closeLabel="Cancel attachment"><ScrollView contentContainerStyle={{padding: 20, gap: 14}} keyboardShouldPersistTaps="handled">
      {imageMime(draft.mime) ? <Image source={{uri: draft.uri}} style={{width: '100%', height: 180, borderRadius: 12}} resizeMode="contain" /> : <Ionicons name={videoMime(draft.mime) ? 'videocam-outline' : 'document-outline'} size={48} color={colors.accent} />}
      <Text style={{color: colors.text, fontWeight: '700'}}>{draft.name}</Text><Text style={{color: colors.muted}}>{fileSize(draft.size)}</Text>
      {busy || sendError ? <MessageStatus status={busy ? 'sending' : 'failed'} retryHint={false} /> : null}
      <TextInput accessibilityLabel="Attachment caption" placeholder="Add a caption (optional)" placeholderTextColor={colors.muted} value={caption} onChangeText={setCaption} editable={!busy && !prepared.current} maxLength={2000} multiline style={{color: colors.text, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border}} />
      <Text style={{color: colors.muted, fontSize: 12, lineHeight: 18}}>Only the file is encrypted; captions and chat text are not. Recipients must open the app within 24 hours to save it. Saved files stay on their devices.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Sending encrypted attachment' : 'Send attachment'} disabled={busy} onPress={() => void send()} style={{backgroundColor: colors.accent, borderRadius: 14, padding: 15, alignItems: 'center'}}>{busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{color: colors.onPrimary, fontWeight: '700'}}>Send attachment ↑</Text>}</Pressable>
    </ScrollView></DetailSheet> : null}</>;
}

function AttachmentVideo({uri}: {uri: string}) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={{width: 230, height: 170, borderRadius: 10}} />;
}

export function ChatAttachmentBubble({client, attachment, conversation, sender, mine}: {client: AttachmentClient | null; attachment: AttachmentRef; conversation: number; sender: number; mine: boolean}) {
  const {theme: {colors}} = useTheme();
  const [saved, setSaved] = useState<{uri: string; metadata: Metadata} | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [viewing, setViewing] = useState(false);
  useEffect(() => {
    let active = true; let preview: File | undefined;
    setSaved(null); setError('');
    if (client) void client.receive({...attachment, conversation, sender} as AttachmentRef & Context).then(async opened => {
      if (!active) return;
      const directory = new Directory(Paths.cache, 'chat-previews', await client.uuid());
      if (!active) return;
      directory.create({intermediates: true, idempotent: true});
      preview = new File(directory, opened.metadata.name); preview.write(opened.bytes);
      if (active) setSaved({uri: preview.uri, metadata: opened.metadata});
    }).catch(error => {if (active) setError(error.message || 'Could not save attachment. Tap to retry.');});
    return () => {active = false; if (preview?.exists) {const parent = preview.parentDirectory; preview.delete(); parent.delete();}};
  }, [client, attachment.id, attachment.sha256, conversation, sender, retry]);
  const color = mine ? colors.onPrimary : colors.text;
  if (!saved) return <Pressable accessibilityRole="button" accessibilityLabel={error || 'Saving encrypted attachment'} onPress={() => setRetry(n => n + 1)} style={{paddingVertical: 12, maxWidth: 230}}>{error ? <Text style={{color, fontSize: 12}}>{error} Tap to retry.</Text> : <><ActivityIndicator color={color} /><Text style={{color, fontSize: 12}}>Saving encrypted attachment…</Text></>}</Pressable>;
  const {uri, metadata} = saved;
  return <View style={{gap: 7, paddingVertical: 6, maxWidth: 230}}>
    {imageMime(metadata.mime) ? <Pressable accessibilityRole="button" accessibilityLabel="Open attached photo" onPress={() => setViewing(true)}><Image source={{uri}} style={{width: 230, height: 170, borderRadius: 10}} resizeMode="cover" /></Pressable> : videoMime(metadata.mime) ? <AttachmentVideo uri={uri} /> : <Ionicons name="document-attach-outline" size={30} color={color} />}
    <Text style={{color, fontWeight: '700'}} numberOfLines={2}>{metadata.name}</Text><Text style={{color, fontSize: 11}}>{fileSize(metadata.size)} · saved on this device</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={'Save or share ' + metadata.name} onPress={() => void Sharing.shareAsync(uri, {mimeType: metadata.mime, dialogTitle: metadata.name}).catch(error => Alert.alert('Could not share file', error.message))} style={{paddingVertical: 6}}><Text style={{color, fontWeight: '600'}}>Save / share ↗</Text></Pressable>
    {viewing ? <ImageViewer uri={uri} onClose={() => setViewing(false)} /> : null}
  </View>;
}
