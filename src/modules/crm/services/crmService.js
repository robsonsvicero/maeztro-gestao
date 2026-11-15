import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';
import { requireActiveWorkspaceId } from '../../shared/services/workspaceContext.js';

export const clientService = createSupabaseEntityService(supabase, 'client');
export const quoteService = createSupabaseEntityService(supabase, 'quote');
export const crmLeadService = createSupabaseEntityService(supabase, 'crm_leads');

const activeWorkspaceQuery = (tableName) => supabase
  .from(tableName)
  .select('*')
  .eq('workspace_id', requireWorkspaceId());

const requireWorkspaceId = () => requireActiveWorkspaceId();

export const crmContactService = {
  list: async (leadId) => {
    const { data, error } = await activeWorkspaceQuery('crm_contacts')
      .eq('lead_id', leadId)
      .order('contact_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  create: async (leadId, payload) => {
    const { data, error } = await supabase.from('crm_contacts')
      .insert({ ...payload, lead_id: leadId, workspace_id: requireWorkspaceId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  listLeadIdsWithContacts: async () => {
    const { data, error } = await supabase.from('crm_contacted_lead_ids')
      .select('lead_id')
      .eq('workspace_id', requireWorkspaceId());
    if (error) throw error;
    return data ?? [];
  },
};

export const crmTrialService = {
  list: async () => {
    const { data, error } = await activeWorkspaceQuery('crm_trials')
      .order('trial_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  listForLead: async (leadId) => {
    const { data, error } = await activeWorkspaceQuery('crm_lead_trials')
      .eq('lead_id', leadId);
    if (error) throw error;
    return data ?? [];
  },
  listLeadLinks: async () => {
    const { data, error } = await activeWorkspaceQuery('crm_lead_trials');
    if (error) throw error;
    return data ?? [];
  },
  listForSchedule: async () => {
    const { data, error } = await supabase.from('crm_public_trial_events')
      .select('id,workspace_id,title,date,start_time,end_time,teacher_user_id')
      .eq('workspace_id', requireWorkspaceId())
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  schedule: async ({ leadId, date, startTime, endTime, teacherUserId = null }) => {
    const { data, error } = await supabase.rpc('create_crm_trial', {
      target_workspace_id: requireWorkspaceId(),
      target_lead_id: leadId,
      target_date: date,
      target_start_time: startTime,
      target_end_time: endTime,
      target_teacher_user_id: teacherUserId,
    });
    if (error) throw error;
    return data;
  },
  update: async (trialId, payload) => {
    const { data, error } = await supabase.from('crm_trials')
      .update(payload)
      .eq('id', trialId)
      .eq('workspace_id', requireWorkspaceId())
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const convertCrmLead = async (leadId, studentId = null, createNewDespiteMatches = false) => {
  const { data, error } = await supabase.rpc('convert_crm_lead', {
    target_workspace_id: requireWorkspaceId(),
    target_lead_id: leadId,
    target_student_id: studentId,
    create_new_despite_matches: createNewDespiteMatches,
  });
  if (error) throw error;
  return data;
};
