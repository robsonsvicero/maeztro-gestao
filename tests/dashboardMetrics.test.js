import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardIntelligence,
  normalizePersonalAvailability,
} from '../src/modules/intelligence/dashboardMetrics.js';

const now = new Date(2026, 10, 13, 12, 0);

test('management metrics forecast one weekly charge per scheduled week and monthly dues in the selected horizon', () => {
  const metrics = getDashboardIntelligence({
    now,
    horizonDays: 15,
    students: [
      {
        id: 'monthly',
        full_name: 'Mensal',
        payment_type: 'monthly',
        monthly_payment: 450,
        next_payment_date: '2026-11-15',
        payment_history: [],
      },
      {
        id: 'weekly',
        full_name: 'Semanal',
        payment_type: 'weekly',
        weekly_payment: 80,
        payment_history: [],
      },
      {
        id: 'archived',
        student_status: 'inactive',
        payment_type: 'monthly',
        monthly_payment: 300,
        next_payment_date: '2026-11-15',
      },
      {
        id: 'without-due-date',
        full_name: 'Sem vencimento',
        payment_type: 'monthly',
        monthly_payment: 250,
      },
      {
        id: 'already-paid',
        full_name: 'Pago',
        payment_type: 'monthly',
        monthly_payment: 600,
        next_payment_date: '2026-11-15',
        payment_history: [
          { month: '11', year: '2026', status: 'pending', amount: 600 },
          { month: '11', year: '2026', status: 'paid', amount: 600 },
        ],
      },
    ],
    lessons: [
      { id: 'w1', student_id: 'weekly', date: '2026-11-16', start_time: '10:00', end_time: '11:00', status: 'scheduled' },
      { id: 'w2', student_id: 'weekly', date: '2026-11-18', start_time: '10:00', end_time: '11:00', status: 'scheduled' },
    ],
  });

  assert.equal(metrics.forecastAmount, 530);
  assert.equal(metrics.forecastCharges.length, 2);
  assert.equal(metrics.pendingChargeCount, 2);
});

test('management metrics identify students ending soon and open leads without a contact', () => {
  const metrics = getDashboardIntelligence({
    now,
    horizonDays: 15,
    students: [
      { id: 'ending', full_name: 'Encerrando', expected_end_date: '2026-11-20' },
      { id: 'later', full_name: 'Depois', expected_end_date: '2026-12-01' },
      { id: 'archived', student_state: 'archived', expected_end_date: '2026-11-18' },
    ],
    leads: [
      { id: 'new', full_name: 'Sem contato', stage: 'new_lead' },
      { id: 'followup', full_name: 'Retorno', stage: 'contacted', next_follow_up_at: '2026-11-13T10:00:00' },
      { id: 'closed', full_name: 'Encerrado', stage: 'not_converted' },
    ],
    contactLeadIds: [{ lead_id: 'followup' }],
  });

  assert.deepEqual(metrics.endingStudents.map(({ id }) => id), ['ending']);
  assert.deepEqual(metrics.leadsWithoutContact.map(({ id }) => id), ['new']);
  assert.deepEqual(metrics.followUpsDue.map(({ id }) => id), ['followup']);
});

test('management metrics subtract overlapping assigned appointments from estimated teacher availability', () => {
  const metrics = getDashboardIntelligence({
    now: new Date(2026, 10, 16, 8, 0),
    horizonDays: 1,
    availability: [{ weekday: 1, start_time: '08:00', end_time: '14:00' }],
    teacherSchedules: [{
      teacher_user_id: 'teacher-1',
      weekday: 1,
      start_time: '09:00',
      end_time: '12:00',
    }],
    teachers: [{ user_id: 'teacher-1', full_name: 'Professora' }],
    lessons: [
      { id: 'lesson-1', teacher_user_id: 'teacher-1', date: '2026-11-16', start_time: '09:30', end_time: '10:30', status: 'scheduled' },
      { id: 'lesson-2', teacher_user_id: 'teacher-1', date: '2026-11-16', start_time: '10:00', end_time: '11:00', status: 'scheduled' },
    ],
    trials: [
      { id: 'trial-1', teacher_user_id: 'teacher-1', trial_date: '2026-11-16', start_time: '11:00', end_time: '11:30', status: 'scheduled' },
      { id: 'trial-canceled', teacher_user_id: 'teacher-1', trial_date: '2026-11-16', start_time: '11:30', end_time: '12:00', status: 'canceled' },
    ],
  });

  assert.equal(metrics.occupiedHours, 2.5);
  assert.equal(metrics.teacherAvailability.availableTeachers[0].availableHours, 1);
  assert.deepEqual(metrics.teacherAvailability.availableTeachers[0].nextSlot, {
    date: '2026-11-16',
    startTime: '09:00',
    endTime: '09:30',
  });
});

test('studio availability estimates intersect the studio hours with each teacher schedule', () => {
  const metrics = getDashboardIntelligence({
    now: new Date(2026, 10, 16, 8, 0),
    horizonDays: 1,
    availability: [{ weekday: 1, start_time: '08:00', end_time: '22:00' }],
    teacherSchedules: [
      { teacher_user_id: 'teacher-a', weekday: 1, start_time: '08:00', end_time: '14:00' },
      { teacher_user_id: 'teacher-b', weekday: 1, start_time: '15:00', end_time: '17:00' },
    ],
    teachers: [
      { user_id: 'teacher-a', full_name: 'Professora A' },
      { user_id: 'teacher-b', full_name: 'Professor B' },
    ],
  });

  assert.equal(metrics.teacherAvailability.configured, true);
  assert.deepEqual(
    metrics.teacherAvailability.availableTeachers.map(({ userId, availableHours }) => [userId, availableHours]),
    [['teacher-a', 6], ['teacher-b', 2]],
  );
});

test('individual availability uses the teacher schedule, its multiple daily slots, and unassigned appointments', () => {
  const availability = normalizePersonalAvailability({
    monday: [
      { start: '09:00', end: '10:00' },
      { start: '11:00', end: '12:00' },
    ],
  });
  const metrics = getDashboardIntelligence({
    now: new Date(2026, 10, 16, 8, 0),
    horizonDays: 1,
    accountType: 'individual',
    availability,
    teachers: [{ user_id: 'teacher-1', full_name: 'Professor' }],
    lessons: [
      { id: 'lesson-1', date: '2026-11-16', start_time: '09:30', end_time: '10:00', status: 'scheduled' },
    ],
    trials: [
      { id: 'trial-1', trial_date: '2026-11-16', start_time: '11:15', end_time: '11:30', status: 'scheduled' },
    ],
  });

  assert.equal(metrics.teacherAvailability.configured, true);
  assert.equal(metrics.teacherAvailability.availableTeachers[0].availableHours, 1.3);
  assert.deepEqual(metrics.teacherAvailability.availableTeachers[0].nextSlot, {
    date: '2026-11-16',
    startTime: '09:00',
    endTime: '09:30',
  });
});
