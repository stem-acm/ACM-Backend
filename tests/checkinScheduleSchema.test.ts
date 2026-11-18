import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECKIN_SCHEDULE_MESSAGES,
  type CheckinSchedule,
  checkinScheduleSchema,
  DEFAULT_CHECKIN_SCHEDULE,
} from '../src/schemas/checkinScheduleSchema';

function copy(): CheckinSchedule {
  return structuredClone(DEFAULT_CHECKIN_SCHEDULE);
}

/** The `field: message` of each issue of a refused schedule. */
function issues(value: unknown): string[] {
  const parsed = checkinScheduleSchema.safeParse(value);
  assert.equal(parsed.success, false, `expected ${JSON.stringify(value)} to be refused`);
  return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

test('the default schedule is valid and opens every day', () => {
  const parsed = checkinScheduleSchema.parse(DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(parsed, DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(DEFAULT_CHECKIN_SCHEDULE.saturday, {
    open: true,
    slots: [{ start: '09:00', end: '16:00' }],
  });
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'sunday'] as const) {
    assert.deepEqual(DEFAULT_CHECKIN_SCHEDULE[day], {
      open: true,
      slots: [
        { start: '08:00', end: '12:00' },
        { start: '15:00', end: '18:00' },
      ],
    });
  }
});

test('a schedule without a day or with an extra day is refused', () => {
  const { sunday: _sunday, ...withoutSunday } = copy();
  assert.deepEqual(issues(withoutSunday), ['sunday: Required']);
  const extra = issues({ ...copy(), holiday: { open: false, slots: [] } });
  assert.equal(extra.length, 1);
  assert.match(extra[0], /holiday/);
});

test('a time that is not HH:mm is refused with the "empty" message', () => {
  for (const time of ['8:00', '24:00', '08:60', '', '08:00:00', 'noon']) {
    const schedule = copy();
    schedule.tuesday.slots[0].start = time;
    assert.deepEqual(issues(schedule), [
      `tuesday.slots.0.start: ${CHECKIN_SCHEDULE_MESSAGES.empty}`,
    ]);
  }
});

test('a slot with an unknown field is refused', () => {
  const schedule = copy() as unknown as Record<string, { open: boolean; slots: object[] }>;
  schedule.monday.slots[0] = { start: '08:00', end: '12:00', label: 'morning' };
  assert.equal(issues(schedule).length, 1);
});

test('an end equal to or before the start is refused on the end field', () => {
  const equal = copy();
  equal.tuesday.slots[1] = { start: '15:00', end: '15:00' };
  assert.deepEqual(issues(equal), [`tuesday.slots.1.end: ${CHECKIN_SCHEDULE_MESSAGES.order}`]);

  const before = copy();
  before.friday.slots[0] = { start: '12:00', end: '08:00' };
  assert.deepEqual(issues(before), [`friday.slots.0.end: ${CHECKIN_SCHEDULE_MESSAGES.order}`]);
});

test('overlapping slots are refused, touching slots are accepted', () => {
  const overlap = copy();
  overlap.wednesday.slots = [
    { start: '08:00', end: '12:00' },
    { start: '11:00', end: '13:00' },
  ];
  assert.deepEqual(issues(overlap), [`wednesday.slots: ${CHECKIN_SCHEDULE_MESSAGES.overlap}`]);

  const touching = copy();
  touching.wednesday.slots = [
    { start: '12:00', end: '15:00' },
    { start: '08:00', end: '12:00' },
  ];
  assert.equal(checkinScheduleSchema.safeParse(touching).success, true);
});

test('an open day without a slot is refused', () => {
  const schedule = copy();
  schedule.thursday = { open: true, slots: [] };
  assert.deepEqual(issues(schedule), [`thursday.slots: ${CHECKIN_SCHEDULE_MESSAGES.noSlot}`]);
});

test('a day has at most 12 slots', () => {
  const slots = (count: number) =>
    Array.from({ length: count }, (_, hour) => ({
      start: `${String(hour).padStart(2, '0')}:00`,
      end: `${String(hour).padStart(2, '0')}:30`,
    }));
  const twelve = copy();
  twelve.monday.slots = slots(12);
  assert.equal(checkinScheduleSchema.safeParse(twelve).success, true);
  const thirteen = copy();
  thirteen.monday.slots = slots(13);
  assert.equal(issues(thirteen).length, 1);
});

test('a closed day is stored without its slots', () => {
  const schedule = copy();
  schedule.sunday = { open: false, slots: [{ start: '08:00', end: '12:00' }] };
  assert.deepEqual(checkinScheduleSchema.parse(schedule).sunday, { open: false, slots: [] });
});

test('the slots of an open day are sorted by start time', () => {
  const schedule = copy();
  schedule.monday.slots = [
    { start: '15:00', end: '18:00' },
    { start: '08:00', end: '12:00' },
  ];
  assert.deepEqual(checkinScheduleSchema.parse(schedule).monday.slots, [
    { start: '08:00', end: '12:00' },
    { start: '15:00', end: '18:00' },
  ]);
});
