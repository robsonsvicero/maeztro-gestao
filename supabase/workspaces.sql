-- Multi-workspace foundation: run after user_data_rls.sql and the entitlements schema.
-- Existing records are moved into one default workspace per current owner.
begin;

create extension if not exists pgcrypto;

do $$
declare
  target_table text;
  protected_tables text[] := array[
    'app_settings', 'student', 'lesson', 'transaction', 'receipt',
    'client', 'quote', 'company_settings', 'service_order', 'budget'
  ];
begin
  if to_regclass('public.student') is null then
    raise exception 'Tabela public.student não encontrada. Crie ou restaure a tabela de alunos antes de executar workspaces.sql.';
  end if;

  foreach target_table in array protected_tables loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = target_table
        and column_name = 'user_id'
    ) then
      raise exception 'A coluna user_id não existe em public.%. Execute user_data_rls.sql antes de workspaces.sql.', target_table;
    end if;
  end loop;
end;
$$;

create table if not exists public.workspace_roles (
  role_key text primary key,
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.workspace_roles (role_key, name, permissions)
values
  ('owner', 'Proprietário', '{
    "workspace.read": true, "workspace.manage": true,
    "settings.read": true, "settings.write": true,
    "students.read": true, "students.write": true,
    "lessons.read": true, "lessons.write": true,
    "finance.read": true, "finance.write": true,
    "crm.read": true, "crm.write": true,
    "service_orders.read": true, "service_orders.write": true
  }'::jsonb),
  ('teacher', 'Professor', '{
    "workspace.read": true, "settings.read": true,
    "students.read": true, "students.write": true,
    "lessons.read": true, "lessons.write": true
  }'::jsonb),
  ('finance', 'Financeiro', '{
    "workspace.read": true, "settings.read": true,
    "finance.read": true
  }'::jsonb)
on conflict (role_key) do update
set name = excluded.name, permissions = excluded.permissions;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_one_default_per_owner_uidx
  on public.workspaces(owner_id) where is_default;
create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.workspace_roles(role_key),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id, status);

create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  role_key text not null references public.workspace_roles(role_key),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists workspace_invitations_pending_email_uidx
  on public.workspace_invitations(workspace_id, email) where status = 'pending';
create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations(workspace_id, status, expires_at);

