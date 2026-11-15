import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrialScheduleEventsForDate } from '../src/modules/crm/trialEventUtils.js';

test('trial schedule events are normalized for the selected date without lead details', () => {
  const events = getTrialScheduleEventsForDate([
    {
      id: 'trial-1',
      date: '2026-11-15',
      start_time: '09:30:00',
      end_time: '10:15:00',
      teacher_name: 'Professora Ana',
      teacher_user_id: 'teacher-1',
      title: 'Aula experimental',
      lead_name: 'Private lead name',
    },
    {
      id: 'trial-2',
      date: '2026-11-16',
      start_time: '11:00:00',
      end_time: '12:00:00',
    },
  ], new Date(2026, 10, 15, 12));

  assert.deepEqual(events, [{
    id: 'trial-trial-1',
    date: '2026-11-15',
    start_time: '09:30',
    end_time: '10:15',
    teacher_name: 'Professora Ana',
    status: 'scheduled',
    isTrial: true,
  }]);
});
