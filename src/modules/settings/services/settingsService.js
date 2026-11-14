import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';

export const appSettingsService = createSupabaseEntityService(supabase, 'app_settings');
export const companySettingsService = createSupabaseEntityService(supabase, 'company_settings');