-- Product mappings may override the account-type defaults added by account_types.sql.
-- Until that migration runs, unmapped plans get the safe owner-only limits.
create table if not exists public.workspace_plan_limits (
  provider text not null,
  product_id text not null default '',
  base_plan_id text not null default '',
  max_workspaces integer not null check (max_workspaces >= 1),
  max_members integer not null check (max_members >= 1),
  updated_at timestamptz not null default now(),
  primary key (provider, product_id, base_plan_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_plan_limits enable row level security;

create or replace function public.workspace_has_permission(target_workspace_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.workspace_members member
    join public.workspace_roles role on role.role_key = member.role_key
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and coalesce((role.permissions ->> required_permission)::boolean, false)
  );
$$;

create or replace function public.workspace_is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.workspace_plan_limits_for_owner(target_owner_id uuid)
returns table(max_workspaces integer, max_members integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  entitlement_provider text;
  entitlement_product_id text;
  entitlement_base_plan_id text;
  configured_max_workspaces integer;
  configured_max_members integer;
begin
  if to_regclass('public.entitlements') is not null then
    execute $query$
      select provider, coalesce(product_id, ''), coalesce(base_plan_id, '')
      from public.entitlements
      where auth_user_id = $1
        and revoked_at is null
        and status in ('active', 'grace_period', 'canceled')
        and (access_ends_at is null or access_ends_at > now())
      order by
        case access_type when 'lifetime' then 0 when 'subscription' then 1 else 2 end,
        created_at desc
      limit 1
    $query$
    into entitlement_provider, entitlement_product_id, entitlement_base_plan_id
    using target_owner_id;
  end if;

  if entitlement_provider is null then
    return query select 1, 1;
    return;
  end if;

  select limits.max_workspaces, limits.max_members
  into configured_max_workspaces, configured_max_members
  from public.workspace_plan_limits limits
  where limits.provider = entitlement_provider
    and limits.product_id = entitlement_product_id
    and limits.base_plan_id = entitlement_base_plan_id;

  if configured_max_workspaces is null or configured_max_members is null then
    return query select 1, 1;
  else
    return query select configured_max_workspaces, configured_max_members;
  end if;
end;
$$;

-- Backfill one default workspace and owner membership for every existing account.
insert into public.workspaces (name, owner_id, is_default)
select
  coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
    'Meu estúdio'
  ),
  auth_user.id,
  true
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where not exists (
  select 1 from public.workspaces existing
  where existing.owner_id = auth_user.id and existing.is_default
)
on conflict (owner_id) where is_default do nothing;

insert into public.workspace_members (workspace_id, user_id, role_key, created_by)
select workspace.id, workspace.owner_id, 'owner', workspace.owner_id
from public.workspaces workspace
where workspace.is_default
on conflict (workspace_id, user_id) do nothing;

insert into public.workspace_settings (workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

do $$
declare
  table_name text;
  has_unassigned_data boolean;
  protected_tables text[] := array[
    'app_settings', 'student', 'lesson', 'transaction', 'receipt',
    'client', 'quote', 'company_settings', 'service_order', 'budget'
  ];
begin
  foreach table_name in array protected_tables loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format('alter table public.%I add column if not exists workspace_id uuid', table_name);
    execute format(
      'update public.%I data set workspace_id = workspace.id from public.workspaces workspace where data.workspace_id is null and data.user_id = workspace.owner_id and workspace.is_default',
      table_name
    );

    execute format(
      'select exists (select 1 from public.%I where workspace_id is null)',
      table_name
    ) into has_unassigned_data;

    if has_unassigned_data then
      raise exception 'Não foi possível vincular todos os registros de public.% a um workspace. Revise user_id antes de continuar.', table_name;
    end if;

    execute format('alter table public.%I alter column workspace_id set not null', table_name);
    execute format('create index if not exists %I on public.%I (workspace_id)', table_name || '_workspace_id_idx', table_name);

    if not exists (
      select 1
      from pg_constraint
      where conname = table_name || '_workspace_id_fkey'
        and conrelid = to_regclass('public.' || table_name)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (workspace_id) references public.workspaces(id) on delete restrict',
        table_name,
        table_name || '_workspace_id_fkey'
      );
    end if;
  end loop;
end;
$$;

create or replace function public.assign_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  selected_workspace_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'Não é permitido mover registros entre workspaces.';
    end if;
    return new;
  end if;

  selected_workspace_id := new.workspace_id;
  if selected_workspace_id is null then
    raise exception 'Selecione um workspace ativo antes de criar este registro.';
  end if;

  if auth.uid() is not null
    and not public.workspace_has_permission(selected_workspace_id, tg_argv[0]) then
    raise exception 'Você não tem permissão para criar registros neste workspace.';
  end if;

  if auth.uid() is null and new.user_id is null then
    raise exception 'Jobs administrativos devem indicar user_id ao criar registros.';
  end if;

  new.workspace_id := selected_workspace_id;
  return new;
end;
$$;

create or replace function public.guard_student_financial_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  new_values jsonb;
  old_values jsonb;
  financial_field text;
  financial_fields text[] := array[
    'payment_type', 'monthly_payment', 'weekly_payment', 'payment_day',
    'payment_status', 'payment_history', 'last_payment_date', 'next_payment_date'
  ];
begin
  new_values := to_jsonb(new);

  if auth.uid() is null or public.workspace_has_permission(new.workspace_id, 'finance.write') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    old_values := to_jsonb(old);
    foreach financial_field in array financial_fields loop
      if new_values -> financial_field is distinct from old_values -> financial_field then
        raise exception 'Somente o proprietário pode alterar informações financeiras do aluno.';
      end if;
    end loop;
  elsif
    coalesce(new_values ->> 'payment_type', 'monthly') <> 'monthly'
    or coalesce((new_values ->> 'monthly_payment')::numeric, 0) <> 0
    or coalesce((new_values ->> 'weekly_payment')::numeric, 0) <> 0
    or new_values ->> 'payment_day' is not null
    or coalesce(new_values ->> 'payment_status', 'pending') <> 'pending'
    or coalesce(new_values -> 'payment_history', '[]'::jsonb) <> '[]'::jsonb
    or new_values ->> 'last_payment_date' is not null
    or new_values ->> 'next_payment_date' is not null
  then
    raise exception 'Somente o proprietário pode definir informações financeiras do aluno.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_student_financial_changes on public.student;
create trigger guard_student_financial_changes
before insert or update on public.student
for each row execute function public.guard_student_financial_changes();

do $$
declare
  table_name text;
  write_permission text;
  protected_tables record;
begin
  for protected_tables in
    select * from (values
      ('app_settings', 'settings.write'),
      ('student', 'students.write'),
      ('lesson', 'lessons.write'),
      ('transaction', 'finance.write'),
      ('receipt', 'finance.write'),
      ('client', 'crm.write'),
      ('quote', 'crm.write'),
      ('company_settings', 'settings.write'),
      ('service_order', 'service_orders.write'),
      ('budget', 'finance.write')
    ) as permissions(table_name, write_permission)
  loop
    table_name := protected_tables.table_name;
    write_permission := protected_tables.write_permission;
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format('drop trigger if exists assign_workspace_id on public.%I', table_name);
    execute format(
      'create trigger assign_workspace_id before insert or update on public.%I for each row execute function public.assign_workspace_id(%L)',
      table_name,
      write_permission
    );
  end loop;
end;
$$;

-- Replace prior owner-only policies on these application tables.
do $$
declare
  protected_table record;
  existing_policy record;
begin
  for protected_table in
    select * from (values
      ('app_settings', 'settings.read', 'settings.write'),
      ('student', 'students.read', 'students.write'),
      ('lesson', 'lessons.read', 'lessons.write'),
      ('transaction', 'finance.read', 'finance.write'),
      ('receipt', 'finance.read', 'finance.write'),
      ('client', 'crm.read', 'crm.write'),
      ('quote', 'crm.read', 'crm.write'),
      ('company_settings', 'settings.read', 'settings.write'),
      ('service_order', 'service_orders.read', 'service_orders.write'),
      ('budget', 'finance.read', 'finance.write')
    ) as permissions(table_name, read_permission, write_permission)
  loop
    if to_regclass('public.' || protected_table.table_name) is null then
      continue;
    end if;

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = protected_table.table_name
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, protected_table.table_name);
    end loop;

    execute format('alter table public.%I enable row level security', protected_table.table_name);
    execute format(
      'create policy workspace_data_select on public.%I for select to authenticated using (public.workspace_has_permission(workspace_id, %L))',
      protected_table.table_name,
      protected_table.read_permission
    );
    execute format(
      'create policy workspace_data_insert on public.%I for insert to authenticated with check (public.workspace_has_permission(workspace_id, %L))',
      protected_table.table_name,
      protected_table.write_permission
    );
    execute format(
      'create policy workspace_data_update on public.%I for update to authenticated using (public.workspace_has_permission(workspace_id, %L)) with check (public.workspace_has_permission(workspace_id, %L))',
      protected_table.table_name,
      protected_table.write_permission,
      protected_table.write_permission
    );
    execute format(
      'create policy workspace_data_delete on public.%I for delete to authenticated using (public.workspace_has_permission(workspace_id, %L))',
      protected_table.table_name,
      protected_table.write_permission
    );
  end loop;
end;
$$;

drop policy if exists workspace_roles_select on public.workspace_roles;
create policy workspace_roles_select on public.workspace_roles
for select to authenticated using (true);

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
for select to authenticated
using (public.workspace_has_permission(id, 'workspace.read'));

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
for update to authenticated
using (public.workspace_has_permission(id, 'workspace.manage'))
with check (public.workspace_has_permission(id, 'workspace.manage'));

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
for select to authenticated
using (user_id = auth.uid() or public.workspace_has_permission(workspace_id, 'workspace.manage'));

drop policy if exists workspace_settings_select on public.workspace_settings;
create policy workspace_settings_select on public.workspace_settings
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'settings.read'));

