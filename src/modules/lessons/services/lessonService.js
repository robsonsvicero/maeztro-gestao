import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';

export const lessonService = createSupabaseEntityService(supabase, 'lesson');
