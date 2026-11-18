import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActivitySchema, updateActivitySchema } from '../src/schemas/activitySchema';

const validActivity = {
  name: 'Workshop',
  isPeriodic: true,
  dayOfWeek: 'tuesday',
  startTime: '09:00:00',
  endTime: '10:00:00',
  startDate: null,
  endDate: null,
};

for (const [operation, schema, fields] of [
  ['create', createActivitySchema, validActivity],
  ['update', updateActivitySchema, {}],
] as const) {
  test(`${operation} accepts an activity name of exactly 40 characters unchanged`, () => {
    const name = 'A'.repeat(40);
    assert.equal(schema.parse({ ...fields, name }).name, name);
  });

  test(`${operation} rejects 41 characters with a field-level validation message`, () => {
    const result = schema.safeParse({ ...fields, name: 'A'.repeat(41) });
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error.issues.map(({ path, message }) => ({ path, message })),
      [{ path: ['name'], message: 'Activity name must be 40 characters or fewer.' }]
    );
  });

  test(`${operation} still rejects an explicitly empty name`, () => {
    const result = schema.safeParse({ ...fields, name: '' });
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].message, 'Activity name is required');
  });

  test(`${operation} counts UTF-16 code units consistently with the frontend`, () => {
    const name = '😀'.repeat(20);
    assert.equal(schema.parse({ ...fields, name }).name, name);
    assert.equal(schema.safeParse({ ...fields, name: `${name}A` }).success, false);
  });
}

test('creation still requires a name', () => {
  const { name: _name, ...fields } = validActivity;
  assert.equal(createActivitySchema.safeParse(fields).success, false);
});

test('partial updates omit the name without inserting or changing it', () => {
  assert.deepEqual(updateActivitySchema.parse({ description: 'Updated description' }), {
    description: 'Updated description',
  });
  assert.deepEqual(updateActivitySchema.parse({}), {});
});
