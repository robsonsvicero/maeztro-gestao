import { supabase } from '@/lib/supabaseClient';
import { requireActiveWorkspaceId } from '@/modules/shared/services/workspaceContext.js';

const invoke = async (functionName, args = {}) => {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw error;
  return data;
};

export const workspaceService = {
  listMine: async () => {
    const data = await invoke('list_my_workspaces');
    return data ?? [];
  },

  create: async (name) => invoke('create_workspace', { workspace_name: name }),

  rename: async (workspaceId, name) => {
    const { data, error } = await supabase
      .from('workspaces')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  listMembers: async (workspaceId = requireActiveWorkspaceId()) => {
    const data = await invoke('list_workspace_members', { target_workspace_id: workspaceId });
    return data ?? [];
  },

  listInvitations: async (workspaceId = requireActiveWorkspaceId()) => {
    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('id, workspace_id, email, role_key, status, expires_at, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  createInvitation: async (workspaceId, email, roleKey) => invoke('create_workspace_invitation', {
    target_workspace_id: workspaceId,
    invite_email: email,
    invite_role_key: roleKey,
  }),

  acceptInvitation: async (token) => invoke('accept_workspace_invitation', { invite_token: token }),

  revokeInvitation: async (invitationId) => invoke('revoke_workspace_invitation', {
    invitation_id: invitationId,
  }),

  updateMemberRole: async (workspaceId, userId, roleKey) => invoke('update_workspace_member_role', {
    target_workspace_id: workspaceId,
    target_user_id: userId,
    new_role_key: roleKey,
  }),

  removeMember: async (workspaceId, userId) => invoke('remove_workspace_member', {
    target_workspace_id: workspaceId,
    target_user_id: userId,
  }),
};
