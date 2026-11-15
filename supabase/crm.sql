-- CRM for studio owners. Run after workspaces.sql, automations.sql and maintain_future_lessons.sql.
begin;

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regclass('public.workspace_members') is null
    or to_regclass('public.workspace_roles') is null
    or to_regclass('public.automation_rules') is null
    or to_regclass('public.automation_events') is null
    or to_regclass('public.student') is null
    or to_regclass('public.lesson') is null then
    raise exception 'Execute workspaces.sql, automations.sql e maintain_future_lessons.sql antes de crm.sql.';
  end if;

  if exists (
    select required.column_name
    from unnest(array[
      'user_id', 'workspace_id', 'full_name', 'phone', 'email', 'instrument', 'level',
      'lesson_day', 'lesson_time', 'teacher_user_id', 'payment_type', 'monthly_payment',
      'weekly_payment', 'payment_day', 'payment_status', 'payment_history',
      'student_status', 'student_state', 'notes'
    ]) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns actual
      where actual.table_schema = 'public'
        and actual.table_name = 'student'
        and actual.column_name = required.column_name
    )
  ) then
    raise exception 'A tabela public.student não contém todos os campos usados na conversão do CRM. Confirme a estrutura da tabela antes de executar crm.sql.';
  end if;
end;
$$;

alter table public.automation_rules
  drop constraint if exists automation_rules_category_check;
alter table public.automation_rules
  add constraint automation_rules_category_check
  check (category in ('finance', 'agenda', 'students', 'studio', 'crm'));

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  phone text,
  email text,
  source text not null default 'Outro' check (length(btrim(source)) between 1 and 80),
  instrument text,
  availability text,
  notes text,
  stage text not null default 'new_lead'
    check (stage in ('new_lead', 'contacted', 'trial', 'proposal', 'enrolled', 'not_converted')),
  loss_reason text,
  next_follow_up_at timestamptz,
  last_contact_at timestamptz,
  enrolled_student_id uuid references public.student(id) on delete restrict,
  enrolled_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (stage <> 'not_converted' or nullif(btrim(loss_reason), '') is not null),
  check ((stage = 'enrolled') = (enrolled_student_id is not null))
);

create index if not exists crm_leads_workspace_stage_created_idx
  on public.crm_leads (workspace_id, stage, created_at desc);
create index if not exists crm_leads_workspace_follow_up_idx
  on public.crm_leads (workspace_id, next_follow_up_at)
  where next_follow_up_at is not null and stage <> 'enrolled';
create unique index if not exists crm_leads_workspace_student_uidx
  on public.crm_leads (workspace_id, enrolled_student_id)
  where enrolled_student_id is not null;

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid not null,
  contact_at timestamptz not null default now(),
  channel text not null check (channel in ('phone', 'whatsapp', 'email', 'in_person', 'other')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  follow_up_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id)
    references public.crm_leads(workspace_id, id) on delete cascade
);

create index if not exists crm_contacts_workspace_lead_date_idx
  on public.crm_contacts (workspace_id, lead_id, contact_at desc);

create table if not exists public.crm_trials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_user_id uuid references auth.users(id) on delete set null,
  trial_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (start_time < end_time)
);

create index if not exists crm_trials_workspace_date_idx
  on public.crm_trials (workspace_id, trial_date, start_time);
create index if not exists crm_trials_teacher_date_idx
  on public.crm_trials (workspace_id, teacher_user_id, trial_date, start_time)
  where status = 'scheduled';

create table if not exists public.crm_lead_trials (
  workspace_id uuid not null,
  lead_id uuid not null,
  trial_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, lead_id, trial_id),
  foreign key (workspace_id, lead_id)
    references public.crm_leads(workspace_id, id) on delete cascade,
  foreign key (workspace_id, trial_id)
    references public.crm_trials(workspace_id, id) on delete cascade
);

create index if not exists crm_lead_trials_workspace_trial_idx
  on public.crm_lead_trials (workspace_id, trial_id);

create or replace function public.set_crm_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_leads_set_updated_at on public.crm_leads;
create trigger crm_leads_set_updated_at
before update on public.crm_leads
for each row execute function public.set_crm_updated_at();

