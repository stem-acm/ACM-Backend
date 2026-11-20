import { type CheckinSchedule, DAYS, type Day } from '@/schemas/checkinScheduleSchema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A slot of one day of the schedule: the day and the start time, for example `tuesday-08:00`. */
export type CheckinSlot = string;

export interface CheckinValidationResult {
  allowed: boolean;
  reason?: string;
  slot?: CheckinSlot;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** One formatter for each time zone: creating an `Intl.DateTimeFormat` is slow. */
function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formats.set(timeZone, format);
  }
  return format;
}

interface ZoneParts {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock date and time of an instant in a time zone. */
function zoneParts(date: Date, timeZone: string): ZoneParts {
  const parts = zoneFormat(timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    weekday: part('weekday'),
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    second: Number(part('second')),
  };
}

/** The offset of a time zone from UTC at an instant, in milliseconds (UTC+3 gives 3 h). */
function zoneOffset(time: number, timeZone: string): number {
  const p = zoneParts(new Date(time), timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - (time - (((time % 1000) + 1000) % 1000));
}

/** The instant of midnight at the start of a wall-clock day in a time zone. */
function zoneMidnight(year: number, month: number, day: number, timeZone: string): number {
  const wall = Date.UTC(year, month - 1, day);
  // The offset can change on that day (daylight saving time): take it at the first guess.
  const guess = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(guess, timeZone);
}

/** The day of the week and the `HH:mm` time of an instant in a time zone. */
export function getZoneDayAndTime(date: Date, timeZone: string): { day: Day; time: string } {
  const p = zoneParts(date, timeZone);
  const day = p.weekday.toLowerCase() as Day;
  if (!DAYS.includes(day)) {
    throw new Error(`Unknown day: ${p.weekday}`);
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return { day, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/**
 * The first and the last millisecond of the day of an instant in a time zone. A day with a
 * daylight saving time change lasts 23 or 25 hours.
 */
export function getZoneDayBounds(date: Date, timeZone: string): { start: Date; end: Date } {
  const p = zoneParts(date, timeZone);
  const start = zoneMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day) + DAY_MS);
  const end = zoneMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone
  );
  return { start: new Date(start), end: new Date(end - 1) };
}

function capitalize(day: Day): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** The slot of the schedule that contains the instant, or `null` outside all slots. */
export function getCheckinSlot(
  date: Date,
  schedule: CheckinSchedule,
  timeZone: string
): CheckinSlot | null {
  const { day, time } = getZoneDayAndTime(date, timeZone);
  const today = schedule[day];
  if (!today?.open) return null;
  // A slot includes its start and excludes its end. `HH:mm` texts compare as times.
  const slot = today.slots.find((item) => item.start <= time && time < item.end);
  return slot ? `${day}-${slot.start}` : null;
}

/** Whether the schedule allows a check-in at this instant, with the reason when it does not. */
export function validateCheckinTime(
  date: Date,
  schedule: CheckinSchedule,
  timeZone: string
): CheckinValidationResult {
  const { day } = getZoneDayAndTime(date, timeZone);
  const today = schedule[day];
  if (!today?.open || today.slots.length === 0) {
    return { allowed: false, reason: `Check-in is closed on ${capitalize(day)}.` };
  }
  const slot = getCheckinSlot(date, schedule, timeZone);
  if (!slot) {
    const hours = today.slots.map((item) => `${item.start}–${item.end}`).join(', ');
    return {
      allowed: false,
      reason: `Check-in on ${capitalize(day)} is allowed ${hours}.`,
    };
  }
  return { allowed: true, slot };
}

/** A slot of a day of the schedule, with its day. */
export interface DaySlot {
  day: Day;
  start: string;
  end: string;
}

/** The place of a slot of today relative to the current time. */
export type SlotState = 'ended' | 'current' | 'next' | 'later';

export interface SlotOverview {
  /** The day and the `HH:mm` wall-clock time of the instant in the time zone. */
  day: Day;
  time: string;
  /** The day is closed or has no slot. */
  closedToday: boolean;
  /** The slot that contains the instant, or `null` outside all slots. */
  slot: (DaySlot & { id: CheckinSlot }) | null;
  /** The slots of today, sorted by start time. Empty on a closed day. */
  todaySlots: { start: string; end: string; state: SlotState }[];
  /** The next slot that starts after the instant: later today, else on the next open day. */
  nextSlot: DaySlot | null;
}

function openSlots(schedule: CheckinSchedule, day: Day) {
  const value = schedule[day];
  if (!value?.open) return [];
  return [...value.slots].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The slots of the day of an instant and where the instant is among them. A slot includes its
 * start and excludes its end, as in `getCheckinSlot`.
 */
export function getSlotOverview(
  date: Date,
  schedule: CheckinSchedule,
  timeZone: string
): SlotOverview {
  const { day, time } = getZoneDayAndTime(date, timeZone);
  const slots = openSlots(schedule, day);
  const current = slots.find((item) => item.start <= time && time < item.end);
  const nextToday = slots.find((item) => item.start > time);

  const todaySlots = slots.map((item) => {
    let state: SlotState = 'later';
    if (item === current) state = 'current';
    else if (item.end <= time) state = 'ended';
    else if (item === nextToday) state = 'next';
    return { start: item.start, end: item.end, state };
  });

  let nextSlot: DaySlot | null = nextToday
    ? { day, start: nextToday.start, end: nextToday.end }
    : null;
  // The next open day, up to the same day of the next week.
  const index = DAYS.indexOf(day);
  for (let offset = 1; !nextSlot && offset <= DAYS.length; offset++) {
    const nextDay = DAYS[(index + offset) % DAYS.length];
    const [first] = openSlots(schedule, nextDay);
    if (first) nextSlot = { day: nextDay, start: first.start, end: first.end };
  }

  return {
    day,
    time,
    closedToday: slots.length === 0,
    slot: current
      ? { id: `${day}-${current.start}`, day, start: current.start, end: current.end }
      : null,
    todaySlots,
    nextSlot,
  };
}
