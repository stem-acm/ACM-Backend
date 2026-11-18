import { z } from 'zod';

/** The days of the schedule, in the order the Settings page shows them. */
export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type Day = (typeof DAYS)[number];

/** One check-in slot: `start` included, `end` excluded, both `HH:mm` in Africa/Nairobi. */
export interface ScheduleSlot {
  start: string;
  end: string;
}

export interface DaySchedule {
  open: boolean;
  slots: ScheduleSlot[];
}

export type CheckinSchedule = Record<Day, DaySchedule>;

/** The validation messages. The Settings page shows the same texts. */
export const CHECKIN_SCHEDULE_MESSAGES = {
  empty: 'Enter a start and end time.',
  order: 'End must be after start.',
  overlap: 'Slots overlap.',
  noSlot: 'Add a slot or close the day.',
} as const;

/** The most slots a day can have. */
export const MAX_SLOTS_PER_DAY = 12;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeSchema = z.string().regex(TIME_PATTERN, CHECKIN_SCHEDULE_MESSAGES.empty);

const slotSchema = z.object({ start: timeSchema, end: timeSchema }).strict();

const byStart = (a: ScheduleSlot, b: ScheduleSlot) => a.start.localeCompare(b.start);

const dayScheduleSchema = z
  .object({ open: z.boolean(), slots: z.array(slotSchema).max(MAX_SLOTS_PER_DAY) })
  .strict()
  .superRefine((day, ctx) => {
    if (!day.open) return;
    if (day.slots.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slots'],
        message: CHECKIN_SCHEDULE_MESSAGES.noSlot,
      });
      return;
    }
    // A wrong time already has its issue: compare the slots only when all times are valid.
    const validTimes = day.slots.every(
      (slot) => TIME_PATTERN.test(slot.start) && TIME_PATTERN.test(slot.end)
    );
    if (!validTimes) return;
    let ordered = true;
    day.slots.forEach((slot, index) => {
      // `HH:mm` texts compare in the same order as the times.
      if (slot.end <= slot.start) {
        ordered = false;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots', index, 'end'],
          message: CHECKIN_SCHEDULE_MESSAGES.order,
        });
      }
    });
    if (!ordered) return;
    // A slot excludes its end: 08:00–12:00 and 12:00–15:00 touch but do not overlap.
    const sorted = [...day.slots].sort(byStart);
    for (let index = 1; index < sorted.length; index++) {
      if (sorted[index].start < sorted[index - 1].end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots'],
          message: CHECKIN_SCHEDULE_MESSAGES.overlap,
        });
        return;
      }
    }
  })
  .transform(
    (day): DaySchedule =>
      day.open ? { open: true, slots: [...day.slots].sort(byStart) } : { open: false, slots: [] }
  );

/**
 * The check-in schedule: exactly the 7 days. A closed day is stored without slots and the
 * slots of an open day are stored by start time.
 */
export const checkinScheduleSchema = z
  .object(
    Object.fromEntries(DAYS.map((day) => [day, dayScheduleSchema])) as Record<
      Day,
      typeof dayScheduleSchema
    >
  )
  .strict();

const weekday = (): DaySchedule => ({
  open: true,
  slots: [
    { start: '08:00', end: '12:00' },
    { start: '15:00', end: '18:00' },
  ],
});

/** The schedule that the migration stores, and the one used when no valid value is stored. */
export const DEFAULT_CHECKIN_SCHEDULE: CheckinSchedule = {
  monday: weekday(),
  tuesday: weekday(),
  wednesday: weekday(),
  thursday: weekday(),
  friday: weekday(),
  saturday: { open: true, slots: [{ start: '09:00', end: '16:00' }] },
  sunday: weekday(),
};
