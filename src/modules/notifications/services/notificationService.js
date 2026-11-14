import { supabase } from '@/lib/supabaseClient';

export const notificationService = {
  sendEmail: async (payload) => {
    const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
    if (error) throw error;
    return data;
  },
};
