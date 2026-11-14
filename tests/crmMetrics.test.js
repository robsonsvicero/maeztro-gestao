import test from 'node:test';
import assert from 'node:assert/strict';
import { getCrmMetrics } from '../src/modules/crm/crmMetrics.js';

test('CRM metrics count every interested person, distinct leads with completed trials, and enrollments', () => {
  const metrics = getCrmMetrics(
    [
      { id: 'lead-1', stage: 'trial' },
      { id: 'lead-2', stage: 'enrolled' },
      { id: 'lead-3', stage: 'enrolled' },
      { id: 'lead-4', stage: 'new_lead' },
    ],
    [
      { id: 'trial-1', status: 'completed' },
      { id: 'trial-2', status: 'completed' },
      { id: 'trial-3', status: 'scheduled' },
    ],
    [
      { lead_id: 'lead-1', trial_id: 'trial-1' },
      { lead_id: 'lead-1', trial_id: 'trial-2' },
      { lead_id: 'lead-3', trial_id: 'trial-3' },
    ],
  );

  assert.equal(metrics.interested, 4);
  assert.equal(metrics.completedTrials, 1);
  assert.equal(metrics.enrolled, 2);
  assert.deepEqual(metrics.byStage, {
    new_lead: 1,
    contacted: 0,
    trial: 1,
    proposal: 0,
    enrolled: 2,
    not_converted: 0,
  });
});
