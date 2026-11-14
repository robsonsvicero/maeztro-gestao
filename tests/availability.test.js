import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTimeSlots,
  intersectAvailability,
  slotFitsAvailability,
  validateAvailabilityRows,
} from '../src/modules/availability/availabilityUtils.js';

test('studio and teacher windows are kept separate and intersected for scheduling', () => {
  const effective = intersectAvailability(
    [
      { weekday: 1, start_time: '08:00', end_time: '12:00' },
      { weekday: 1, start_time: '13:00', end_time: '22:00' },
    ],
    [
      { weekday: 1, start_time: '07:00', end_time: '14:00' },
      { weekday: 2, start_time: '18:00', end_time: '22:00' },
    ],
  );

  assert.deepEqual(effective, [
    { weekday: 1, start_time: '08:00', end_time: '12:00' },
    { weekday: 1, start_time: '13:00', end_time: '14:00' },
  ]);
});

test('a lesson must fit completely inside one studio or teacher interval', () => {
  const windows = [{ weekday: 1, start_time: '08:00', end_time: '14:00' }];
  assert.equal(slotFitsAvailability({
    weekday: 1,
    start_time: '13:00',
    end_time: '14:00',
  }, windows), true);
  assert.equal(slotFitsAvailability({
    weekday: 1,
    start_time: '13:30',
    end_time: '14:30',
  }, windows), false);
  assert.equal(slotFitsAvailability({
    weekday: 2,
    start_time: '09:00',
    end_time: '10:00',
  }, windows), false);
});

test('availability intervals reject invalid ranges and overlaps but allow adjacent slots', () => {
  assert.equal(validateAvailabilityRows([
    { weekday: 1, start_time: '08:00', end_time: '12:00' },
    { weekday: 1, start_time: '12:00', end_time: '14:00' },
  ]), null);
  assert.match(validateAvailabilityRows([
    { weekday: 1, start_time: '08:00', end_time: '12:00' },
    { weekday: 1, start_time: '11:00', end_time: '14:00' },
  ]), /não podem se sobrepor/);
  assert.match(validateAvailabilityRows([
    { weekday: 1, start_time: '14:00', end_time: '08:00' },
  ]), /Confira o dia/);
});

test('automatic suggestions respect teacher, studio, and booked lesson intervals', () => {
  const effective = intersectAvailability(
    [{ weekday: 1, start_time: '08:00', end_time: '12:00' }],
    [{ weekday: 1, start_time: '09:00', end_time: '12:00' }],
  );
  const slots = generateTimeSlots({
    availabilityRows: effective,
    weekday: 1,
    durationMinutes: 60,
    teacherUserId: 'teacher-a',
    accountType: 'studio',
    appointments: [
      { start_time: '09:00', end_time: '10:00', teacher_user_id: 'teacher-b', status: 'scheduled' },
      { start_time: '10:00', end_time: '11:00', teacher_user_id: 'teacher-a', status: 'scheduled' },
      { start_time: '11:00', end_time: '12:00', teacher_user_id: 'teacher-a', status: 'cancelled' },
    ],
  });

  assert.deepEqual(slots, [
    { start_time: '09:00', end_time: '10:00' },
    { start_time: '11:00', end_time: '12:00' },
  ]);
});

test('automatic suggestions block unassigned studio lessons and reject invalid durations', () => {
  const options = {
    availabilityRows: [{ weekday: 1, start_time: '08:00', end_time: '10:00' }],
    weekday: 1,
    durationMinutes: 60,
    accountType: 'studio',
    teacherUserId: 'teacher-a',
    appointments: [{ start_time: '08:30', end_time: '09:30', status: 'scheduled' }],
  };

  assert.deepEqual(generateTimeSlots(options), []);
  assert.deepEqual(generateTimeSlots({ ...options, durationMinutes: 0 }), []);
});
