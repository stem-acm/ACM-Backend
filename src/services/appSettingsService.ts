import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { appSettings } from '@/db/schema';
import { DEFAULT_TIMEZONE, timezoneSchema } from '@/schemas/timezoneSchema';
import { type Actor, writeLog } from '@/services/auditService';
import logger from '@/utils/logger';

/** The key of the time zone of the app in `app_settings`. */
export const TIMEZONE_KEY = 'timezone';

/**
 * The time zone of a stored value. A missing row or an invalid value gives the default
 * time zone: a database made with `drizzle-kit push` has no seeded row.
 */
function resolveTimezone(stored: { value: unknown } | undefined): string {
  if (!stored) return DEFAULT_TIMEZONE;
  const parsed = timezoneSchema.safeParse(stored.value);
  if (!parsed.success) {
    logger.warn('Invalid stored time zone, the default time zone is used', {
      value: stored.value,
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
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, TIMEZONE_KEY))
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
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, TIMEZONE_KEY))
      .limit(1);
    const before = resolveTimezone(stored);
    const changed = before !== timezone;
    if (!changed && stored) return;

    await tx
      .insert(appSettings)
      .values({ key: TIMEZONE_KEY, value: timezone })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: timezone, updatedAt: new Date() },
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
