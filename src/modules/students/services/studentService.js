import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';
import { requireActiveWorkspaceId } from '@/modules/shared/services/workspaceContext.js';

const entityService = createSupabaseEntityService(supabase, 'student');

export const studentService = {
  ...entityService,
  listForIntelligence: async () => {
    const { data, error } = await supabase.from('student')
      .select('id,full_name,student_status,student_state,payment_type,monthly_payment,weekly_payment,next_payment_date,payment_history,expected_end_date')
      .eq('workspace_id', requireActiveWorkspaceId());
    if (error) throw error;
    return data ?? [];
  },
};
