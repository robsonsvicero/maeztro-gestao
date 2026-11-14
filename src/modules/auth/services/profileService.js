import { supabase } from '@/lib/supabaseClient';

export const profileService = {
  list: async () => {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) throw error;
    return data ?? [];
  },
  getById: async (id) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  getLegalConsent: async (id) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('legal_documents_version, legal_documents_accepted_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
};
