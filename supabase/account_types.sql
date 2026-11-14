-- Commercial account categories and their workspace permissions.
-- Run after workspaces.sql.
begin;

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regclass('public.workspace_members') is null
    or to_regclass('public.workspace_invitations') is null then
    raise exception 'Execute supabase/workspaces.sql antes de account_types.sql.';
  end if;
end;
$$;

alter table public.workspaces
  add column if not exists account_type text not null default 'individual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspaces_account_type_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_account_type_check
      check (account_type in ('individual', 'studio'));
  end if;
end;
$$;

create or replace function public.prevent_workspace_account_type_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.account_type is distinct from old.account_type
    and coalesce(auth.role(), '') <> 'service_role'
    and not public.workspace_is_app_admin() then
    raise exception 'Somente o administrador pode alterar o tipo da conta.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_workspace_account_type_change on public.workspaces;
create trigger prevent_workspace_account_type_change
before update of account_type on public.workspaces
for each row execute function public.prevent_workspace_account_type_change();

create or replace function public.inherit_owner_account_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  owner_account_type text;
begin
  if not new.is_default then
    select workspace.account_type
    into owner_account_type
    from public.workspaces workspace
    where workspace.owner_id = new.owner_id
      and workspace.is_default
    limit 1;

    if owner_account_type is not null then
      new.account_type := owner_account_type;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inherit_owner_account_type on public.workspaces;
create trigger inherit_owner_account_type
before insert on public.workspaces
for each row execute function public.inherit_owner_account_type();

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
  account_type text;
begin
  workspace_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Meu estúdio'
  );
  account_type := case
    when new.raw_user_meta_data ->> 'account_type' = 'studio' then 'studio'
    else 'individual'
  end;

  insert into public.workspaces (name, owner_id, is_default, account_type)
  values (workspace_name, new.id, true, account_type)
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

create or replace function public.workspace_plan_limits_for_owner(target_owner_id uuid)
returns table(max_workspaces integer, max_members integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  owner_account_type text;
  entitlement_provider text;
  entitlement_product_id text;
  entitlement_base_plan_id text;
  configured_max_workspaces integer;
  configured_max_members integer;
begin
  select workspace.account_type
  into owner_account_type
  from public.workspaces workspace
  where workspace.owner_id = target_owner_id
    and workspace.is_default;

  if coalesce(owner_account_type, 'individual') = 'individual' then
    return query select 1, 1;
    return;
  end if;

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
    return query select 1, 10;
    return;
  end if;

  select limits.max_workspaces, limits.max_members
  into configured_max_workspaces, configured_max_members
  from public.workspace_plan_limits limits
  where limits.provider = entitlement_provider
    and limits.product_id = entitlement_product_id
    and limits.base_plan_id = entitlement_base_plan_id;

  if configured_max_workspaces is null or configured_max_members is null then
    return query select 1, 10;
  else
    return query select configured_max_workspaces, least(configured_max_members, 10);
  end if;
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
  invitation_workspace_id uuid;
  workspace_owner_id uuid;
  maximum_members integer;
  reserved_seats bigint;
  pending_seats bigint;
begin
  if current_user_id is null then raise exception 'Entre com a sua conta para aceitar o convite.'; end if;
  if invite_token is null or length(invite_token) < 32 then raise exception 'O link de convite é inválido.'; end if;
  if current_email = '' then
    select lower(email) into current_email from auth.users where id = current_user_id;
  end if;

  select workspace_id into invitation_workspace_id
  from public.workspace_invitations
  where token_hash = encode(digest(invite_token, 'sha256'), 'hex');

  if invitation_workspace_id is null then raise exception 'O convite não existe ou já foi removido.'; end if;

  select owner_id into workspace_owner_id
  from public.workspaces
  where id = invitation_workspace_id;
  if workspace_owner_id is null then raise exception 'O workspace do convite não está disponível.'; end if;

  perform 1 from auth.users where id = workspace_owner_id for update;

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

  select limits.max_members
  into maximum_members
  from public.workspace_plan_limits_for_owner(workspace_owner_id) limits;

  select count(distinct member.user_id)
  into reserved_seats
  from public.workspace_members member
  join public.workspaces workspace on workspace.id = member.workspace_id
  where workspace.owner_id = workspace_owner_id
    and member.status = 'active';

  select count(distinct pending_invitation.email)
  into pending_seats
  from public.workspace_invitations pending_invitation
  join public.workspaces workspace on workspace.id = pending_invitation.workspace_id
  where workspace.owner_id = workspace_owner_id
    and pending_invitation.status = 'pending'
    and pending_invitation.expires_at > now()
    and not exists (
      select 1
      from public.workspace_members active_member
      join public.workspaces active_workspace on active_workspace.id = active_member.workspace_id
      join auth.users active_user on active_user.id = active_member.user_id
      where active_workspace.owner_id = workspace_owner_id
        and active_member.status = 'active'
        and lower(active_user.email) = pending_invitation.email
    );

  reserved_seats := reserved_seats + pending_seats;

  if reserved_seats > maximum_members then
    raise exception 'O limite de membros foi atingido. Peça ao proprietário para ajustar o plano ou remover convites pendentes.';
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

drop function if exists public.list_my_workspaces();
create function public.list_my_workspaces()
returns table(
  workspace_id uuid,
  workspace_name text,
  owner_id uuid,
  role_key text,
  created_at timestamptz,
  account_type text
)
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select workspace.id, workspace.name, workspace.owner_id, member.role_key,
    workspace.created_at, workspace.account_type
  from public.workspace_members member
  join public.workspaces workspace on workspace.id = member.workspace_id
  where member.user_id = auth.uid() and member.status = 'active'
  order by workspace.is_default desc, workspace.created_at;
$$;

revoke update on public.workspaces from authenticated;
grant update (name, updated_at) on public.workspaces to authenticated;

revoke all on function public.prevent_workspace_account_type_change() from public, anon, authenticated;
revoke all on function public.inherit_owner_account_type() from public, anon, authenticated;
revoke all on function public.create_default_workspace_for_user() from public, anon, authenticated;
revoke all on function public.workspace_plan_limits_for_owner(uuid) from public, anon, authenticated;
revoke all on function public.list_my_workspaces() from public, anon;
grant update (account_type) on public.workspaces to service_role;
grant execute on function public.list_my_workspaces() to authenticated;

commit;
