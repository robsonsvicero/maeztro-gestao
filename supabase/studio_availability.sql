-- Separates studio opening hours from each teacher's availability.
-- Run after workspaces.sql, account_types.sql, automations.sql,
-- and the updated studio_member_settings.sql.
begin;

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regclass('public.workspace_members') is null
    or to_regclass('public.workspace_availability') is null
    or to_regclass('public.app_settings') is null then
    raise exception 'Execute as migrações de workspaces, automations e configurações antes de studio_availability.sql.';
  end if;
end;
$$;

drop function if exists public.update_studio_member_settings(uuid, text, text, text, integer, jsonb);

create or replace function public.update_studio_member_settings(
  target_workspace_id uuid,
  new_professional_name text,
  new_teacher_phone text,
  new_logo_url text,
  new_default_lesson_duration integer
)
returns public.app_settings
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  updated_settings public.app_settings%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.workspaces workspace
    join public.workspace_members member on member.workspace_id = workspace.id
    where workspace.id = target_workspace_id
      and workspace.account_type = 'studio'
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role_key in ('teacher', 'finance')
  ) then
    raise exception 'Somente membros ativos do estúdio podem alterar estas configurações.';
  end if;

  if new_default_lesson_duration is null
    or new_default_lesson_duration < 1
    or new_default_lesson_duration > 480 then
    raise exception 'A duração padrão deve estar entre 1 e 480 minutos.';
  end if;

  update public.app_settings
  set professional_name = nullif(btrim(new_professional_name), ''),
      teacher_phone = nullif(btrim(new_teacher_phone), ''),
      logo_url = nullif(btrim(new_logo_url), ''),
      default_lesson_duration = new_default_lesson_duration
  where workspace_id = target_workspace_id
  returning * into updated_settings;

  if not found then
    raise exception 'As configurações do estúdio não foram encontradas.';
  end if;

  return updated_settings;
end;
$$;

create table if not exists public.studio_availability_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (workspace_id, weekday, start_time, end_time)
);

create table if not exists public.studio_teacher_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (workspace_id, teacher_user_id, weekday, start_time, end_time)
);

create index if not exists studio_teacher_availability_lookup_idx
  on public.studio_teacher_availability (workspace_id, teacher_user_id, weekday, start_time);

insert into public.studio_availability_windows (workspace_id, weekday, start_time, end_time)
select workspace_id, weekday, start_time, end_time
from public.workspace_availability
where is_available and start_time is not null and end_time is not null
on conflict (workspace_id, weekday, start_time, end_time) do nothing;

alter table public.studio_availability_windows enable row level security;
alter table public.studio_teacher_availability enable row level security;

drop policy if exists studio_availability_windows_select on public.studio_availability_windows;
create policy studio_availability_windows_select on public.studio_availability_windows
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'lessons.read'));

drop policy if exists studio_teacher_availability_select on public.studio_teacher_availability;
create policy studio_teacher_availability_select on public.studio_teacher_availability
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'lessons.read'));

revoke all on public.studio_availability_windows, public.studio_teacher_availability from anon, authenticated;
grant select on public.studio_availability_windows, public.studio_teacher_availability to authenticated;

