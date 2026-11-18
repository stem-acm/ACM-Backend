import { type CheckinSchedule, DAYS, type Day } from '@/schemas/checkinScheduleSchema';

/** The time zone of the check-in schedule. */
export const CHECKIN_TIME_ZONE = 'Africa/Nairobi';

/** Offset of Africa/Nairobi (EAT) from UTC. EAT has no daylight saving time. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A slot of one day of the schedule: the day and the start time, for example `tuesday-08:00`. */
export type CheckinSlot = string;

export interface CheckinValidationResult {
  allowed: boolean;
  reason?: string;
  slot?: CheckinSlot;
}

const eatFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CHECKIN_TIME_ZONE,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The day of the week and the `HH:mm` time of an instant in Africa/Nairobi. */
export function getEatDayAndTime(date: Date): { day: Day; time: string } {
  const parts = eatFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const day = part('weekday').toLowerCase() as Day;
  if (!DAYS.includes(day)) {
    throw new Error(`Unknown day: ${part('weekday')}`);
  }
  return { day, time: `${part('hour')}:${part('minute')}` };
}

/** The first and the last millisecond of the Africa/Nairobi day of an instant. */
export function getEatDayBounds(date: Date): { start: Date; end: Date } {
  const eat = new Date(date.getTime() + EAT_OFFSET_MS);
  const start = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - EAT_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS - 1) };
}

function capitalize(day: Day): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** The slot of the schedule that contains the instant, or `null` outside all slots. */
export function getCheckinSlot(date: Date, schedule: CheckinSchedule): CheckinSlot | null {
  const { day, time } = getEatDayAndTime(date);
  const today = schedule[day];
  if (!today?.open) return null;
  // A slot includes its start and excludes its end. `HH:mm` texts compare as times.
  const slot = today.slots.find((item) => item.start <= time && time < item.end);
  return slot ? `${day}-${slot.start}` : null;
}

/** Whether the schedule allows a check-in at this instant, with the reason when it does not. */
export function validateCheckinTime(
  date: Date,
  schedule: CheckinSchedule
): CheckinValidationResult {
  const { day } = getEatDayAndTime(date);
  const today = schedule[day];
  if (!today?.open || today.slots.length === 0) {
    return { allowed: false, reason: `Check-in is closed on ${capitalize(day)}.` };
  }
  const slot = getCheckinSlot(date, schedule);
  if (!slot) {
    const hours = today.slots.map((item) => `${item.start}–${item.end}`).join(', ');
    return {
      allowed: false,
      reason: `Check-in on ${capitalize(day)} is allowed ${hours}.`,
    };
  }
  return { allowed: true, slot };
}
