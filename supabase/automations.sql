-- Automation engine. Run after workspaces.sql.
begin;

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regclass('public.workspace_members') is null
    or to_regclass('public.workspace_roles') is null
    or to_regclass('public.lesson') is null
    or to_regclass('public.student') is null then
    raise exception 'Execute workspaces.sql e confirme as tabelas public.student e public.lesson antes de automations.sql.';
  end if;
end;
$$;

update public.workspace_roles
set permissions = permissions || '{"automations.read": true, "automations.manage": true}'::jsonb
where role_key in ('owner', 'teacher');

alter table public.lesson
  add column if not exists teacher_user_id uuid references auth.users(id) on delete set null,
  add column if not exists attendance_status text not null default 'pending'
    check (attendance_status in ('pending', 'present', 'absent'));
alter table public.student
  add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;

update public.lesson
set attendance_status = 'present'
where status = 'completed' and attendance_status = 'pending';

create index if not exists lesson_workspace_teacher_date_idx
  on public.lesson (workspace_id, teacher_user_id, date);
create index if not exists lesson_workspace_attendance_date_idx
  on public.lesson (workspace_id, attendance_status, date);
create index if not exists student_workspace_teacher_idx
  on public.student (workspace_id, teacher_user_id);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_key text not null,
  category text not null check (category in ('finance', 'agenda', 'students', 'studio')),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_evaluated_at timestamptz,
  last_result text check (last_result in ('queued', 'skipped', 'failed', 'blocked')),
  last_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, rule_key)
);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (workspace_id, user_id, dedupe_key)
);

create index if not exists automation_events_inbox_idx
  on public.automation_events (workspace_id, user_id, read_at, created_at desc);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null,
  dedupe_key text not null,
  scheduled_for timestamptz not null default now(),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, dedupe_key)
);

create index if not exists automation_jobs_queue_idx
  on public.automation_jobs (status, scheduled_for, created_at);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_key text not null,
  dedupe_key text not null,
  result text not null check (result in ('queued', 'delivered', 'skipped', 'failed', 'blocked')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create index if not exists automation_logs_history_idx
  on public.automation_logs (workspace_id, created_at desc);

create table if not exists public.notification_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, rule_key)
);

create table if not exists public.workspace_availability (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_available boolean not null default false,
  start_time time,
  end_time time,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, weekday),
  check (
    (is_available and start_time is not null and end_time is not null and start_time < end_time)
    or (not is_available and start_time is null and end_time is null)
  )
);

alter table public.automation_rules enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_logs enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.workspace_availability enable row level security;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules
for select to authenticated
using (
  public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
);

drop policy if exists automation_rules_insert on public.automation_rules;
create policy automation_rules_insert on public.automation_rules
for insert to authenticated
with check (
  public.workspace_has_permission(workspace_id, 'automations.manage')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.write')
  )
);

drop policy if exists automation_rules_update on public.automation_rules;
create policy automation_rules_update on public.automation_rules
for update to authenticated
using (
  public.workspace_has_permission(workspace_id, 'automations.manage')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.write')
  )
)
with check (
  public.workspace_has_permission(workspace_id, 'automations.manage')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.write')
  )
);

drop policy if exists automation_rules_delete on public.automation_rules;
create policy automation_rules_delete on public.automation_rules
for delete to authenticated
using (
  public.workspace_has_permission(workspace_id, 'automations.manage')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.write')
  )
);

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events
for select to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
);

drop policy if exists automation_events_update on public.automation_events;
create policy automation_events_update on public.automation_events
for update to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
)
with check (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
);

drop policy if exists automation_jobs_select on public.automation_jobs;
create policy automation_jobs_select on public.automation_jobs
for select to authenticated
using (
  user_id = auth.uid()
  and
  public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
);

drop policy if exists automation_logs_select on public.automation_logs;
create policy automation_logs_select on public.automation_logs
for select to authenticated
using (
  public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
);

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
for select to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
);

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
);

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
for update to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
)
with check (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
);

drop policy if exists notification_preferences_delete on public.notification_preferences;
create policy notification_preferences_delete on public.notification_preferences
for delete to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
);

drop policy if exists workspace_availability_select on public.workspace_availability;
create policy workspace_availability_select on public.workspace_availability
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'automations.read'));

