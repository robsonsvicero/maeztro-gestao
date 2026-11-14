import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

const reply = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), { status, headers: corsHeaders })
);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'Método não permitido.' });

  const authorization = request.headers.get('authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const origin = request.headers.get('origin');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!token || !origin || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return reply(401, { error: 'Sessão inválida ou configuração incompleta.' });
  }

  let inviteUrl: URL;
  try {
    inviteUrl = new URL(origin);
    if (!['http:', 'https:'].includes(inviteUrl.protocol)) throw new Error('Invalid origin');
  } catch {
    return reply(400, { error: 'Origem do convite inválida.' });
  }

  let input: { workspace_id?: string; token?: string };
  try {
    input = await request.json();
  } catch {
    return reply(400, { error: 'Corpo da solicitação inválido.' });
  }
  if (!input.workspace_id || !input.token || !/^[a-f0-9]{64}$/i.test(input.token)) {
    return reply(400, { error: 'Dados do convite inválidos.' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return reply(401, { error: 'Sessão inválida.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const tokenHash = await sha256(input.token);
  const [{ data: workspace, error: workspaceError }, { data: member, error: memberError }, { data: invitation, error: invitationError }] = await Promise.all([
    admin.from('workspaces')
      .select('name, owner_id')
      .eq('id', input.workspace_id)
      .maybeSingle(),
    admin.from('workspace_members')
      .select('role_key, status')
      .eq('workspace_id', input.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    admin.from('workspace_invitations')
      .select('email, role_key, invited_by, status, expires_at')
      .eq('workspace_id', input.workspace_id)
      .eq('token_hash', tokenHash)
      .maybeSingle(),
  ]);

  if (workspaceError || memberError || invitationError) {
    console.error('Could not verify workspace invitation sender:', workspaceError || memberError || invitationError);
    return reply(500, { error: 'Não foi possível validar o convite.' });
  }
  if (
    !workspace
    || workspace.owner_id !== user.id
    || member?.role_key !== 'owner'
    || member.status !== 'active'
    || !invitation
    || invitation.invited_by !== user.id
    || invitation.status !== 'pending'
    || new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return reply(403, { error: 'Você não tem permissão para enviar este convite ou ele não está mais ativo.' });
  }
  if (!resendApiKey) return reply(500, { error: 'O serviço de e-mail não está configurado.' });

  inviteUrl.pathname = '/workspace-invite';
  inviteUrl.search = '';
  inviteUrl.hash = '';
  inviteUrl.searchParams.set('token', input.token);

  const workspaceName = escapeHtml(workspace.name || 'Estúdio MAEZTRO');
  const roleLabel = invitation.role_key === 'finance' ? 'Financeiro' : 'Professor';
  const safeInviteUrl = escapeHtml(inviteUrl.toString());
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#374151;line-height:1.6">',
    '<h1 style="color:#094C7E">Convite para o MAEZTRO Gestão</h1>',
    `<p>Você foi convidado para participar do workspace <strong>${workspaceName}</strong> como ${roleLabel}.</p>`,
    `<p><a href="${safeInviteUrl}" style="display:inline-block;background:#094C7E;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Aceitar convite</a></p>`,
    `<p>Este convite expira em 7 dias. Se o botão não funcionar, copie este link: ${safeInviteUrl}</p>`,
    '</div>',
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `MAEZTRO Gestão <${fromEmail}>`,
        to: [invitation.email],
        subject: 'Você recebeu um convite para o MAEZTRO Gestão',
        html,
        text: `Você foi convidado para participar do workspace ${workspace.name || 'Estúdio MAEZTRO'} como ${roleLabel}.\n\nAceite o convite neste link: ${inviteUrl.toString()}\n\nEste convite expira em 7 dias.`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend failed to send workspace invitation:', error);
      return reply(502, { error: 'O provedor de e-mail recusou o envio.' });
    }

    return reply(200, { success: true });
  } catch (error) {
    console.error('Unexpected workspace invitation email error:', error);
    return reply(502, { error: 'Não foi possível enviar o e-mail do convite.' });
  }
});
