import { z } from 'zod';

/** The time zone of Mahajanga. `Indian/Antananarivo` is UTC+3 and has no daylight saving time. */
export const DEFAULT_TIMEZONE = 'Indian/Antananarivo';

export const TIMEZONE_MESSAGE = 'Unknown time zone.';

let supportedZones: ReadonlySet<string> | undefined;

/** Whether `value` is an IANA time zone name that `Intl` knows. */
export function isValidTimeZone(value: string): boolean {
  supportedZones ??= new Set(Intl.supportedValuesOf('timeZone'));
  if (supportedZones.has(value)) return true;
  // `supportedValuesOf` lists only the canonical names: `UTC` and the links are not in it.
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value.length > 0;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string({
    required_error: TIMEZONE_MESSAGE,
    invalid_type_error: TIMEZONE_MESSAGE,
  })
  .refine(isValidTimeZone, TIMEZONE_MESSAGE);

/** The body of `PUT /api/settings/timezone`. */
export const timezoneInputSchema = z.object({ timezone: timezoneSchema });
