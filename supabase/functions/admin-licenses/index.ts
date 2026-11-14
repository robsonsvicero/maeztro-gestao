import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) => {
  if (status >= 400) console.error(JSON.stringify({ status, ...body }));
  return new Response(JSON.stringify(body), { status, headers });
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!token || !url || !serviceRoleKey) return reply(401, { error: 'Unauthorized' });

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await userClient.auth.getUser(token);
  if (!user) return reply(401, { error: 'Invalid session' });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profile, error: profileLookupError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileLookupError) return reply(500, { error: 'Could not verify admin permissions' });
  if (profile?.role !== 'admin') return reply(403, { error: 'Admin access required' });

  let body: {
    action?: string;
    entitlementId?: string;
    email?: string;
    name?: string;
    phone?: string;
    userId?: string;
    accountType?: 'individual' | 'studio';
    status?: 'pending' | 'active' | 'grace_period' | 'on_hold' | 'canceled' | 'expired' | 'revoked';
    accessEndsAt?: string | null;
  } = {};
  try { body = await request.json(); } catch { /* empty body lists licenses */ }
  const now = new Date().toISOString();

  if (body.action === 'create_license') {
    const email = body.email?.trim().toLowerCase();
    if (!email) return reply(400, { error: 'E-mail é obrigatório.' });
    return reply(400, { error: 'Use admin-create-lifetime-license para criar licenças vitalícias.' });
  }

  if (body.action === 'update_account_type') {
    if (!body.userId) return reply(400, { error: 'Usuário obrigatório.' });
    if (!['individual', 'studio'].includes(body.accountType ?? '')) {
      return reply(400, { error: 'Tipo de conta inválido.' });
    }

    const { data: ownedWorkspaces, error: workspaceLookupError } = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', body.userId);
    if (workspaceLookupError) return reply(500, { error: 'Não foi possível localizar os workspaces da conta.' });
    if (!ownedWorkspaces?.length) return reply(404, { error: 'Nenhum workspace próprio foi encontrado para este usuário.' });

    const { error: workspaceUpdateError } = await admin
      .from('workspaces')
      .update({ account_type: body.accountType, updated_at: now })
      .eq('owner_id', body.userId);
    if (workspaceUpdateError) return reply(500, { error: 'Não foi possível atualizar o tipo de conta.' });

    return reply(200, { ok: true, account_type: body.accountType });
  }

  if (body.action === 'update_license' || body.action === 'revoke' || body.action === 'activate') {
    if (!body.entitlementId) return reply(400, { error: 'License id is required' });
    const status = body.action === 'revoke' ? 'revoked' : body.action === 'activate' ? 'active' : body.status;
    if (!status || !['pending', 'active', 'grace_period', 'on_hold', 'canceled', 'expired', 'revoked'].includes(status)) {
      return reply(400, { error: 'Status de licença inválido.' });
    }
    const update = {
      status,
      revoked_at: status === 'revoked' ? now : null,
      access_ends_at: body.accessEndsAt || null,
      updated_at: now,
    };
    const { error } = await admin.from('entitlements').update(update).eq('id', body.entitlementId);
    if (error) return reply(500, { error: error.message });
    return reply(200, { ok: true });
  }

  const [
    { data: entitlements, error: entitlementError },
    { data: profiles, error: profileError },
    { data: events, error: eventError },
    { data: workspaces, error: workspaceError },
  ] = await Promise.all([
    admin.from('entitlements').select('id, auth_user_id, email, access_type, provider, product_id, base_plan_id, status, access_starts_at, access_ends_at, auto_renewing, canceled_at, revoked_at, created_at, updated_at').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, email, full_name, role, legal_documents_version, legal_documents_accepted_at').order('email'),
    admin.from('subscription_events')
      .select('id, event_type, processing_status, processing_error, product_id, base_plan_id, created_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('workspaces').select('owner_id, account_type, is_default').order('is_default', { ascending: false }),
  ]);
  if (entitlementError || profileError || eventError || workspaceError) {
    return reply(500, { error: entitlementError?.message ?? profileError?.message ?? eventError?.message ?? workspaceError?.message });
  }

  // A existência da conta não significa que o professor já criou a senha ou
  // entrou no sistema. last_sign_in_at é atualizado pelo Supabase Auth quando
  // ele conclui seu primeiro acesso (incluindo o fluxo de convite/recuperação).
  const authUsersById = new Map<string, {
    last_sign_in_at?: string | null;
    email?: string;
    full_name?: string;
    account_type?: string;
  }>();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error: authUsersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (authUsersError) return reply(500, { error: 'Não foi possível consultar o status de primeiro acesso.' });
    for (const authUser of data.users) {
      authUsersById.set(authUser.id, {
        last_sign_in_at: authUser.last_sign_in_at,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name,
        account_type: authUser.user_metadata?.account_type,
      });
    }
    if (data.users.length < 1000) break;
  }

  const entitlementsByUser = new Map();
  const entitlementsByEmail = new Map();
  const accountTypeByUser = new Map();
  for (const workspace of workspaces ?? []) {
    if (!accountTypeByUser.has(workspace.owner_id)) {
      accountTypeByUser.set(workspace.owner_id, workspace.account_type);
    }
  }
  for (const entitlement of entitlements ?? []) {
    const entries = entitlementsByUser.get(entitlement.auth_user_id) ?? [];
    entries.push(entitlement);
    entitlementsByUser.set(entitlement.auth_user_id, entries);
    if (entitlement.email) {
      const email = entitlement.email.trim().toLowerCase();
      const emailEntries = entitlementsByEmail.get(email) ?? [];
      emailEntries.push(entitlement);
      entitlementsByEmail.set(email, emailEntries);
    }
  }
  const customers = (profiles ?? []).map((profile) => {
    const byId = entitlementsByUser.get(profile.id) ?? [];
    const byEmail = profile.email ? entitlementsByEmail.get(profile.email.trim().toLowerCase()) ?? [] : [];
    const merged = [...byId, ...byEmail.filter((entitlement) => !byId.some((item) => item.id === entitlement.id))];
    return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    auth_user_id: profile.id,
    account_type: accountTypeByUser.get(profile.id) ?? 'individual',
    first_access_completed: Boolean(authUsersById.get(profile.id)?.last_sign_in_at),
    first_access_at: authUsersById.get(profile.id)?.last_sign_in_at ?? null,
    legal_documents_version: profile.legal_documents_version,
    legal_documents_accepted_at: profile.legal_documents_accepted_at,
    entitlements: merged,
    };
  });

  const knownCustomerIds = new Set(customers.map((customer) => customer.auth_user_id));
  for (const [authUserId, authUser] of authUsersById) {
    if (knownCustomerIds.has(authUserId)) continue;

    const byId = entitlementsByUser.get(authUserId) ?? [];
    const byEmail = authUser.email ? entitlementsByEmail.get(authUser.email.trim().toLowerCase()) ?? [] : [];
    const merged = [...byId, ...byEmail.filter((entitlement) => !byId.some((item) => item.id === entitlement.id))];
    customers.push({
      id: authUserId,
      email: authUser.email ?? null,
      name: authUser.full_name ?? null,
      auth_user_id: authUserId,
      account_type: accountTypeByUser.get(authUserId) ?? authUser.account_type ?? 'individual',
      first_access_completed: Boolean(authUser.last_sign_in_at),
      first_access_at: authUser.last_sign_in_at ?? null,
      legal_documents_version: null,
      legal_documents_accepted_at: null,
      entitlements: merged,
    });
  }

  const knownEntitlementIds = new Set(customers.flatMap((customer) => customer.entitlements.map((entitlement) => entitlement.id)));
  for (const entitlement of entitlements ?? []) {
    if (!knownEntitlementIds.has(entitlement.id)) {
      customers.push({
        id: entitlement.id,
        email: entitlement.email,
        name: null,
        auth_user_id: entitlement.auth_user_id,
        account_type: accountTypeByUser.get(entitlement.auth_user_id) ?? 'individual',
        first_access_completed: Boolean(authUsersById.get(entitlement.auth_user_id)?.last_sign_in_at),
        first_access_at: authUsersById.get(entitlement.auth_user_id)?.last_sign_in_at ?? null,
        legal_documents_version: null,
        legal_documents_accepted_at: null,
        entitlements: [entitlement],
      });
    }
  }

  return reply(200, { customers, events: events ?? [], products: [] });
});
