import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CheckinSchedule,
  DEFAULT_CHECKIN_SCHEDULE,
} from '../src/schemas/checkinScheduleSchema';
import {
  getCheckinSlot,
  getEatDayAndTime,
  getEatDayBounds,
  validateCheckinTime,
} from '../src/utils/checkinUtils';

const schedule = DEFAULT_CHECKIN_SCHEDULE;

// 2026-11-10 is a Tuesday. Mahajanga (Africa/Nairobi, EAT) is UTC+3.
const at = (iso: string) => new Date(iso);

test('a Tuesday at 08:00 EAT is in the slot tuesday-08:00', () => {
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

test('the day comes from the EAT time, not from UTC', () => {
  // Monday 21:30 UTC is Tuesday 00:30 in Mahajanga.
  assert.deepEqual(getEatDayAndTime(at('2026-11-09T21:30:00Z')), {
    day: 'tuesday',
    time: '00:30',
  });
  assert.deepEqual(getEatDayAndTime(at('2026-11-15T20:59:00Z')), {
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

test('the EAT day starts at 21:00 UTC the day before', () => {
  const bounds = getEatDayBounds(at('2026-11-10T05:00:00Z'));
  assert.equal(bounds.start.toISOString(), '2026-11-09T21:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-10T20:59:59.999Z');
  // 22:00 UTC on Tuesday is already Wednesday in Mahajanga.
  const late = getEatDayBounds(at('2026-11-10T22:00:00Z'));
  assert.equal(late.start.toISOString(), '2026-11-10T21:00:00.000Z');
  assert.equal(late.end.toISOString(), '2026-11-11T20:59:59.999Z');
});
