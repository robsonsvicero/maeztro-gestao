import { CRM_STAGES } from './crmCatalog.js';

export const getCrmMetrics = (leads = [], trials = [], leadTrials = []) => {
  const stageCounts = Object.fromEntries(
    CRM_STAGES.map(({ key }) => [key, 0]),
  );
  const leadIdsWithCompletedTrial = new Set();
  const trialStatusById = new Map(trials.map(({ id, status }) => [id, status]));

  for (const lead of leads) {
    if (Object.hasOwn(stageCounts, lead.stage)) stageCounts[lead.stage] += 1;
  }

  for (const link of leadTrials) {
    if (trialStatusById.get(link.trial_id) === 'completed') {
      leadIdsWithCompletedTrial.add(link.lead_id);
    }
  }

  return {
    interested: leads.length,
    completedTrials: leadIdsWithCompletedTrial.size,
    enrolled: stageCounts.enrolled,
    byStage: stageCounts,
  };
};
