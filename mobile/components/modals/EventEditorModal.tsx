import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppStyles } from '../../appStyles';
import { dateParts, localDateTimeValue, updateEventSchedule, type EventSchedule } from '../../eventDateTime';
import { EventDateTimeField, EventDateTimePicker } from '../../EventDateTimePicker';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { locateHostVenue } from '../../hostingLocation';
import { MotionModal as Modal, SoftPressable as Pressable } from '../../Motion';
import type { Place } from '../../placeSearch';
import { PlaceSuggestions } from '../../PlaceSuggestions';
import { useTheme } from '../../ThemeProvider';
import type { EventEditor, EventItem } from '../../types';
import { iconLabelRow } from '../../utils/social';

type Props = Pick<SocialQuestController, 'api' | 'loadMe' | 'loadDiscover' | 'openEvent' | 'setEventEditorClosing' | 'setEventEditorVisible'> & { ref?: Ref<EventEditorHandle> };

export type EventEditorHandle = { openEventEditor: (event?: EventItem) => void };

export const EventEditorModal = memo(function EventEditorModal({ api, loadMe, loadDiscover, openEvent, setEventEditorClosing, setEventEditorVisible, ref }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [eventEditor, setEventEditor] = useState<EventEditor | null>(null);
  const [eventDateField, setEventDateField] = useState<keyof EventSchedule | null>(null);
  const eventEditorVersion = useRef(0);
  const eventLocationRequest = useRef(0);
  const eventSaveInFlight = useRef(false);
  const [eventLocating, setEventLocating] = useState(false);
  const [eventLocationStatus, setEventLocationStatus] = useState('');
  const editDateValue = (value: string) => {
    if (!value) return '';
    return localDateTimeValue(dateParts(new Date(value)));
  };
  const closeEventEditor = () => {
    Keyboard.dismiss();
    // iOS keeps the presenting controller alive through its dismissal animation.
    // Wait for onDismiss before showing the saved event underneath it.
    setEventEditorClosing(Platform.OS === 'ios');
    eventEditorVersion.current += 1; eventLocationRequest.current += 1;
    setEventEditor(null); setEventDateField(null); setEventLocating(false); setEventLocationStatus('');
  };
  const detectEventLocation = async () => {
    const request = ++eventLocationRequest.current;
    const editor = eventEditorVersion.current;
    const isCurrent = () => request === eventLocationRequest.current && editor === eventEditorVersion.current;
    setEventLocating(true); setEventLocationStatus('Finding your location…');
    try {
      const place = await locateHostVenue();
      if (!isCurrent()) return;
      setEventEditor(current => current ? { ...current, ...place } : current);
      setEventLocationStatus('Location detected. Check the venue before publishing.');
    } catch (error: any) {
      if (isCurrent()) setEventLocationStatus(error.message || 'Location is unavailable. Enter the venue below.');
    } finally { if (isCurrent()) setEventLocating(false); }
  };
  const changeEventLocation = (value: string) => {
    eventLocationRequest.current += 1;
    setEventLocating(false); setEventLocationStatus('');
    setEventEditor(current => current ? { ...current, location_name: value, latitude: null, longitude: null } : current);
  };
  const pickEventPlace = (place: Place) => {
    eventLocationRequest.current += 1;
    setEventLocating(false); setEventLocationStatus('Venue chosen from search. Check it before publishing.');
    setEventEditor(current => current ? { ...current, location_name: place.label, latitude: place.latitude, longitude: place.longitude } : current);
    Keyboard.dismiss();
  };
  const openEventEditor = (event?: EventItem) => {
    eventEditorVersion.current += 1; eventLocationRequest.current += 1;
    setEventDateField(null);
    setEventLocating(false); setEventLocationStatus('');
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setEventEditor(event ? {
      id: event.id, name: event.name, description: event.description, location_name: event.location_name,
      latitude: event.latitude ?? null, longitude: event.longitude ?? null,
      starts_at: editDateValue(event.starts_at), ends_at: editDateValue(event.ends_at), capacity: String(event.capacity), privacy: event.privacy,
    } : { name: '', description: '', location_name: '', latitude: null, longitude: null, starts_at: editDateValue(start.toISOString()), ends_at: editDateValue(end.toISOString()), capacity: '12', privacy: 'PUBLIC' });
    if (!event) void detectEventLocation();
  };
  const saveEvent = async () => {
    if (!eventEditor || busy || eventLocating || eventSaveInFlight.current) return;
    const capacity = Number(eventEditor.capacity);
    const starts = new Date(eventEditor.starts_at);
    const ends = new Date(eventEditor.ends_at);
    if (!eventEditor.name.trim() || !eventEditor.description.trim() || !eventEditor.location_name.trim() || !Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts || !Number.isInteger(capacity) || capacity < 2) {
      return Alert.alert('Check event details', 'Add a name, description, venue, an end time after the start, and a whole-number capacity of at least 2.');
    }
    eventSaveInFlight.current = true; setBusy(true);
    try {
      const payload = { ...eventEditor, capacity, starts_at: starts.toISOString(), ends_at: ends.toISOString() };
      delete (payload as any).id;
      const saved = await api(eventEditor.id ? '/events/' + eventEditor.id + '/' : '/events/', { method: eventEditor.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (!eventEditor.id) await api('/events/' + saved.id + '/generate-quests/', { method: 'POST', body: '{}' }).catch(() => { });
      closeEventEditor();
      await Promise.allSettled([loadMe(), loadDiscover(), openEvent(saved.id)]);
    } catch (error: any) { Alert.alert('Could not save event', error.message); }
    finally { eventSaveInFlight.current = false; setBusy(false); }
  };
  useEffect(() => { setEventEditorVisible(!!eventEditor); }, [!!eventEditor, setEventEditorVisible]);
  useEffect(() => () => { eventEditorVersion.current++; eventLocationRequest.current++; }, []);
  useImperativeHandle(ref, () => ({ openEventEditor }));
  return <><Modal visible={!!eventEditor}
    onDismiss={() => setEventEditorClosing(false)}
    animationType="slide"
    presentationStyle="pageSheet"
    onRequestClose={() => { if (!busy) { if (eventDateField) setEventDateField(null); else closeEventEditor(); } }}>
    <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {eventEditor && eventDateField ? <EventDateTimePicker key={eventDateField}
        label={eventDateField === 'starts_at' ? 'Start time' : 'End time'}
        value={eventEditor[eventDateField]}
        minimum={eventDateField === 'ends_at' ? eventEditor.starts_at : undefined}
        onCancel={() => setEventDateField(null)}
        onConfirm={value => {
          setEventEditor(current => current && { ...current, ...updateEventSchedule(current, eventDateField, value) });
          setEventDateField(null);
        }} /> : null}
      <ScrollView style={eventDateField ? { display: 'none' } : undefined}
        contentContainerStyle={[styles.profile, { paddingTop: Math.max(insets.top, 24) }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>HOST CONSOLE</Text>
        <Text style={styles.sheetTitle}>{eventEditor?.id ? 'Edit adventure' : 'Host an adventure'}</Text>
        <Text style={styles.sheetCopy}>Choose a place, pick a date, and bring people together. You can change every detail later.</Text>
        <Text style={styles.authLabel}>EVENT NAME</Text>
        <TextInput style={styles.input}
          accessibilityLabel="Event name"
          placeholder="Event name"
          placeholderTextColor={colors.muted}
          maxLength={120}
          value={eventEditor?.name || ''}
          onChangeText={value => setEventEditor(current => current && { ...current, name: value })} />
        <Text style={styles.authLabel}>DESCRIPTION</Text>
        <TextInput style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          accessibilityLabel="Event description"
          placeholder="What will people do?"
          placeholderTextColor={colors.muted}
          maxLength={2000}
          multiline
          value={eventEditor?.description || ''}
          onChangeText={value => setEventEditor(current => current && { ...current, description: value })} />
        <Text style={styles.authLabel}>VENUE</Text>
        <Pressable accessibilityLabel={eventLocating ? 'Detecting location…' : 'Detect my location'}
          accessibilityRole="button"
          disabled={busy || eventLocating}
          style={[styles.outline, iconLabelRow, eventLocating && styles.dim]} onPress={() => void detectEventLocation()}>
          <Ionicons name="locate-outline" size={18} color={colors.accent} />
          <Text style={styles.outlineText}>{eventLocating ? 'Detecting location…' : 'Detect my location'}</Text>
        </Pressable>
        {eventLocationStatus ? <Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{eventLocationStatus}</Text> : null}
        <TextInput style={styles.input}
          accessibilityLabel="Event location"
          placeholder="Venue or address"
          placeholderTextColor={colors.muted}
          maxLength={160}
          value={eventEditor?.location_name || ''}
          onChangeText={changeEventLocation} />
        <PlaceSuggestions query={eventEditor?.location_name || ''} active={eventEditor?.latitude == null && eventEditor?.longitude == null} maxLength={160} onPick={pickEventPlace} />
        <Text style={styles.authLabel}>WHEN</Text>
        <EventDateTimeField label="Starts at" disabled={busy} value={eventEditor?.starts_at || ''} onPress={() => { Keyboard.dismiss(); setEventDateField('starts_at'); }} />
        <EventDateTimeField label="Ends at" disabled={busy} value={eventEditor?.ends_at || ''} onPress={() => { Keyboard.dismiss(); setEventDateField('ends_at'); }} />
        <Text style={styles.personMeta}>Times are local to your device. If you move the start beyond the end, the end adjusts to keep the same duration.</Text>
        <Text style={styles.authLabel}>CAPACITY</Text>
        <TextInput style={styles.input}
          accessibilityLabel="Capacity"
          placeholder="Capacity"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          value={eventEditor?.capacity || ''}
          onChangeText={value => setEventEditor(current => current && { ...current, capacity: value })} />
        <View style={styles.ratingActions}>
          {(['PUBLIC', 'PRIVATE'] as const).map(privacy => <Pressable accessibilityLabel={privacy === 'PUBLIC' ? 'Public event' : 'Invite only'}
            accessibilityRole="button"
            key={privacy}
            style={[styles.ratingChoice, eventEditor?.privacy === privacy && styles.ratingChoiceSelected]} onPress={() => setEventEditor(current => current && { ...current, privacy })}>
            <Text style={[styles.ratingChoiceText, eventEditor?.privacy === privacy && styles.ratingChoiceSelectedText]}>{privacy === 'PUBLIC' ? 'Public event' : 'Invite only'}</Text>
          </Pressable>)}
        </View>
        <Pressable accessibilityLabel={busy ? 'Saving…' : eventEditor?.id ? 'Save event' : 'Publish and generate quests'}
          accessibilityRole="button"
          disabled={busy || eventLocating}
          style={[styles.primary, (busy || eventLocating) && styles.dim]} onPress={() => void saveEvent()}>
          <Text style={styles.primaryText}>{busy ? 'Saving…' : eventEditor?.id ? 'Save event' : 'Publish and generate quests'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Cancel" accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={closeEventEditor}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal></>;
});
