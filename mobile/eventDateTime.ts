export type LocalDateTime = {year: number; month: number; day: number; hour: number; minute: number};
export type EventSchedule = {starts_at: string; ends_at: string};
const pad = (value: number) => String(value).padStart(2, '0');

export function dateParts(date: Date): LocalDateTime {
  return {year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: date.getHours(), minute: date.getMinutes()};
}

export function localDateTimeValue(parts: LocalDateTime) {
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

// Keep device-local wall time separate from the UTC timestamp sent to the API.
export function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const parts = {year, month: month - 1, day, hour, minute};
  return localDateTimeDate(parts) ? parts : null;
}

export function localDateTimeDate(parts: LocalDateTime): Date | null {
  const {year, month, day, hour, minute} = parts;
  if (![year, month, day, hour, minute].every(Number.isInteger) || year < 1000 || year > 9999 || month < 0 || month > 11 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const date = new Date(year, month, day, hour, minute);
  // Reject impossible calendar dates and local times skipped by daylight saving.
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute ? date : null;
}

export function calendarDays(year: number, month: number): Array<number | null> {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const slots = Math.ceil((offset + count) / 7) * 7;
  return Array.from({length: slots}, (_, index) => index >= offset && index < offset + count ? index - offset + 1 : null);
}

export function eventDateLabel(value: string) {
  const parts = parseLocalDateTime(value);
  const date = parts && localDateTimeDate(parts);
  return date ? date.toLocaleDateString('en', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'}) : 'Choose a date';
}

export function eventTimeLabel(value: string) {
  const parts = parseLocalDateTime(value);
  return parts ? `${parts.hour % 12 || 12}:${pad(parts.minute)} ${parts.hour >= 12 ? 'PM' : 'AM'}` : 'Choose a time';
}

export function updateEventSchedule(schedule: EventSchedule, field: keyof EventSchedule, value: string): EventSchedule {
  const next = {...schedule, [field]: value};
  if (field === 'starts_at') {
    const oldStart = parseLocalDateTime(schedule.starts_at), oldEnd = parseLocalDateTime(schedule.ends_at), newStart = parseLocalDateTime(value);
    if (oldStart && oldEnd && newStart) {
      const start = localDateTimeDate(newStart)!, end = localDateTimeDate(oldEnd)!;
      if (end <= start) {
        const duration = Math.max(60000, end.getTime() - localDateTimeDate(oldStart)!.getTime());
        next.ends_at = localDateTimeValue(dateParts(new Date(start.getTime() + duration)));
      }
    }
  }
  return next;
}
