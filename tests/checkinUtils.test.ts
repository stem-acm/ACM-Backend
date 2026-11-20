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

// --- Slot overview ------------------------------------------------------------------------

/** `getSlotOverview`, checked against `getCheckinSlot` for the same instant. */
function overview(date: Date, value: CheckinSchedule = schedule, timeZone = zone) {
  const result = utils.getSlotOverview(date, value, timeZone);
  assert.equal(result.slot?.id ?? null, utils.getCheckinSlot(date, value, timeZone));
  return result;
}

test('inside a slot: the slot is current and the afternoon slot is next', () => {
  assert.deepEqual(overview(at('2026-11-10T06:00:00Z')), {
    day: 'tuesday',
    time: '09:00',
    closedToday: false,
    slot: { id: 'tuesday-08:00', day: 'tuesday', start: '08:00', end: '12:00' },
    todaySlots: [
      { start: '08:00', end: '12:00', state: 'current' },
      { start: '15:00', end: '18:00', state: 'next' },
    ],
    nextSlot: { day: 'tuesday', start: '15:00', end: '18:00' },
  });
});

test('the start of a slot is included', () => {
  assert.equal(overview(at('2026-11-10T05:00:00Z')).slot?.id, 'tuesday-08:00');
});

test('exactly at the end of a slot, the slot is ended and there is no current slot', () => {
  const result = overview(at('2026-11-10T09:00:00Z')); // Tuesday 12:00
  assert.equal(result.slot, null);
  assert.equal(result.time, '12:00');
  assert.deepEqual(
    result.todaySlots.map((item) => item.state),
    ['ended', 'next']
  );
  assert.deepEqual(result.nextSlot, { day: 'tuesday', start: '15:00', end: '18:00' });
});

test('between two slots: the first is ended, the second is next', () => {
  const result = overview(at('2026-11-10T10:05:00Z')); // Tuesday 13:05
  assert.equal(result.slot, null);
  assert.equal(result.closedToday, false);
  assert.deepEqual(result.todaySlots, [
    { start: '08:00', end: '12:00', state: 'ended' },
    { start: '15:00', end: '18:00', state: 'next' },
  ]);
  assert.deepEqual(result.nextSlot, { day: 'tuesday', start: '15:00', end: '18:00' });
});

test('before the first slot: the first is next, the others later', () => {
  const result = overview(at('2026-11-10T04:00:00Z')); // Tuesday 07:00
  assert.equal(result.slot, null);
  assert.deepEqual(
    result.todaySlots.map((item) => item.state),
    ['next', 'later']
  );
  assert.deepEqual(result.nextSlot, { day: 'tuesday', start: '08:00', end: '12:00' });
});

test('after the last slot: the next slot is the first slot of the next open day', () => {
  const tuesday = overview(at('2026-11-10T15:30:00Z')); // Tuesday 18:30
  assert.deepEqual(
    tuesday.todaySlots.map((item) => item.state),
    ['ended', 'ended']
  );
  assert.deepEqual(tuesday.nextSlot, { day: 'wednesday', start: '08:00', end: '12:00' });
  // Friday 19:00: Saturday has its own hours.
  assert.deepEqual(overview(at('2026-11-13T16:00:00Z')).nextSlot, {
    day: 'saturday',
    start: '09:00',
    end: '16:00',
  });
});

test('a closed day has no slot, no today slots, and the next open day is skipped to', () => {
  const custom: CheckinSchedule = structuredClone(DEFAULT_CHECKIN_SCHEDULE);
  custom.sunday = { open: false, slots: [{ start: '08:00', end: '12:00' }] };
  const sunday = overview(at('2026-11-15T07:00:00Z'), custom); // Sunday 10:00
  assert.equal(sunday.day, 'sunday');
  assert.equal(sunday.closedToday, true);
  assert.equal(sunday.slot, null);
  assert.deepEqual(sunday.todaySlots, []);
  assert.deepEqual(sunday.nextSlot, { day: 'monday', start: '08:00', end: '12:00' });
  // Saturday after 16:00: Sunday is closed, so Monday is next.
  assert.deepEqual(overview(at('2026-11-14T14:00:00Z'), custom).nextSlot, {
    day: 'monday',
    start: '08:00',
    end: '12:00',
  });
});

test('when all days are closed, there is no next slot', () => {
  const closed = Object.fromEntries(
    Object.keys(DEFAULT_CHECKIN_SCHEDULE).map((day) => [day, { open: false, slots: [] }])
  ) as CheckinSchedule;
  const result = overview(at('2026-11-10T06:00:00Z'), closed);
  assert.equal(result.closedToday, true);
  assert.equal(result.slot, null);
  assert.deepEqual(result.todaySlots, []);
  assert.equal(result.nextSlot, null);
});

test('with one open day, after its last slot the next slot is the same day next week', () => {
  const custom = Object.fromEntries(
    Object.keys(DEFAULT_CHECKIN_SCHEDULE).map((day) => [day, { open: false, slots: [] }])
  ) as CheckinSchedule;
  custom.tuesday = { open: true, slots: [{ start: '08:00', end: '12:00' }] };
  assert.deepEqual(overview(at('2026-11-10T15:30:00Z'), custom).nextSlot, {
    day: 'tuesday',
    start: '08:00',
    end: '12:00',
  });
});

test('the slots of a day are sorted by start time', () => {
  const custom: CheckinSchedule = structuredClone(DEFAULT_CHECKIN_SCHEDULE);
  custom.tuesday.slots = [
    { start: '15:00', end: '18:00' },
    { start: '08:00', end: '12:00' },
  ];
  const result = overview(at('2026-11-10T06:00:00Z'), custom);
  assert.deepEqual(result.todaySlots, [
    { start: '08:00', end: '12:00', state: 'current' },
    { start: '15:00', end: '18:00', state: 'next' },
  ]);
});

test('the overview uses the day and time of the zone, not of UTC', () => {
  // Monday 21:30 UTC is Tuesday 00:30 in Mahajanga: before the first Tuesday slot.
  const mahajanga = overview(at('2026-11-09T21:30:00Z'));
  assert.equal(mahajanga.day, 'tuesday');
  assert.equal(mahajanga.time, '00:30');
  assert.deepEqual(
    mahajanga.todaySlots.map((item) => item.state),
    ['next', 'later']
  );
  // In UTC it is still Monday 21:30, after the last Monday slot.
  const utc = overview(at('2026-11-09T21:30:00Z'), schedule, 'UTC');
  assert.equal(utc.day, 'monday');
  assert.deepEqual(
    utc.todaySlots.map((item) => item.state),
    ['ended', 'ended']
  );
  assert.deepEqual(utc.nextSlot, { day: 'tuesday', start: '08:00', end: '12:00' });
  // Tuesday 06:00 UTC: in a slot in Mahajanga, before the first slot in UTC.
  assert.equal(overview(at('2026-11-10T06:00:00Z')).slot?.id, 'tuesday-08:00');
  assert.equal(overview(at('2026-11-10T06:00:00Z'), schedule, 'UTC').slot, null);
});