drop policy if exists workspace_settings_update on public.workspace_settings;
create policy workspace_settings_update on public.workspace_settings
for update to authenticated
using (public.workspace_has_permission(workspace_id, 'settings.write'))
with check (public.workspace_has_permission(workspace_id, 'settings.write'));

drop policy if exists workspace_invitations_select on public.workspace_invitations;
create policy workspace_invitations_select on public.workspace_invitations
for select to authenticated
using (public.workspace_has_permission(workspace_id, 'workspace.manage'));

create or replace function public.prevent_workspace_owner_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.is_default is distinct from old.is_default then
    raise exception 'O proprietário e o workspace padrão não podem ser alterados diretamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_workspace_owner_change on public.workspaces;
create trigger prevent_workspace_owner_change
before update on public.workspaces
for each row execute function public.prevent_workspace_owner_change();

create or replace function public.create_default_workspace_for_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  new_workspace_id uuid;
  workspace_name text;
begin
  workspace_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Meu estúdio'
  );

  insert into public.workspaces (name, owner_id, is_default)
  values (workspace_name, new.id, true)
  on conflict (owner_id) where is_default do nothing
  returning id into new_workspace_id;

  if new_workspace_id is null then
    select id into new_workspace_id
    from public.workspaces
    where owner_id = new.id and is_default;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role_key, created_by)
  values (new_workspace_id, new.id, 'owner', new.id)
  on conflict (workspace_id, user_id) do nothing;

  insert into public.workspace_settings (workspace_id)
  values (new_workspace_id)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_default_workspace_for_user on auth.users;
