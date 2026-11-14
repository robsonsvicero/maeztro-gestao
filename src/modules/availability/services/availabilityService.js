import { supabase } from '@/lib/supabaseClient';

const throwIfError = (error) => {
  if (error) throw error;
};

const normalizeRows = (rows) => rows.map(({ weekday, start_time, end_time }) => ({
  weekday: Number(weekday),
  start_time: start_time.slice(0, 5),
  end_time: end_time.slice(0, 5),
}));

export const availabilityService = {
  listStudio: async (workspaceId) => {
    const { data, error } = await supabase.from('studio_availability_windows')
      .select('weekday,start_time,end_time')
      .eq('workspace_id', workspaceId)
      .order('weekday')
      .order('start_time');
    throwIfError(error);
    return data ?? [];
  },

  saveStudio: async (workspaceId, rows) => {
    const { error } = await supabase.rpc('replace_studio_availability', {
      target_workspace_id: workspaceId,
      availability_rows: normalizeRows(rows),
    });
    throwIfError(error);
  },

  listTeachers: async (workspaceId, teacherUserId = null) => {
    let query = supabase.from('studio_teacher_availability')
      .select('teacher_user_id,weekday,start_time,end_time')
      .eq('workspace_id', workspaceId)
      .order('teacher_user_id')
      .order('weekday')
      .order('start_time');
    if (teacherUserId) query = query.eq('teacher_user_id', teacherUserId);
    const { data, error } = await query;
    throwIfError(error);
    return data ?? [];
  },

  saveTeacher: async (workspaceId, teacherUserId, rows) => {
    const { error } = await supabase.rpc('replace_teacher_availability', {
      target_workspace_id: workspaceId,
      target_teacher_user_id: teacherUserId,
      availability_rows: normalizeRows(rows),
    });
    throwIfError(error);
  },
};