drop trigger if exists crm_trials_set_updated_at on public.crm_trials;
create trigger crm_trials_set_updated_at
before update on public.crm_trials
for each row execute function public.set_crm_updated_at();

create or replace function public.validate_crm_enrolled_student()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.enrolled_student_id is not null and not exists (
    select 1
    from public.student student
    where student.id = new.enrolled_student_id
      and student.workspace_id = new.workspace_id
  ) then
    raise exception 'O aluno vinculado deve pertencer ao mesmo workspace do interessado.';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_lead_student_workspace_validation on public.crm_leads;
create trigger crm_lead_student_workspace_validation
before insert or update of workspace_id, enrolled_student_id on public.crm_leads
for each row execute function public.validate_crm_enrolled_student();

create or replace function public.update_crm_lead_after_contact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  update public.crm_leads
  set last_contact_at = new.contact_at,
      next_follow_up_at = new.follow_up_at
  where id = new.lead_id
    and workspace_id = new.workspace_id;
  return new;
end;
$$;

drop trigger if exists crm_contact_updates_lead on public.crm_contacts;
create trigger crm_contact_updates_lead
after insert on public.crm_contacts
for each row execute function public.update_crm_lead_after_contact();

create or replace function public.validate_crm_trial_teacher()
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

drop trigger if exists crm_trial_teacher_validation on public.crm_trials;
create trigger crm_trial_teacher_validation
before insert or update of workspace_id, teacher_user_id on public.crm_trials
for each row execute function public.validate_crm_trial_teacher();

alter table public.crm_leads enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_trials enable row level security;
alter table public.crm_lead_trials enable row level security;

drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.read'));

drop policy if exists crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads
for insert to authenticated
with check (
  public.workspace_has_permission(workspace_id, 'crm.write')
  and created_by = auth.uid()
);

drop policy if exists crm_leads_update on public.crm_leads;
create policy crm_leads_update on public.crm_leads
for update to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.write'))
with check (public.workspace_has_permission(workspace_id, 'crm.write'));

drop policy if exists crm_contacts_select on public.crm_contacts;
create policy crm_contacts_select on public.crm_contacts
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.read'));

drop policy if exists crm_contacts_insert on public.crm_contacts;
create policy crm_contacts_insert on public.crm_contacts
for insert to authenticated
with check (
  public.workspace_has_permission(workspace_id, 'crm.write')
  and created_by = auth.uid()
);

drop policy if exists crm_trials_select on public.crm_trials;
create policy crm_trials_select on public.crm_trials
for select to authenticated
using (
  public.workspace_has_permission(workspace_id, 'crm.read')
  or (
    teacher_user_id = auth.uid()
    and public.workspace_has_permission(workspace_id, 'lessons.read')
  )
);

drop policy if exists crm_trials_insert on public.crm_trials;
create policy crm_trials_insert on public.crm_trials
for insert to authenticated
with check (public.workspace_has_permission(workspace_id, 'crm.write'));

drop policy if exists crm_trials_update on public.crm_trials;
create policy crm_trials_update on public.crm_trials
for update to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.write'))
with check (public.workspace_has_permission(workspace_id, 'crm.write'));

drop policy if exists crm_trials_delete on public.crm_trials;
create policy crm_trials_delete on public.crm_trials
for delete to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.write'));

drop policy if exists crm_lead_trials_select on public.crm_lead_trials;
create policy crm_lead_trials_select on public.crm_lead_trials
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.read'));

drop policy if exists crm_lead_trials_insert on public.crm_lead_trials;
create policy crm_lead_trials_insert on public.crm_lead_trials
for insert to authenticated
with check (public.workspace_has_permission(workspace_id, 'crm.write'));

drop policy if exists crm_lead_trials_delete on public.crm_lead_trials;
create policy crm_lead_trials_delete on public.crm_lead_trials
for delete to authenticated
using (public.workspace_has_permission(workspace_id, 'crm.write'));

revoke all on public.crm_leads, public.crm_contacts, public.crm_trials, public.crm_lead_trials
  from anon, authenticated;
grant select, insert, update on public.crm_leads to authenticated;
grant select, insert on public.crm_contacts to authenticated;
grant select, insert, update, delete on public.crm_trials to authenticated;
grant select, insert, delete on public.crm_lead_trials to authenticated;
grant all on public.crm_leads, public.crm_contacts, public.crm_trials, public.crm_lead_trials
  to service_role;

