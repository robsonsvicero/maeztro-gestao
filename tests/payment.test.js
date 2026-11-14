import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWeeklyPaymentWeeks,
  getMonthlyPaymentAmount,
  getLessonPaymentStatus,
  getNextPaymentDate,
  getPaymentStatus,
  getWeeklyPaymentAmount,
} from '../src/utils/paymentUtils.js';

const referenceDate = new Date('2026-09-14T12:00:00');

test('a future due date is pending until the current installment is confirmed', () => {
  assert.equal(getPaymentStatus('2026-09-20', [], referenceDate), 'pending');
});

test('payment history confirms the current month independently from its next due date', () => {
  assert.equal(
    getPaymentStatus('2026-10-10', [{ month: '9', year: '2026', status: 'paid' }], referenceDate),
    'paid',
  );
});

test('an unpaid past due date is overdue and a canceled current charge remains canceled', () => {
  assert.equal(getPaymentStatus('2026-09-10', [], referenceDate), 'overdue');
  assert.equal(
    getPaymentStatus('2026-09-10', [{ month: '9', year: '2026', status: 'canceled' }], referenceDate),
    'canceled',
  );
});

test('next payment date does not skip an overdue month', () => {
  assert.equal(getNextPaymentDate(10, 'pending', [], referenceDate), '2026-09-10');
  assert.equal(
    getNextPaymentDate(10, 'pending', [{ month: '9', year: '2026', status: 'paid' }], referenceDate),
    '2026-10-10',
  );
});

test('weekly payment view starts with the current week for existing students', () => {
  const weeks = buildWeeklyPaymentWeeks('2020-01-03', referenceDate, 2);

  assert.deepEqual(weeks.map((week) => week.weekStart), ['2026-09-14', '2026-09-21']);
});

test('weekly lesson payment status distinguishes paid and overdue weeks', () => {
  const student = {
    payment_type: 'weekly',
    payment_history: [{ period: 'week', week_start: '2026-09-14', status: 'paid' }],
  };

  assert.equal(getLessonPaymentStatus(student, { date: '2026-09-14' }, referenceDate), 'paid');
  assert.equal(getLessonPaymentStatus(student, { date: '2026-09-07' }, referenceDate), 'overdue');
});

test('monthly receipt amount comes from the paid history, not the current monthly fee', () => {
  const student = {
    monthly_payment: 300,
    payment_history: [
      { month: '9', year: '2026', status: 'paid', amount: 220 },
    ],
  };

  assert.equal(getMonthlyPaymentAmount(student, 9, 2026), 220);
});

test('weekly receipt amount comes from the paid history, not the current per-lesson fee', () => {
  const student = {
    weekly_payment: 110,
    payment_history: [
      { period: 'week', week_start: '2026-09-14', status: 'paid', amount: 85 },
    ],
  };

  assert.equal(getWeeklyPaymentAmount(student, '2026-09-14'), 85);
});
