import { supabase } from '@/lib/supabaseClient';
import { createSupabaseEntityService } from '../../shared/services/createSupabaseEntityService.js';

export const transactionService = createSupabaseEntityService(supabase, 'transaction');
export const receiptService = createSupabaseEntityService(supabase, 'receipt');
export const budgetService = createSupabaseEntityService(supabase, 'budget');
