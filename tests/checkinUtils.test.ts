import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CheckinSchedule,
  DEFAULT_CHECKIN_SCHEDULE,
} from '../src/schemas/checkinScheduleSchema';
import { DEFAULT_TIMEZONE } from '../src/schemas/timezoneSchema';
import * as utils from '../src/utils/checkinUtils';

const schedule = DEFAULT_CHECKIN_SCHEDULE;
const zone = DEFAULT_TIMEZONE;

// The functions in the default time zone of the app. Each test can give another zone.
const getCheckinSlot = (date: Date, value: CheckinSchedule, timeZone = zone) =>
  utils.getCheckinSlot(date, value, timeZone);
const validateCheckinTime = (date: Date, value: CheckinSchedule, timeZone = zone) =>
  utils.validateCheckinTime(date, value, timeZone);
const { getZoneDayAndTime, getZoneDayBounds } = utils;

// 2026-11-10 is a Tuesday. Mahajanga (Indian/Antananarivo) is UTC+3.
const at = (iso: string) => new Date(iso);

test('a Tuesday at 08:00 in Mahajanga is in the slot tuesday-08:00', () => {
  assert.equal(getCheckinSlot(at('2026-11-10T05:00:00Z'), schedule), 'tuesday-08:00');
  assert.equal(getCheckinSlot(at('2026-11-10T08:59:00Z'), schedule), 'tuesday-08:00');
});

test('the end of a slot is excluded', () => {
  assert.equal(getCheckinSlot(at('2026-11-10T09:00:00Z'), schedule), null);
  assert.equal(getCheckinSlot(at('2026-11-10T04:59:00Z'), schedule), null);
});

test('the afternoon slot and the Saturday slot have their own id', () => {
  assert.equal(getCheckinSlot(at('2026-11-10T12:00:00Z'), schedule), 'tuesday-15:00');
  assert.equal(getCheckinSlot(at('2026-11-14T07:00:00Z'), schedule), 'saturday-09:00');
});

test('a custom slot gives its own start time as the id', () => {
  const custom: CheckinSchedule = structuredClone(DEFAULT_CHECKIN_SCHEDULE);
  custom.tuesday.slots = [{ start: '08:30', end: '10:00' }];
  assert.equal(getCheckinSlot(at('2026-11-10T05:45:00Z'), custom), 'tuesday-08:30');
  assert.equal(getCheckinSlot(at('2026-11-10T05:15:00Z'), custom), null);
});

test('the day comes from the time in the zone, not from UTC', () => {
  // Monday 21:30 UTC is Tuesday 00:30 in Mahajanga.
  assert.deepEqual(getZoneDayAndTime(at('2026-11-09T21:30:00Z'), zone), {
    day: 'tuesday',
    time: '00:30',
  });
  assert.deepEqual(getZoneDayAndTime(at('2026-11-15T20:59:00Z'), zone), {
    day: 'sunday',
    time: '23:59',
  });
});

test('a closed day is refused with its name', () => {
  const custom: CheckinSchedule = structuredClone(DEFAULT_CHECKIN_SCHEDULE);
  custom.sunday = { open: false, slots: [] };
  assert.deepEqual(validateCheckinTime(at('2026-11-15T07:00:00Z'), custom), {
    allowed: false,
    reason: 'Check-in is closed on Sunday.',
  });
  assert.equal(getCheckinSlot(at('2026-11-15T07:00:00Z'), custom), null);
});

test('a time outside the slots is refused with the hours of the day', () => {
  assert.deepEqual(validateCheckinTime(at('2026-11-10T10:00:00Z'), schedule), {
    allowed: false,
    reason: 'Check-in on Tuesday is allowed 08:00–12:00, 15:00–18:00.',
  });
  assert.deepEqual(validateCheckinTime(at('2026-11-14T13:30:00Z'), schedule), {
    allowed: false,
    reason: 'Check-in on Saturday is allowed 09:00–16:00.',
  });
});

test('an allowed time carries its slot', () => {
  assert.deepEqual(validateCheckinTime(at('2026-11-09T06:00:00Z'), schedule), {
    allowed: true,
    slot: 'monday-08:00',
  });
});

