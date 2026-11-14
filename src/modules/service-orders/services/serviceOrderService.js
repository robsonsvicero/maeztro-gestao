import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';

export const serviceOrderService = createSupabaseEntityService(supabase, 'service_order');
