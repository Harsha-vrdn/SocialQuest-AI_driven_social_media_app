import {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {SoftPressable as Pressable} from './Motion';
import {colors, fonts} from './theme';
import {calendarDays, dateParts, eventDateLabel, eventTimeLabel, localDateTimeDate, localDateTimeValue, parseLocalDateTime, type LocalDateTime} from './eventDateTime';

type Props = {label: string; value: string; minimum?: string; onConfirm: (value: string) => void; onCancel: () => void};
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function EventDateTimeField({label, value, disabled, onPress}: {label: string; value: string; disabled?: boolean; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${eventDateLabel(value)}, ${eventTimeLabel(value)}`} accessibilityHint="Choose a date from the calendar and set the time" disabled={disabled} onPress={onPress} style={[s.field, disabled && s.dim]}>
    <View style={s.fieldIcon}><Ionicons name="calendar-outline" size={23} color={colors.accent} /></View>
    <View style={s.fieldCopy}><Text style={s.label}>{label}</Text><Text style={s.fieldDate}>{eventDateLabel(value)}</Text><Text style={s.fieldTime}>{eventTimeLabel(value)}</Text></View>
    <Ionicons name="chevron-forward" size={19} color={colors.muted} />
  </Pressable>;
}

// This replaces the form inside its existing modal, avoiding stacked native sheets.
export function EventDateTimePicker({label, value, minimum, onConfirm, onCancel}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<LocalDateTime>(() => parseLocalDateTime(value) || dateParts(new Date()));
  const [month, setMonth] = useState(() => ({year: draft.year, month: draft.month}));
  const [error, setError] = useState('');
  const today = dateParts(new Date());
  const minimumParts = minimum ? parseLocalDateTime(minimum) : null;
  const change = (parts: Partial<LocalDateTime>) => {setDraft(current => ({...current, ...parts})); setError('');};
  const moveMonth = (offset: number) => {
    const date = new Date(month.year, month.month + offset, 1);
    setMonth({year: date.getFullYear(), month: date.getMonth()});
  };
  const selectedValue = localDateTimeValue(draft);
  const displayHour = draft.hour % 12 || 12;
  const period = draft.hour >= 12 ? 'PM' : 'AM';
  const confirm = () => {
    const selected = localDateTimeDate(draft);
    if (!selected) {setError('That time is unavailable in your time zone. Choose another time.'); return;}
    const earliest = minimumParts && localDateTimeDate(minimumParts);
    if (earliest && selected <= earliest) {setError('Choose an end time after the event starts.'); return;}
    onConfirm(selectedValue);
  };

  return <View style={[s.screen, {paddingTop: Math.max(insets.top, 18)}]}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Cancel date and time changes" onPress={onCancel} style={s.iconButton}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable><View style={s.fieldCopy}><Text style={s.kicker}>PLAN YOUR ADVENTURE</Text><Text style={s.title}>{label}</Text></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.summary}><Ionicons name="calendar-outline" size={22} color={colors.accent} /><View style={s.fieldCopy}><Text style={s.summaryDate}>{new Date(draft.year, draft.month, draft.day).toLocaleDateString('en', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})}</Text><Text style={s.summaryTime}>{`${displayHour}:${String(draft.minute).padStart(2, '0')} ${period}`}</Text></View></View>
      <Text style={s.hint}>Dates and times use your device’s local time zone.</Text>
      <View style={s.calendar}>
        <View style={s.monthRow}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={s.iconButton}><Ionicons name="chevron-back" size={21} color={colors.accent} /></Pressable><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.month}>{new Date(month.year, month.month, 1).toLocaleDateString('en', {month: 'long', year: 'numeric'})}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={s.iconButton}><Ionicons name="chevron-forward" size={21} color={colors.accent} /></Pressable></View>
        <View style={s.grid}>{weekdays.map(day => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
        <View style={s.grid}>{calendarDays(month.year, month.month).map((day, index) => {
          if (day === null) return <View key={'blank-' + index} style={s.daySlot} />;
          const date = new Date(month.year, month.month, day);
          const selected = month.year === draft.year && month.month === draft.month && day === draft.day;
          const isToday = month.year === today.year && month.month === today.month && day === today.day;
          const disabled = !!minimumParts && date < new Date(minimumParts.year, minimumParts.month, minimumParts.day);
          return <Pressable key={day} feedback="none" accessibilityRole="button" accessibilityLabel={date.toLocaleDateString('en', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}) + (isToday ? ', today' : '')} accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => change({year: month.year, month: month.month, day})} style={[s.daySlot, s.day, selected && s.selectedDay, disabled && s.dim]}><Text style={[s.dayText, isToday && s.todayText, selected && s.selectedText]}>{day}</Text></Pressable>;
        })}</View>
      </View>
      <View style={s.timeHeading}><Ionicons name="time-outline" size={20} color={colors.muted} /><Text style={s.section}>Time</Text><View style={s.periods}>{(['AM', 'PM'] as const).map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} accessibilityState={{selected: period === item}} onPress={() => change({hour: draft.hour % 12 + (item === 'PM' ? 12 : 0)})} style={[s.period, period === item && s.selectedChoice]}><Text style={[s.choiceText, period === item && s.selectedText]}>{item}</Text></Pressable>)}</View></View>
      <Text style={s.label}>HOUR</Text><View style={s.choices}>{Array.from({length: 12}, (_, index) => index + 1).map(hour => <Pressable key={hour} accessibilityRole="button" accessibilityLabel={`${hour} ${period}`} accessibilityState={{selected: displayHour === hour}} onPress={() => change({hour: hour % 12 + (period === 'PM' ? 12 : 0)})} style={[s.choice, displayHour === hour && s.selectedChoice]}><Text style={[s.choiceText, displayHour === hour && s.selectedText]}>{hour}</Text></Pressable>)}</View>
      <View style={s.minuteHeading}><Text style={s.label}>MINUTE</Text><View style={s.precision}><Pressable accessibilityRole="button" accessibilityLabel="Decrease minutes" disabled={draft.minute === 0} onPress={() => change({minute: Math.max(0, draft.minute - 1)})} style={[s.iconButton, draft.minute === 0 && s.dim]}><Ionicons name="remove" size={19} color={colors.accent} /></Pressable><Text style={s.minuteValue}>{String(draft.minute).padStart(2, '0')}</Text><Pressable accessibilityRole="button" accessibilityLabel="Increase minutes" disabled={draft.minute === 59} onPress={() => change({minute: Math.min(59, draft.minute + 1)})} style={[s.iconButton, draft.minute === 59 && s.dim]}><Ionicons name="add" size={19} color={colors.accent} /></Pressable></View></View>
      <View style={s.choices}>{Array.from({length: 12}, (_, index) => index * 5).map(minute => <Pressable key={minute} accessibilityRole="button" accessibilityLabel={`${String(minute).padStart(2, '0')} minutes`} accessibilityState={{selected: draft.minute === minute}} onPress={() => change({minute})} style={[s.choice, draft.minute === minute && s.selectedChoice]}><Text style={[s.choiceText, draft.minute === minute && s.selectedText]}>{String(minute).padStart(2, '0')}</Text></Pressable>)}</View>
      {minimum ? <Text style={s.hint}>After {eventDateLabel(minimum)} at {eventTimeLabel(minimum)}</Text> : null}
    </ScrollView>
    <View style={[s.footer, {paddingBottom: Math.max(insets.bottom, 16)}]}>{error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}<Pressable accessibilityRole="button" accessibilityLabel="Confirm date and time" onPress={confirm} style={s.done}><Text style={s.doneText}>Set {label.toLowerCase()}</Text><Ionicons name="checkmark" size={20} color="#FFFFFF" /></Pressable></View>
  </View>;
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14},
  title: {fontFamily: fonts.heading, color: colors.text, fontSize: 22, lineHeight: 28},
  kicker: {fontFamily: fonts.bold, color: colors.sky, fontSize: 11, lineHeight: 16, marginBottom: 5},
  field: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 12},
  fieldIcon: {width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center'},
  fieldCopy: {flex: 1, minWidth: 0},
  label: {fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, color: colors.muted},
  fieldDate: {fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 3},
  fieldTime: {fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, color: colors.text, marginTop: 2},
  content: {paddingHorizontal: 20, paddingBottom: 22},
  summary: {padding: 16, borderRadius: 20, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 13},
  summaryDate: {fontFamily: fonts.bold, fontSize: 16, lineHeight: 24, color: colors.text},
  summaryTime: {fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, color: colors.text, marginTop: 3},
  hint: {fontFamily: fonts.copy, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 10},
  calendar: {marginHorizontal: -14, marginTop: 20},
  monthRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 12},
  month: {fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, color: colors.text},
  iconButton: {width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  weekday: {width: '14.285714%', textAlign: 'center', fontFamily: fonts.copy, fontSize: 12, color: colors.muted, paddingBottom: 8},
  daySlot: {width: '14.285714%', minHeight: 44},
  day: {alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 2, borderColor: colors.background},
  dayText: {fontFamily: fonts.bold, fontSize: 18, color: colors.text},
  todayText: {color: colors.gold, textDecorationLine: 'underline'},
  selectedDay: {backgroundColor: colors.primary},
  selectedText: {color: '#FFFFFF'},
  timeHeading: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 14},
  section: {lineHeight: 26, fontFamily: fonts.bold, fontSize: 18, color: colors.text, flex: 1},
  periods: {flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 15, padding: 3},
  period: {minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginHorizontal: -4, marginTop: 8},
  choice: {flexBasis: '14%', flexGrow: 1, minWidth: 44, minHeight: 44, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderRadius: 13},
  choiceText: {fontFamily: fonts.bold, fontSize: 17, color: colors.muted},
  selectedChoice: {backgroundColor: colors.primary},
  minuteHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17},
  precision: {flexDirection: 'row', alignItems: 'center', gap: 8},
  minuteValue: {fontFamily: fonts.bold, fontSize: 19, color: colors.accent, minWidth: 26, textAlign: 'center'},
  footer: {paddingTop: 12, paddingHorizontal: 20, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border},
  done: {paddingVertical: 12, minHeight: 48, backgroundColor: colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10},
  doneText: {lineHeight: 20, fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF'},
  error: {fontFamily: fonts.copy, fontSize: 15, lineHeight: 22, color: colors.danger, marginBottom: 10},
  dim: {opacity: 0.35},
});