test('the Mahajanga day starts at 21:00 UTC the day before', () => {
  const bounds = getZoneDayBounds(at('2026-11-10T05:00:00Z'), zone);
  assert.equal(bounds.start.toISOString(), '2026-11-09T21:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-10T20:59:59.999Z');
  // 22:00 UTC on Tuesday is already Wednesday in Mahajanga.
  const late = getZoneDayBounds(at('2026-11-10T22:00:00Z'), zone);
  assert.equal(late.start.toISOString(), '2026-11-10T21:00:00.000Z');
  assert.equal(late.end.toISOString(), '2026-11-11T20:59:59.999Z');
});

test('the same instant gives another slot in another time zone', () => {
  // Tuesday 06:00 UTC is 09:00 in Mahajanga, inside 08:00–12:00.
  assert.equal(getCheckinSlot(at('2026-11-10T06:00:00Z'), schedule), 'tuesday-08:00');
  // In UTC it is 06:00: before the first slot.
  assert.equal(getCheckinSlot(at('2026-11-10T06:00:00Z'), schedule, 'UTC'), null);
  // Tuesday 13:00 UTC is 16:00 in Mahajanga, and 13:00 (closed) in UTC.
  assert.equal(getCheckinSlot(at('2026-11-10T13:00:00Z'), schedule), 'tuesday-15:00');
  assert.deepEqual(validateCheckinTime(at('2026-11-10T13:00:00Z'), schedule, 'UTC'), {
    allowed: false,
    reason: 'Check-in on Tuesday is allowed 08:00–12:00, 15:00–18:00.',
  });
  assert.deepEqual(validateCheckinTime(at('2026-11-10T09:00:00Z'), schedule, 'UTC'), {
    allowed: true,
    slot: 'tuesday-08:00',
  });
});

test('the day of a zone west of UTC can be the day before', () => {
  // Tuesday 02:00 UTC is Monday 21:00 in New York (UTC-5 in November).
  assert.deepEqual(getZoneDayAndTime(at('2026-11-10T02:00:00Z'), 'America/New_York'), {
    day: 'monday',
    time: '21:00',
  });
  const bounds = getZoneDayBounds(at('2026-11-10T02:00:00Z'), 'America/New_York');
  assert.equal(bounds.start.toISOString(), '2026-11-09T05:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-10T04:59:59.999Z');
});

test('the UTC day is the calendar day in UTC', () => {
  const bounds = getZoneDayBounds(at('2026-11-10T23:59:59.999Z'), 'UTC');
  assert.equal(bounds.start.toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-10T23:59:59.999Z');
});

test('a day with a daylight saving time change has 23 or 25 hours', () => {
  // Paris moves from UTC+1 to UTC+2 at 01:00 UTC on Sunday 2026-03-29.
  const spring = getZoneDayBounds(at('2026-03-29T12:00:00Z'), 'Europe/Paris');
  assert.equal(spring.start.toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(spring.end.toISOString(), '2026-03-29T21:59:59.999Z');
  // Just before the change, at 00:30 in Paris: still the same day.
  const early = getZoneDayBounds(at('2026-03-28T23:30:00Z'), 'Europe/Paris');
  assert.equal(early.start.toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(early.end.toISOString(), '2026-03-29T21:59:59.999Z');
  // Paris moves back from UTC+2 to UTC+1 at 01:00 UTC on Sunday 2026-10-25.
  const autumn = getZoneDayBounds(at('2026-10-25T12:00:00Z'), 'Europe/Paris');
  assert.equal(autumn.start.toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(autumn.end.toISOString(), '2026-10-25T22:59:59.999Z');
  // The time of day follows the change: 08:00 UTC is 10:00 before, 09:00 after.
  assert.deepEqual(getZoneDayAndTime(at('2026-03-29T08:00:00Z'), 'Europe/Paris'), {
    day: 'sunday',
    time: '10:00',
  });
  assert.deepEqual(getZoneDayAndTime(at('2026-10-25T08:00:00Z'), 'Europe/Paris'), {
    day: 'sunday',
    time: '09:00',
  });
});