create or replace view public.crm_public_trial_events
with (security_invoker = true)
as
select
  id,
  workspace_id,
  'Aula experimental'::text as title,
  trial_date as date,
  start_time,
  end_time,
  teacher_user_id
from public.crm_trials
where (
  public.workspace_has_permission(workspace_id, 'crm.read')
  or (
    teacher_user_id = auth.uid()
    and public.workspace_has_permission(workspace_id, 'lessons.read')
  )
)
and status <> 'cancelled';

revoke all on public.crm_public_trial_events from anon, authenticated;
grant select on public.crm_public_trial_events to authenticated;

create or replace function public.create_crm_trial(
  target_workspace_id uuid,
  target_lead_id uuid,
  target_date date,
  target_start_time time,
  target_end_time time,
  target_teacher_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
set row_security = off
as $$
declare
  trial_id uuid;
  current_stage text;
begin
  if not public.workspace_has_permission(target_workspace_id, 'crm.write') then
    raise exception 'Você não tem permissão para agendar aulas experimentais neste workspace.';
  end if;

  if target_start_time >= target_end_time then
    raise exception 'O horário de término deve ser posterior ao início.';
  end if;

  select lead.stage
  into current_stage
  from public.crm_leads lead
  where lead.id = target_lead_id
    and lead.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'Lead não encontrado neste workspace.';
  end if;

  if current_stage = 'enrolled' then
    raise exception 'Não é possível agendar experimental para um aluno já matriculado.';
  end if;

  insert into public.crm_trials (
    workspace_id, teacher_user_id, trial_date, start_time, end_time
  )
  values (
    target_workspace_id, target_teacher_user_id, target_date, target_start_time, target_end_time
  )
  returning id into trial_id;

  insert into public.crm_lead_trials (workspace_id, lead_id, trial_id)
  values (target_workspace_id, target_lead_id, trial_id);

  update public.crm_leads
  set stage = case when stage in ('new_lead', 'contacted') then 'trial' else stage end
  where id = target_lead_id and workspace_id = target_workspace_id;

  return trial_id;
end;
$$;

create or replace function public.convert_crm_lead(
  target_workspace_id uuid,
  target_lead_id uuid,
  target_student_id uuid default null,
  create_new_despite_matches boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
set row_security = off
as $$
declare
  lead_record public.crm_leads%rowtype;
  student_record public.student%rowtype;
  normalized_phone text;
  matches jsonb := '[]'::jsonb;
  new_student_id uuid;
begin
  if not public.workspace_has_permission(target_workspace_id, 'crm.write') then
    raise exception 'Você não tem permissão para converter leads neste workspace.';
  end if;

  select lead.*
  into lead_record
  from public.crm_leads lead
  where lead.id = target_lead_id
    and lead.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'Lead não encontrado neste workspace.';
  end if;

  if lead_record.stage = 'enrolled' then
    return jsonb_build_object('status', 'already_converted', 'student_id', lead_record.enrolled_student_id);
  end if;

  normalized_phone := regexp_replace(coalesce(lead_record.phone, ''), '[^0-9]', '', 'g');
  if normalized_phone = '' or nullif(btrim(lead_record.instrument), '') is null then
    raise exception 'Informe o telefone e o instrumento de interesse antes de converter o lead.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_workspace_id::text), hashtext(normalized_phone));

  if target_student_id is not null then
    select student.*
    into student_record
    from public.student student
    where student.id = target_student_id
      and student.workspace_id = target_workspace_id;

    if not found
      or regexp_replace(coalesce(student_record.phone, ''), '[^0-9]', '', 'g') <> normalized_phone then
      raise exception 'O aluno escolhido não corresponde ao telefone deste lead.';
    end if;

    if exists (
      select 1
      from public.crm_leads linked_lead
      where linked_lead.workspace_id = target_workspace_id
        and linked_lead.enrolled_student_id = target_student_id
        and linked_lead.id <> target_lead_id
    ) then
      return jsonb_build_object('status', 'student_already_linked', 'student_id', target_student_id);
    end if;
    new_student_id := target_student_id;
    update public.student
    set student_status = 'active',
        student_state = 'active'
    where id = target_student_id
      and workspace_id = target_workspace_id;
  else
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', student.id,
        'full_name', student.full_name,
        'phone', student.phone
      ) order by student.full_name),
      '[]'::jsonb
    )
    into matches
    from public.student student
    where student.workspace_id = target_workspace_id
      and regexp_replace(coalesce(student.phone, ''), '[^0-9]', '', 'g') = normalized_phone;

    if jsonb_array_length(matches) > 0 and not create_new_despite_matches then
      return jsonb_build_object('status', 'matches_required', 'matches', matches);
    end if;

    insert into public.student (
      user_id,
      workspace_id,
      full_name,
      phone,
      email,
      instrument,
      level,
      lesson_day,
      lesson_time,
      teacher_user_id,
      payment_type,
      monthly_payment,
      weekly_payment,
      payment_day,
      payment_status,
      payment_history,
      student_status,
      student_state,
      notes
    )
    values (
      auth.uid(),
      target_workspace_id,
      lead_record.full_name,
      lead_record.phone,
      coalesce(lead_record.email, ''),
      lead_record.instrument,
      'iniciante',
      '',
      '',
      null,
      'monthly',
      0,
      0,
      null,
      'pending',
      '[]'::jsonb,
      'active',
      'active',
      coalesce(lead_record.notes, '')
    )
    returning id into new_student_id;
  end if;

  update public.crm_leads
  set stage = 'enrolled',
      loss_reason = null,
      enrolled_student_id = new_student_id,
      enrolled_at = now()
  where id = target_lead_id
    and workspace_id = target_workspace_id;

  return jsonb_build_object(
    'status', case when target_student_id is null then 'created' else 'linked' end,
    'student_id', new_student_id
  );
