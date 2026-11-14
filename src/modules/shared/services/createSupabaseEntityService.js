import { requireActiveWorkspaceId } from './workspaceContext.js';

export const createSupabaseEntityService = (supabase, tableName) => {
  if (!supabase?.from || !tableName) {
    throw new Error('Cliente Supabase e nome da tabela são obrigatórios.');
  }

  return {
    list: async (sort = '') => {
      let query = supabase.from(tableName).select('*').eq('workspace_id', requireActiveWorkspaceId());
      if (sort) query = query.order(sort.replace(/^-/, ''), { ascending: !sort.startsWith('-') });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    get: async (id) => {
      const { data, error } = await supabase.from(tableName).select('*')
        .eq('id', id)
        .eq('workspace_id', requireActiveWorkspaceId())
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    create: async (payload) => {
      const { data, error } = await supabase.from(tableName)
        .insert({ ...payload, workspace_id: requireActiveWorkspaceId() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    update: async (id, payload) => {
      const updatePayload = { ...payload };
      delete updatePayload.workspace_id;
      const { data, error } = await supabase.from(tableName)
        .update(updatePayload)
        .eq('id', id)
        .eq('workspace_id', requireActiveWorkspaceId())
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from(tableName)
        .delete()
        .eq('id', id)
        .eq('workspace_id', requireActiveWorkspaceId());
      if (error) throw error;
    },
  };
};
