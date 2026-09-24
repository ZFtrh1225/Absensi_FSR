import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderAt } from './schedule.js';

test('schedules both reminders in WIB regardless of UTC server time', () => {
  assert.equal(reminderAt(new Date('2026-09-24T01:00:00Z')).type, 'in');
  assert.equal(reminderAt(new Date('2026-09-24T10:01:00Z')).type, 'out');
  assert.equal(reminderAt(new Date('2026-09-24T10:00:00Z')), null);
  assert.equal(reminderAt(new Date('2026-09-24T01:01:00Z')), null);
});
