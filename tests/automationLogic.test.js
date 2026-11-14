import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAutomationRule, getDayDifference, getLocalDateParts, getWeekKey } from '../supabase/functions/_shared/automationLogic.js';

const now = new Date('2026-04-06T11:00:00.000Z');

test('São Paulo local date and weekly automation window use the workspace timezone', () => {
  assert.deepEqual(getLocalDateParts(now), {
    date: '2026-04-06',
    hour: 8,
    minute: 0,
    weekday: 1,
  });
  assert.equal(getDayDifference('2026-04-06', '2026-04-09'), 3);
  assert.equal(getWeekKey('2026-04-06'), '2026-04-06');
  assert.equal(getWeekKey('2026-04-05'), '2026-03-30');
});

test('payment due alerts respect the configured window and ignore inactive or paid students', () => {
  const result = evaluateAutomationRule({
    rule_key: 'finance.payment_due_soon',
    config: { days_before: 3 },
  }, {
    students: [
      { id: 'due', full_name: 'Aluno A', student_status: 'active', payment_status: 'pending', next_payment_date: '2026-04-09' },
      { id: 'inactive', student_status: 'inactive', payment_status: 'pending', next_payment_date: '2026-04-07' },
      { id: 'paid', student_status: 'active', payment_status: 'paid', next_payment_date: '2026-04-07' },
      { id: 'far', student_status: 'active', payment_status: 'pending', next_payment_date: '2026-04-10' },
    ],
  }, now);

  assert.equal(result.candidates.length, 1);
  assert.match(result.candidates[0].body, /vence em 3 dia/);
});

test('lesson reminder and attendance confirmation are generated only within their time windows', () => {
  const reminder = evaluateAutomationRule({
    rule_key: 'agenda.lesson_reminder',
    config: { hours_before: 24 },
  }, {
    lessons: [
      { id: 'soon', student_name: 'Aluno A', date: '2026-04-07', start_time: '07:30', status: 'scheduled' },
      { id: 'late', date: '2026-04-08', start_time: '09:00', status: 'scheduled' },
      { id: 'cancelled', date: '2026-04-06', start_time: '09:00', status: 'cancelled' },
    ],
  }, now);
  assert.deepEqual(reminder.candidates.map((candidate) => candidate.entity_id), ['soon']);

  const attendance = evaluateAutomationRule({
    rule_key: 'agenda.attendance_confirmation',
    config: { minutes_after: 30 },
  }, {
    lessons: [
      { id: 'finished', student_name: 'Aluno A', date: '2026-04-06', start_time: '10:00', end_time: '11:00', status: 'scheduled', attendance_status: 'pending' },
      { id: 'not-finished', date: '2026-04-06', start_time: '12:30', end_time: '13:30', status: 'scheduled', attendance_status: 'pending' },
      { id: 'confirmed', date: '2026-04-06', start_time: '10:00', end_time: '11:00', status: 'scheduled', attendance_status: 'present' },
    ],
  }, new Date('2026-04-06T15:00:00.000Z'));

  assert.deepEqual(attendance.candidates.map((candidate) => candidate.entity_id), ['finished']);
});

test('recurring absence alerts require the configured threshold within the lookback window', () => {
  const result = evaluateAutomationRule({
    rule_key: 'students.recurring_absence',
    config: { absence_threshold: 3, window_days: 30 },
  }, {
    students: [{ id: 'student-1', full_name: 'Aluno A', student_status: 'active' }],
    lessons: [
      { student_id: 'student-1', date: '2026-03-10', attendance_status: 'absent' },
      { student_id: 'student-1', date: '2026-03-20', attendance_status: 'absent' },
      { student_id: 'student-1', date: '2026-04-01', attendance_status: 'absent' },
      { student_id: 'student-1', date: '2026-04-02', attendance_status: 'cancelled' },
      { student_id: 'student-1', date: '2026-02-01', attendance_status: 'absent' },
    ],
  }, now);

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].details.absence_count, 3);
});

test('schedule occupancy unions overlapping lessons and blocks when hours are not configured', () => {
  const rule = {
    rule_key: 'studio.schedule_occupancy',
    config: { weekday: 1, hour: 8, threshold_percent: 80 },
  };
  const lessons = [
    { id: 'one', date: '2026-04-06', start_time: '08:00', end_time: '09:00', status: 'scheduled' },
    { id: 'two', date: '2026-04-06', start_time: '08:30', end_time: '09:30', status: 'scheduled' },
    { id: 'three', date: '2026-04-06', start_time: '09:00', end_time: '10:00', status: 'completed' },
  ];
  const configured = evaluateAutomationRule(rule, {
    lessons,
    availability: [
      { weekday: 1, start_time: '08:00', end_time: '09:00' },
      { weekday: 1, start_time: '09:00', end_time: '10:00' },
    ],
  }, now);
  assert.equal(configured.candidates[0].details.percentage, 100);

  const missingHours = evaluateAutomationRule(rule, { lessons, availability: [] }, now);
  assert.match(missingHours.skippedReason, /Configure os horários/);
});

test('weekly finance and teacher summaries cover the previous São Paulo calendar week', () => {
  const finance = evaluateAutomationRule({
    rule_key: 'studio.weekly_finance_summary',
    config: { weekday: 1, hour: 8 },
  }, {
    transactions: [
      { type: 'income', amount: 100, date: '2026-03-31' },
      { type: 'expense', amount: 20, date: '2026-04-05' },
      { type: 'income', amount: 50, date: '2026-04-06' },
    ],
  }, now);
  assert.deepEqual(finance.candidates[0].details, { income: 100, expenses: 20, balance: 80 });

  const teacher = evaluateAutomationRule({
    rule_key: 'studio.teacher_activity_summary',
    config: { weekday: 1, hour: 8 },
  }, {
    lessons: [
      { id: 'previous-week', teacher_user_id: 'teacher-1', date: '2026-04-01', status: 'completed' },
      { id: 'current-week', teacher_user_id: 'teacher-1', date: '2026-04-06', status: 'scheduled' },
    ],
    members: [{ user_id: 'teacher-1', full_name: 'Professora Ana' }],
  }, now);
  assert.equal(teacher.candidates.length, 1);
  assert.match(teacher.candidates[0].body, /1 aula\(s\), 1 concluída\(s\)/);
});

test('CRM follow-up reminders fire once due and remain available for non-converted leads', () => {
  const result = evaluateAutomationRule({
    rule_key: 'crm.follow_up_due',
    config: {},
  }, {
    crmLeads: [
      { id: 'due', full_name: 'Pessoa A', stage: 'not_converted', next_follow_up_at: '2026-04-06T10:00:00.000Z' },
      { id: 'future', full_name: 'Pessoa B', stage: 'contacted', next_follow_up_at: '2026-04-06T12:00:00.000Z' },
      { id: 'enrolled', full_name: 'Pessoa C', stage: 'enrolled', next_follow_up_at: '2026-04-06T09:00:00.000Z' },
    ],
  }, now);

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].entity_id, 'due');
  assert.match(result.candidates[0].dedupe_key, /2026-04-06T10:00:00\.000Z/);
});