create trigger create_default_workspace_for_user
after insert on auth.users
for each row execute function public.create_default_workspace_for_user();

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  current_owner_id uuid := auth.uid();
  new_workspace_id uuid;
  maximum_workspaces integer;
begin
  if current_owner_id is null then raise exception 'Autenticação obrigatória.'; end if;
  if length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'O nome do workspace deve ter entre 1 e 120 caracteres.';
  end if;

  perform 1 from auth.users where id = current_owner_id for update;

  select limits.max_workspaces
  into maximum_workspaces
  from public.workspace_plan_limits_for_owner(current_owner_id) limits;

  if (select count(*) from public.workspaces workspace where workspace.owner_id = current_owner_id) >= maximum_workspaces then
    raise exception 'O limite de workspaces do plano foi atingido.';
  end if;

  insert into public.workspaces (name, owner_id)
  values (btrim(workspace_name), current_owner_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role_key, created_by)
  values (new_workspace_id, current_owner_id, 'owner', current_owner_id);

  insert into public.workspace_settings (workspace_id) values (new_workspace_id);
  return new_workspace_id;
end;
$$;

drop function if exists public.list_my_workspaces();
create function public.list_my_workspaces()
returns table(workspace_id uuid, workspace_name text, owner_id uuid, role_key text, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select workspace.id, workspace.name, workspace.owner_id, member.role_key, workspace.created_at
  from public.workspace_members member
  join public.workspaces workspace on workspace.id = member.workspace_id
  where member.user_id = auth.uid() and member.status = 'active'
  order by workspace.is_default desc, workspace.created_at;
$$;

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table(user_id uuid, email text, full_name text, role_key text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Somente o proprietário pode consultar a equipe deste workspace.';
  end if;

  return query
  select member.user_id, auth_user.email::text, profile.full_name::text, member.role_key, member.status, member.created_at
  from public.workspace_members member
  join auth.users auth_user on auth_user.id = member.user_id
  left join public.profiles profile on profile.id = member.user_id
  where member.workspace_id = target_workspace_id
  order by member.created_at;
end;
$$;

create or replace function public.create_workspace_invitation(target_workspace_id uuid, invite_email text, invite_role_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
set row_security = off
as $$
declare
  normalized_email text := lower(btrim(invite_email));
  invite_token text := encode(gen_random_bytes(32), 'hex');
  invitation_id uuid;
  workspace_owner_id uuid;
  maximum_members integer;
  current_seats bigint;
begin
  if not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Somente o proprietário pode convidar membros.';
  end if;
  if invite_role_key not in ('teacher', 'finance') then
    raise exception 'Papel de convite inválido.';
  end if;
  if normalized_email is null or normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um endereço de e-mail válido.';
  end if;

  select owner_id into workspace_owner_id
  from public.workspaces where id = target_workspace_id for update;
  perform 1 from auth.users where id = workspace_owner_id for update;

  if exists (
    select 1
    from auth.users auth_user
    join public.workspace_members member on member.user_id = auth_user.id
    where member.workspace_id = target_workspace_id
      and member.status = 'active'
      and lower(auth_user.email) = normalized_email
  ) then
    raise exception 'Este e-mail já pertence a um membro ativo do workspace.';
  end if;

  select limits.max_members
  into maximum_members
  from public.workspace_plan_limits_for_owner(workspace_owner_id) limits;

  select count(distinct member.user_id)
  into current_seats
  from public.workspace_members member
  join public.workspaces workspace on workspace.id = member.workspace_id
  where workspace.owner_id = workspace_owner_id
    and member.status = 'active';

  select current_seats + count(distinct invitation.email)
  into current_seats
  from public.workspace_invitations invitation
  join public.workspaces workspace on workspace.id = invitation.workspace_id
  where workspace.owner_id = workspace_owner_id
    and invitation.status = 'pending'
    and invitation.email <> normalized_email
    and invitation.expires_at > now()
    and not exists (
      select 1
      from public.workspace_members active_member
      join public.workspaces active_workspace on active_workspace.id = active_member.workspace_id
      join auth.users active_user on active_user.id = active_member.user_id
      where active_workspace.owner_id = workspace_owner_id
        and active_member.status = 'active'
        and lower(active_user.email) = invitation.email
    );

  if current_seats >= maximum_members then
    raise exception 'O limite de membros do plano foi atingido ou ainda não foi configurado.';
  end if;

  update public.workspace_invitations
  set status = 'revoked'
  where workspace_id = target_workspace_id
    and email = normalized_email
    and status = 'pending';

  insert into public.workspace_invitations (
    workspace_id, email, role_key, token_hash, expires_at, invited_by
  )
  values (
    target_workspace_id,
    normalized_email,
    invite_role_key,
    encode(digest(invite_token, 'sha256'), 'hex'),
    now() + interval '7 days',
    auth.uid()
  )
  returning id into invitation_id;

  return jsonb_build_object(
    'id', invitation_id,
    'token', invite_token,
    'email', normalized_email,
    'role_key', invite_role_key,
    'expires_at', now() + interval '7 days'
  );
end;
$$;

create or replace function public.accept_workspace_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation public.workspace_invitations%rowtype;
begin
  if current_user_id is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
  if invite_token is null or length(invite_token) < 32 then raise exception 'O link de convite é inválido.'; end if;
  if current_email = '' then
    select lower(email) into current_email from auth.users where id = current_user_id;
  end if;

  select * into invitation
  from public.workspace_invitations
  where token_hash = encode(digest(invite_token, 'sha256'), 'hex')
  for update;

  if not found then raise exception 'O convite não existe ou já foi removido.'; end if;
  if invitation.status = 'accepted' and invitation.accepted_by = current_user_id then
    return invitation.workspace_id;
  end if;
  if invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception 'O convite expirou ou foi revogado.';
  end if;
  if current_email = '' or current_email <> invitation.email then
    raise exception 'Entre com o e-mail convidado para aceitar este convite.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role_key, created_by)
  values (invitation.workspace_id, current_user_id, invitation.role_key, invitation.invited_by)
  on conflict (workspace_id, user_id) do update
    set status = 'active';

  update public.workspace_invitations
  set status = 'accepted', accepted_by = current_user_id, accepted_at = now()
  where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

create or replace function public.revoke_workspace_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.workspace_invitations where id = invitation_id;
  if target_workspace_id is null
    or not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Convite não encontrado ou sem permissão.';
  end if;

  update public.workspace_invitations
  set status = 'revoked'
  where id = invitation_id and status = 'pending';
end;
$$;

create or replace function public.update_workspace_member_role(target_workspace_id uuid, target_user_id uuid, new_role_key text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Somente o proprietário pode alterar papéis.';
  end if;
  if new_role_key not in ('teacher', 'finance') then
    raise exception 'Papel inválido.';
  end if;

  update public.workspace_members
  set role_key = new_role_key, updated_at = now()
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and role_key <> 'owner';

  if not found then raise exception 'Membro não encontrado ou não pode ser alterado.'; end if;
end;
$$;

create or replace function public.remove_workspace_member(target_workspace_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if not public.workspace_has_permission(target_workspace_id, 'workspace.manage') then
    raise exception 'Somente o proprietário pode remover membros.';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and role_key <> 'owner';

  if not found then raise exception 'Membro não encontrado ou não pode ser removido.'; end if;
end;
$$;

drop policy if exists workspace_plan_limits_admin on public.workspace_plan_limits;
create policy workspace_plan_limits_admin on public.workspace_plan_limits
for all to authenticated
using (public.workspace_is_app_admin())
with check (public.workspace_is_app_admin());

revoke all on public.workspace_roles, public.workspaces, public.workspace_members,
  public.workspace_settings, public.workspace_invitations, public.workspace_plan_limits
from anon, authenticated;

grant select on public.workspace_roles to authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, update on public.workspace_settings to authenticated;
grant select (id, workspace_id, email, role_key, status, expires_at, invited_by, accepted_by, created_at, accepted_at)
  on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.workspace_plan_limits to authenticated;

revoke all on function public.workspace_has_permission(uuid, text) from public, anon;
revoke all on function public.workspace_is_app_admin() from public, anon;
revoke all on function public.workspace_plan_limits_for_owner(uuid) from public, anon;
revoke all on function public.assign_workspace_id() from public, anon, authenticated;
revoke all on function public.guard_student_financial_changes() from public, anon, authenticated;
revoke all on function public.create_default_workspace_for_user() from public, anon, authenticated;
revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.list_my_workspaces() from public, anon;
revoke all on function public.list_workspace_members(uuid) from public, anon;
revoke all on function public.create_workspace_invitation(uuid, text, text) from public, anon;
revoke all on function public.accept_workspace_invitation(text) from public, anon;
revoke all on function public.revoke_workspace_invitation(uuid) from public, anon;
revoke all on function public.update_workspace_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon;

grant execute on function public.workspace_has_permission(uuid, text) to authenticated;
grant execute on function public.workspace_is_app_admin() to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

revoke all on function public.workspace_plan_limits_for_owner(uuid) from authenticated;

commit;

