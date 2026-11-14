import { supabase } from '@/lib/supabaseClient';
import { requireActiveWorkspaceId } from '@/modules/shared/services/workspaceContext.js';

const throwIfError = (error) => {
  if (error) throw error;
};

export const automationService = {
  listRules: async () => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.from('automation_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('category')
      .order('rule_key');
    throwIfError(error);
    return data ?? [];
  },

  updateRule: async (ruleId, changes) => {
    const workspaceId = requireActiveWorkspaceId();
    const payload = {};
    if (typeof changes.enabled === 'boolean') payload.enabled = changes.enabled;
    if (changes.config && typeof changes.config === 'object') payload.config = changes.config;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('automation_rules')
      .update(payload)
      .eq('id', ruleId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    throwIfError(error);
    return data;
  },

  listEvents: async (limit = 100) => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.from('automation_events')
      .select('id,rule_key,title,body,severity,entity_type,entity_id,details,created_at,read_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return data ?? [];
  },

  markEventRead: async (eventId) => {
    const workspaceId = requireActiveWorkspaceId();
    const { error } = await supabase.from('automation_events')
      .update({ read_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);
    throwIfError(error);
  },

  markAllEventsRead: async () => {
    const workspaceId = requireActiveWorkspaceId();
    const { error } = await supabase.from('automation_events')
      .update({ read_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .is('read_at', null);
    throwIfError(error);
  },

  listLogs: async (limit = 100) => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.from('automation_logs')
      .select('id,rule_key,result,message,details,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return data ?? [];
  },

  listJobs: async (limit = 100) => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.from('automation_jobs')
      .select('id,rule_key,status,attempts,last_error,scheduled_for,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return data ?? [];
  },

  listPreferences: async (userId) => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.from('notification_preferences')
      .select('rule_key,enabled')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);
    throwIfError(error);
    return data ?? [];
  },

  setPreference: async (userId, ruleKey, enabled) => {
    const workspaceId = requireActiveWorkspaceId();
    const { error } = await supabase.from('notification_preferences').upsert({
      workspace_id: workspaceId,
      user_id: userId,
      rule_key: ruleKey,
      enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id,rule_key' });
    throwIfError(error);
  },

  listAssignableMembers: async () => {
    const workspaceId = requireActiveWorkspaceId();
    const { data, error } = await supabase.rpc('list_workspace_teachers', {
      target_workspace_id: workspaceId,
    });
    throwIfError(error);
    return data ?? [];
  },
};
