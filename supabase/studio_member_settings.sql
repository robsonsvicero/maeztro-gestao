-- Allows active Studio members to edit only shared professional and schedule settings.
-- Run after workspaces.sql and account_types.sql.
begin;

do $$
begin
  if to_regclass('public.app_settings') is null
    or to_regclass('public.workspace_members') is null
    or to_regclass('public.workspaces') is null then
    raise exception 'Execute as migrações de workspaces antes de studio_member_settings.sql.';
  end if;
end;
$$;

create or replace function public.update_studio_member_settings(
  target_workspace_id uuid,
  new_professional_name text,
  new_teacher_phone text,
  new_logo_url text,
  new_default_lesson_duration integer,
  new_available_hours jsonb
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
  if auth.uid() is null then
    raise exception 'Entre na sua conta para alterar as configurações.';
  end if;

  if not exists (
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

  if jsonb_typeof(new_available_hours) <> 'object' then
    raise exception 'Os horários disponíveis estão em formato inválido.';
  end if;

  update public.app_settings
  set professional_name = nullif(btrim(new_professional_name), ''),
      teacher_phone = nullif(btrim(new_teacher_phone), ''),
      logo_url = nullif(btrim(new_logo_url), ''),
      default_lesson_duration = new_default_lesson_duration,
      available_hours = new_available_hours
  where workspace_id = target_workspace_id
  returning * into updated_settings;

  if not found then
    raise exception 'As configurações do estúdio não foram encontradas.';
  end if;

  return updated_settings;
end;
$$;

revoke all on function public.update_studio_member_settings(uuid, text, text, text, integer, jsonb) from public, anon;
grant execute on function public.update_studio_member_settings(uuid, text, text, text, integer, jsonb) to authenticated;

commit;
