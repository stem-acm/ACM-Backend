import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { appSettings } from '@/db/schema';
import {
  type CheckinSchedule,
  checkinScheduleSchema,
  DAYS,
  DEFAULT_CHECKIN_SCHEDULE,
} from '@/schemas/checkinScheduleSchema';
import { type Actor, type FieldChange, writeLog } from '@/services/auditService';
import logger from '@/utils/logger';

/** The key of the check-in schedule in `app_settings`. */
export const CHECKIN_SCHEDULE_KEY = 'checkin_schedule';

/**
 * The schedule of a stored value. A missing row or an invalid value gives the default
 * schedule: a database made with `drizzle-kit push` has no seeded row.
 */
function resolveSchedule(stored: { value: unknown } | undefined): CheckinSchedule {
  if (!stored) return DEFAULT_CHECKIN_SCHEDULE;
  const parsed = checkinScheduleSchema.safeParse(stored.value);
  if (!parsed.success) {
    logger.warn('Invalid stored check-in schedule, the default schedule is used', {
      issues: parsed.error.issues,
    });
    return DEFAULT_CHECKIN_SCHEDULE;
  }
  return parsed.data;
}

/** The current check-in schedule. */
export async function getCheckinSchedule(): Promise<CheckinSchedule> {
  const [stored] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY))
    .limit(1);
  return resolveSchedule(stored);
}

/**
 * Stores a schedule that `checkinScheduleSchema` has parsed. A save that changes the
 * schedule writes one `checkin_schedule.updated` log, in the same transaction, with
 * `{ before, after }` for each changed day.
 */
export async function saveCheckinSchedule(
  schedule: CheckinSchedule,
  actor: Actor
): Promise<CheckinSchedule> {
  await db.transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY))
      .limit(1);
    const before = resolveSchedule(stored);

    const changes: Record<string, FieldChange> = {};
    for (const day of DAYS) {
      if (JSON.stringify(before[day]) !== JSON.stringify(schedule[day])) {
        changes[day] = { before: before[day], after: schedule[day] };
      }
    }
    const changed = Object.keys(changes).length > 0;
    if (!changed && stored) return;

    await tx
      .insert(appSettings)
      .values({ key: CHECKIN_SCHEDULE_KEY, value: schedule })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: schedule, updatedAt: new Date() },
      });
    if (changed) {
      await writeLog(tx, actor, {
        type: 'checkin_schedule.updated',
        entity: 'app_settings',
        entityId: CHECKIN_SCHEDULE_KEY,
        entityLabel: CHECKIN_SCHEDULE_KEY,
        changes,
      });
    }
  });
  return getCheckinSchedule();
}