end;
$$;

revoke all on function public.set_crm_updated_at() from public, anon, authenticated;
revoke all on function public.validate_crm_enrolled_student() from public, anon, authenticated;
revoke all on function public.update_crm_lead_after_contact() from public, anon, authenticated;
revoke all on function public.validate_crm_trial_teacher() from public, anon, authenticated;
revoke all on function public.create_crm_trial(uuid, uuid, date, time, time, uuid) from public, anon;
revoke all on function public.convert_crm_lead(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_crm_trial(uuid, uuid, date, time, time, uuid) to authenticated;
grant execute on function public.convert_crm_lead(uuid, uuid, uuid, boolean) to authenticated;

drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules
for select to authenticated
using (
  public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.write'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.write'))
)
with check (
  public.workspace_has_permission(workspace_id, 'automations.manage')
  and (
    (category <> 'finance' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.write')
  )
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.write'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.write'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
)
with check (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
);

drop policy if exists automation_jobs_select on public.automation_jobs;
create policy automation_jobs_select on public.automation_jobs
for select to authenticated
using (
  user_id = auth.uid()
  and public.workspace_has_permission(workspace_id, 'automations.read')
  and (
    (rule_key not like 'finance.%' and rule_key not in ('studio.weekly_finance_summary', 'studio.admin_pending'))
    or public.workspace_has_permission(workspace_id, 'finance.read')
  )
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
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
  and (rule_key not like 'crm.%' or public.workspace_has_permission(workspace_id, 'crm.read'))
);

create or replace function public.seed_workspace_crm_rules(target_workspace_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  insert into public.automation_rules (workspace_id, rule_key, category, enabled, config)
  values (target_workspace_id, 'crm.follow_up_due', 'crm', true, '{}'::jsonb)
  on conflict (workspace_id, rule_key) do nothing;
$$;

revoke all on function public.seed_workspace_crm_rules(uuid) from public, anon, authenticated;

create or replace function public.seed_new_workspace_crm_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  perform public.seed_workspace_crm_rules(new.id);
  return new;
end;
$$;

drop trigger if exists seed_new_workspace_crm_rules on public.workspaces;
create trigger seed_new_workspace_crm_rules
after insert on public.workspaces
for each row execute function public.seed_new_workspace_crm_rules();

revoke all on function public.seed_new_workspace_crm_rules() from public, anon, authenticated;

select public.seed_workspace_crm_rules(workspace.id)
from public.workspaces workspace;

commit;
