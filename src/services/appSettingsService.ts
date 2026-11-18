import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { appSettings } from '@/db/schema';
import { DEFAULT_CHECKIN_SCHEDULE } from '@/schemas/checkinScheduleSchema';
import { DEFAULT_TIMEZONE, timezoneSchema } from '@/schemas/timezoneSchema';
import { type Actor, writeLog } from '@/services/auditService';
import logger from '@/utils/logger';

/** The id of the single row of `app_settings`. */
export const APP_SETTINGS_ID = 1;

/** The name of the time zone setting in the audit logs. */
export const TIMEZONE_KEY = 'timezone';

/**
 * The time zone of the stored row. A missing row or an unknown zone gives the default
 * time zone: a database made with `drizzle-kit push` has no seeded row.
 */
function resolveTimezone(stored: { timezone: string } | undefined): string {
  if (!stored) return DEFAULT_TIMEZONE;
  const parsed = timezoneSchema.safeParse(stored.timezone);
  if (!parsed.success) {
    logger.warn('Invalid stored time zone, the default time zone is used', {
      value: stored.timezone,
    });
    return DEFAULT_TIMEZONE;
  }
  return parsed.data;
}

/**
 * The time zone of the app. Check-in times and opening hours are read in this zone.
 */
export async function getTimezone(): Promise<string> {
  const [stored] = await db
    .select({ timezone: appSettings.timezone })
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1);
  return resolveTimezone(stored);
}

/**
 * Stores a time zone that `timezoneSchema` has parsed. A save that changes the time zone
 * writes one `timezone.updated` log in the same transaction.
 */
export async function saveTimezone(timezone: string, actor: Actor): Promise<string> {
  await db.transaction(async (tx) => {
    const [stored] = await tx
      .select({ timezone: appSettings.timezone })
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .limit(1);
    const before = resolveTimezone(stored);
    const changed = before !== timezone;
    if (!changed && stored) return;

    await tx
      .insert(appSettings)
      .values({ id: APP_SETTINGS_ID, timezone, checkinSchedule: DEFAULT_CHECKIN_SCHEDULE })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { timezone, updatedAt: new Date() },
      });
    if (changed) {
      await writeLog(tx, actor, {
        type: 'timezone.updated',
        entity: 'app_settings',
        entityId: TIMEZONE_KEY,
        entityLabel: TIMEZONE_KEY,
        changes: { timezone: { before, after: timezone } },
      });
    }
  });
  return getTimezone();
}