create or replace function public.replace_studio_availability(
  target_workspace_id uuid,
  availability_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Somente o proprietário pode alterar os horários do estúdio.';
  end if;

  if not exists (
    select 1 from public.workspaces
    where id = target_workspace_id and account_type = 'studio'
  ) then
    raise exception 'Os horários do estúdio só podem ser configurados em uma conta Estúdio.';
  end if;

  if jsonb_typeof(availability_rows) is distinct from 'array' then
    raise exception 'A lista de horários do estúdio está em formato inválido.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(availability_rows) as slot(weekday integer, start_time time, end_time time)
    where slot.weekday is null
      or slot.weekday not between 0 and 6
      or slot.start_time is null
      or slot.end_time is null
      or slot.start_time >= slot.end_time
  ) then
    raise exception 'Confira os dias e os horários de abertura do estúdio.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(availability_rows) as first_slot(weekday integer, start_time time, end_time time)
    join jsonb_to_recordset(availability_rows) as second_slot(weekday integer, start_time time, end_time time)
      on first_slot.weekday = second_slot.weekday
      and (first_slot.start_time, first_slot.end_time) < (second_slot.start_time, second_slot.end_time)
      and first_slot.start_time < second_slot.end_time
      and second_slot.start_time < first_slot.end_time
  ) then
    raise exception 'Os horários do estúdio no mesmo dia não podem se sobrepor.';
  end if;

  delete from public.studio_availability_windows
  where workspace_id = target_workspace_id;

  insert into public.studio_availability_windows (workspace_id, weekday, start_time, end_time)
  select target_workspace_id, slot.weekday, slot.start_time, slot.end_time
  from jsonb_to_recordset(availability_rows) as slot(weekday integer, start_time time, end_time time);
end;
$$;

create or replace function public.replace_teacher_availability(
  target_workspace_id uuid,
  target_teacher_user_id uuid,
  availability_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para alterar os horários.';
  end if;

  select exists (
    select 1
    from public.workspace_members member
    join public.workspaces workspace on workspace.id = member.workspace_id
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role_key = 'owner'
      and workspace.account_type = 'studio'
  ) into is_owner;

  if not exists (
    select 1
    from public.workspace_members member
    join public.workspaces workspace on workspace.id = member.workspace_id
    where member.workspace_id = target_workspace_id
      and member.user_id = target_teacher_user_id
      and member.status = 'active'
      and member.role_key in ('owner', 'teacher')
      and workspace.account_type = 'studio'
  ) then
    raise exception 'O professor selecionado não pertence à equipe ativa deste estúdio.';
  end if;

  if not is_owner and not (
    target_teacher_user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role_key = 'teacher'
    )
  ) then
    raise exception 'Você só pode alterar a sua própria disponibilidade.';
  end if;

  if jsonb_typeof(availability_rows) is distinct from 'array' then
    raise exception 'A lista de horários do professor está em formato inválido.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(availability_rows) as slot(weekday integer, start_time time, end_time time)
    where slot.weekday is null
      or slot.weekday not between 0 and 6
      or slot.start_time is null
      or slot.end_time is null
      or slot.start_time >= slot.end_time
  ) then
    raise exception 'Confira os dias e os horários de disponibilidade do professor.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(availability_rows) as first_slot(weekday integer, start_time time, end_time time)
    join jsonb_to_recordset(availability_rows) as second_slot(weekday integer, start_time time, end_time time)
      on first_slot.weekday = second_slot.weekday
      and (first_slot.start_time, first_slot.end_time) < (second_slot.start_time, second_slot.end_time)
      and first_slot.start_time < second_slot.end_time
      and second_slot.start_time < first_slot.end_time
  ) then
    raise exception 'Os horários do professor no mesmo dia não podem se sobrepor.';
  end if;

  delete from public.studio_teacher_availability
  where workspace_id = target_workspace_id
    and teacher_user_id = target_teacher_user_id;

  insert into public.studio_teacher_availability (
    workspace_id, teacher_user_id, weekday, start_time, end_time
  )
  select target_workspace_id, target_teacher_user_id, slot.weekday, slot.start_time, slot.end_time
  from jsonb_to_recordset(availability_rows) as slot(weekday integer, start_time time, end_time time);
end;
$$;

revoke all on function public.replace_studio_availability(uuid, jsonb) from public, anon;
revoke all on function public.replace_teacher_availability(uuid, uuid, jsonb) from public, anon;
grant execute on function public.replace_studio_availability(uuid, jsonb) to authenticated;
grant execute on function public.replace_teacher_availability(uuid, uuid, jsonb) to authenticated;
revoke all on function public.update_studio_member_settings(uuid, text, text, text, integer) from public, anon;
grant execute on function public.update_studio_member_settings(uuid, text, text, text, integer) to authenticated;

commit;