drop policy if exists workspace_availability_insert on public.workspace_availability;
create policy workspace_availability_insert on public.workspace_availability
for insert to authenticated
with check (public.workspace_has_permission(workspace_id, 'automations.manage'));

drop policy if exists workspace_availability_update on public.workspace_availability;
create policy workspace_availability_update on public.workspace_availability
for update to authenticated
using (public.workspace_has_permission(workspace_id, 'automations.manage'))
with check (public.workspace_has_permission(workspace_id, 'automations.manage'));

drop policy if exists workspace_availability_delete on public.workspace_availability;
create policy workspace_availability_delete on public.workspace_availability
for delete to authenticated
using (public.workspace_has_permission(workspace_id, 'automations.manage'));

revoke all on public.automation_rules from anon, authenticated;
grant select, update (enabled, config, updated_at) on public.automation_rules to authenticated;
grant select, update (read_at) on public.automation_events to authenticated;
grant select on public.automation_jobs, public.automation_logs to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.workspace_availability to authenticated;
grant all on public.automation_rules, public.automation_events, public.automation_jobs,
  public.automation_logs, public.notification_preferences, public.workspace_availability
  to service_role;

create or replace function public.seed_workspace_automation_rules(target_workspace_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  insert into public.automation_rules (workspace_id, rule_key, category, enabled, config)
  values
    (target_workspace_id, 'finance.payment_due_soon', 'finance', true, '{"days_before": 3}'::jsonb),
    (target_workspace_id, 'finance.payment_overdue', 'finance', true, '{}'::jsonb),
    (target_workspace_id, 'finance.payment_received', 'finance', true, '{}'::jsonb),
    (target_workspace_id, 'finance.weekly_pending_summary', 'finance', true, '{"weekday": 1, "hour": 8}'::jsonb),
    (target_workspace_id, 'agenda.lesson_reminder', 'agenda', true, '{"hours_before": 24}'::jsonb),
    (target_workspace_id, 'agenda.attendance_confirmation', 'agenda', true, '{"minutes_after": 30}'::jsonb),
    (target_workspace_id, 'agenda.cancellation_alert', 'agenda', true, '{}'::jsonb),
    (target_workspace_id, 'agenda.reschedule_suggestion', 'agenda', true, '{}'::jsonb),
    (target_workspace_id, 'students.no_upcoming_lesson', 'students', true, '{"days_without_future": 7}'::jsonb),
    (target_workspace_id, 'students.incomplete_enrollment', 'students', true,
      '{"required_fields": ["phone", "instrument", "lesson_day", "lesson_time"]}'::jsonb),
    (target_workspace_id, 'students.recurring_absence', 'students', true,
      '{"absence_threshold": 3, "window_days": 30}'::jsonb),
    (target_workspace_id, 'students.churn_risk', 'students', true, '{"days_without_completed_lesson": 30}'::jsonb),
    (target_workspace_id, 'studio.teacher_activity_summary', 'studio', true, '{"weekday": 1, "hour": 8}'),
    (target_workspace_id, 'studio.schedule_occupancy', 'studio', true, '{"threshold_percent": 80}'),
    (target_workspace_id, 'studio.admin_pending', 'studio', true, '{"weekday": 1, "hour": 8}'),
    (target_workspace_id, 'studio.weekly_finance_summary', 'studio', true, '{"weekday": 1, "hour": 8}')
  on conflict (workspace_id, rule_key) do nothing;
$$;

revoke all on function public.seed_workspace_automation_rules(uuid) from public, anon, authenticated;

create or replace function public.seed_new_workspace_automation_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  perform public.seed_workspace_automation_rules(new.id);
  return new;
end;
$$;

drop trigger if exists seed_new_workspace_automation_rules on public.workspaces;
create trigger seed_new_workspace_automation_rules
after insert on public.workspaces
for each row execute function public.seed_new_workspace_automation_rules();

revoke all on function public.seed_new_workspace_automation_rules() from public, anon, authenticated;

select public.seed_workspace_automation_rules(workspace.id)
from public.workspaces workspace;

create or replace function public.list_workspace_teachers(target_workspace_id uuid)
returns table(user_id uuid, full_name text, role_key text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if not public.workspace_has_permission(target_workspace_id, 'lessons.read') then
    raise exception 'Você não tem permissão para consultar os professores deste workspace.';
  end if;

  return query
  select member.user_id,
    coalesce(profile.full_name, 'Professor'),
    member.role_key
  from public.workspace_members member
  left join public.profiles profile on profile.id = member.user_id
  where member.workspace_id = target_workspace_id
    and member.status = 'active'
    and member.role_key in ('owner', 'teacher')
  order by case member.role_key when 'owner' then 0 else 1 end, profile.full_name;
end;
$$;

revoke all on function public.list_workspace_teachers(uuid) from public, anon;
grant execute on function public.list_workspace_teachers(uuid) to authenticated;

create or replace function public.validate_lesson_teacher_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.teacher_user_id is not null and not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = new.workspace_id
      and member.user_id = new.teacher_user_id
      and member.status = 'active'
      and member.role_key in ('owner', 'teacher')
  ) then
    raise exception 'O professor selecionado não pertence à equipe ativa deste workspace.';
  end if;

  if new.status = 'completed' and new.attendance_status = 'pending' then
    new.attendance_status := 'present';
  end if;

  return new;
end;
$$;

create or replace function public.validate_student_teacher_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.teacher_user_id is not null and not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = new.workspace_id
      and member.user_id = new.teacher_user_id
      and member.status = 'active'
      and member.role_key in ('owner', 'teacher')
  ) then
    raise exception 'O professor selecionado não pertence à equipe ativa deste workspace.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_student_teacher_assignment on public.student;
create trigger validate_student_teacher_assignment
before insert or update of workspace_id, teacher_user_id on public.student
for each row execute function public.validate_student_teacher_assignment();

create or replace function public.propagate_student_teacher_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.teacher_user_id is distinct from old.teacher_user_id then
    update public.lesson
    set teacher_user_id = new.teacher_user_id
    where workspace_id = new.workspace_id
      and student_id = new.id
      and date >= current_date
      and status = 'scheduled';
  end if;
  return new;
end;
$$;

drop trigger if exists propagate_student_teacher_assignment on public.student;
create trigger propagate_student_teacher_assignment
after update of teacher_user_id on public.student
for each row execute function public.propagate_student_teacher_assignment();

drop trigger if exists validate_lesson_teacher_assignment on public.lesson;
create trigger validate_lesson_teacher_assignment
before insert or update of workspace_id, teacher_user_id, status, attendance_status on public.lesson
for each row execute function public.validate_lesson_teacher_assignment();

create or replace function public.clear_inactive_teacher_assignments()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  target_workspace_id uuid := old.workspace_id;
  target_user_id uuid := old.user_id;
begin
  if tg_op = 'UPDATE' and new.status = 'active' and new.role_key in ('owner', 'teacher') then
    return new;
  end if;

  update public.student
  set teacher_user_id = null
  where workspace_id = target_workspace_id and teacher_user_id = target_user_id;

  update public.lesson
  set teacher_user_id = null
  where workspace_id = target_workspace_id and teacher_user_id = target_user_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_inactive_teacher_assignments on public.workspace_members;
create trigger clear_inactive_teacher_assignments
after update or delete on public.workspace_members
for each row execute function public.clear_inactive_teacher_assignments();

revoke all on function public.validate_lesson_teacher_assignment() from public, anon, authenticated;
revoke all on function public.validate_student_teacher_assignment() from public, anon, authenticated;
revoke all on function public.clear_inactive_teacher_assignments() from public, anon, authenticated;
revoke all on function public.propagate_student_teacher_assignment() from public, anon, authenticated;

create or replace function public.claim_automation_jobs(batch_size integer default 100)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, auth
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Somente o worker de automações pode reivindicar jobs.';
  end if;

  update public.automation_jobs
  set status = 'pending',
      last_error = coalesce(last_error, 'Worker interrompido antes de concluir o job.'),
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '15 minutes';

  return query
  with pending_jobs as (
    select job.id
    from public.automation_jobs job
    where job.status = 'pending' and job.scheduled_for <= now()
    order by job.scheduled_for, job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 100), 200))
  )
  update public.automation_jobs job
  set status = 'processing',
      attempts = job.attempts + 1,
      updated_at = now()
  from pending_jobs
  where job.id = pending_jobs.id
  returning job.*;
end;
$$;

revoke all on function public.claim_automation_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_jobs(integer) to service_role;

commit;
