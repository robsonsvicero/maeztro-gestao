/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AUTOMATION_TIME_ZONE, evaluateAutomationRule, getLocalDateParts } from '../_shared/automationLogic.js';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

const isMissingRelation = (error: { code?: string; status?: number }) => (
  error.code === '42P01'
  || error.code === 'PGRST205'
  || error.status === 404
);

async function listWorkspaceRows(
  admin: ReturnType<typeof createClient>,
  tableName: string,
  select: string,
  workspaceId: string,
  optional = false,
) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from(tableName)
      .select(select)
      .eq('workspace_id', workspaceId)
      .range(from, from + pageSize - 1);
    if (error) {
      if (optional && isMissingRelation(error)) {
        return { rows: [], unavailable: `A tabela public.${tableName} não existe.` };
      }
      throw new Error(`Falha ao consultar public.${tableName}: ${error.message}`);
    }
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return { rows, unavailable: null };
}

async function recordLog(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  ruleKey: string,
  dedupeKey: string,
  result: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await admin.from('automation_logs').upsert({
    workspace_id: workspaceId,
    rule_key: ruleKey,
    dedupe_key: dedupeKey,
    result,
    message,
    details,
  }, { onConflict: 'workspace_id,dedupe_key', ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao registrar log de automação: ${error.message}`);
}

async function updateRuleState(
  admin: ReturnType<typeof createClient>,
  ruleId: string,
  result: string,
  message: string,
) {
  const { error } = await admin.from('automation_rules').update({
    last_evaluated_at: new Date().toISOString(),
    last_result: result,
    last_message: message,
  }).eq('id', ruleId);
  if (error) throw new Error(`Falha ao atualizar estado da regra: ${error.message}`);
}

async function enqueueCandidate(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  candidate: Record<string, unknown>,
  members: Record<string, unknown>[],
  preferences: Record<string, unknown>[],
) {
  const ruleKey = String(candidate.rule_key);
  const ownerOnly = ruleKey.startsWith('finance.')
    || ruleKey.startsWith('crm.')
    || ['studio.weekly_finance_summary', 'studio.admin_pending'].includes(ruleKey);
  const eligibleMembers = members.filter((member) => (
    !ownerOnly || member.role_key === 'owner'
  ));
  const enabledUsers = eligibleMembers.filter((member) => (
    !preferences.some((preference) => (
      preference.user_id === member.user_id
      && preference.rule_key === ruleKey
      && preference.enabled === false
    ))
  ));
  const disabledUsers = eligibleMembers.filter((member) => !enabledUsers.includes(member));

  for (const member of disabledUsers) {
    await recordLog(
      admin,
      workspaceId,
      ruleKey,
      `${candidate.dedupe_key}:preference:${member.user_id}`,
      'skipped',
      'O usuário desativou esta automação nas preferências pessoais.',
      { user_id: member.user_id, candidate_key: candidate.dedupe_key },
    );
  }

  if (enabledUsers.length === 0) {
    if (eligibleMembers.length === 0) {
      await recordLog(
        admin,
        workspaceId,
        ruleKey,
        `${candidate.dedupe_key}:no-recipients`,
        'blocked',
        ruleKey.startsWith('crm.')
          ? 'Não há proprietário ativo para receber este aviso do CRM.'
          : ownerOnly
            ? 'Não há proprietário ativo para receber este aviso financeiro.'
          : 'Não há professores ou proprietários ativos para receber este aviso.',
      );
    }
    return 0;
  }

  const jobs = enabledUsers.map((member) => ({
    workspace_id: workspaceId,
    user_id: member.user_id,
    rule_key: ruleKey,
    dedupe_key: String(candidate.dedupe_key),
    payload: {
      title: candidate.title,
      body: candidate.body,
      severity: candidate.severity,
      entity_type: candidate.entity_type,
      entity_id: candidate.entity_id,
      details: candidate.details || {},
    },
  }));
  const { error } = await admin.from('automation_jobs').upsert(jobs, {
    onConflict: 'workspace_id,user_id,dedupe_key',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`Falha ao enfileirar automação: ${error.message}`);

  await recordLog(
    admin,
    workspaceId,
    ruleKey,
    `${candidate.dedupe_key}:queued`,
    'queued',
    String(candidate.title),
    {
      recipients: enabledUsers.length,
      entity_type: candidate.entity_type,
      entity_id: candidate.entity_id,
      ...((candidate.details || {}) as Record<string, unknown>),
    },
  );
  return enabledUsers.length;
}

async function loadWorkspaceContext(admin: ReturnType<typeof createClient>, workspaceId: string) {
  const [
    studentsResult,
    lessonsResult,
    transactionsResult,
    availabilityResult,
    membersResult,
    invitationsResult,
    quotesResult,
    serviceOrdersResult,
    crmLeadsResult,
  ] = await Promise.all([
    listWorkspaceRows(admin, 'student',
      'id,full_name,phone,instrument,lesson_day,lesson_time,student_status,student_state,payment_status,next_payment_date,payment_history',
      workspaceId),
    listWorkspaceRows(admin, 'lesson',
      'id,student_id,student_name,date,start_time,end_time,duration,status,attendance_status,teacher_user_id',
      workspaceId),
    listWorkspaceRows(admin, 'transaction', 'type,date,amount', workspaceId, true),
    listWorkspaceRows(admin, 'workspace_availability',
      'weekday,is_available,start_time,end_time', workspaceId),
    listWorkspaceRows(admin, 'workspace_members', 'user_id,role_key,status', workspaceId),
    listWorkspaceRows(admin, 'workspace_invitations', 'id,status', workspaceId, true),
    listWorkspaceRows(admin, 'quote', 'id,status', workspaceId, true),
    listWorkspaceRows(admin, 'service_order', 'id,status', workspaceId, true),
    listWorkspaceRows(admin, 'crm_leads', 'id,full_name,stage,next_follow_up_at', workspaceId, true),
  ]);
  const members = membersResult.rows.filter((member) => (
    member.status === 'active' && ['owner', 'teacher'].includes(String(member.role_key))
  ));
  let memberProfiles: Record<string, unknown>[] = [];
  if (members.length > 0) {
    const { data: profiles, error: profileError } = await admin.from('profiles')
      .select('id,full_name')
      .in('id', members.map((member) => String(member.user_id)));
    if (profileError) throw new Error(`Falha ao carregar nomes da equipe: ${profileError.message}`);
    memberProfiles = profiles || [];
  }
  const membersWithNames = members.map((member) => ({
    ...member,
    full_name: memberProfiles.find((profile) => profile.id === member.user_id)?.full_name || 'Professor',
  }));
  const pendingAdmin = {
    invitations: invitationsResult.rows.filter((invitation) => invitation.status === 'pending').length,
    quotes: quotesResult.rows.filter((quote) => quote.status === 'pending').length,
    serviceOrders: serviceOrdersResult.rows.filter((order) => (
      ['pending', 'in_progress'].includes(String(order.status))
    )).length,
  };
  const optionalWarnings = [
    transactionsResult.unavailable,
    invitationsResult.unavailable,
    quotesResult.unavailable,
    serviceOrdersResult.unavailable,
    crmLeadsResult.unavailable,
  ].filter(Boolean);

  return {
    students: studentsResult.rows,
    lessons: lessonsResult.rows,
    transactions: transactionsResult.rows,
    availability: availabilityResult.rows,
    members: membersWithNames,
    crmLeads: crmLeadsResult.rows,
    preferences: new Array<Record<string, unknown>>(),
    pendingAdmin,
    optionalWarnings,
    missingTransactions: Boolean(transactionsResult.unavailable),
    missingCrmLeads: Boolean(crmLeadsResult.unavailable),
  };
}

async function processJobs(admin: ReturnType<typeof createClient>, runId: string) {
  const { data: jobs, error: claimError } = await admin.rpc('claim_automation_jobs', { batch_size: 100 });
  if (claimError) throw new Error(`Falha ao reivindicar jobs: ${claimError.message}`);

  let delivered = 0;
  let failed = 0;
  for (const job of jobs || []) {
    try {
      const payload = job.payload || {};
      const { error: eventError } = await admin.from('automation_events').upsert({
        workspace_id: job.workspace_id,
        user_id: job.user_id,
        rule_key: job.rule_key,
        dedupe_key: job.dedupe_key,
        title: payload.title,
        body: payload.body,
        severity: payload.severity || 'info',
        entity_type: payload.entity_type || null,
        entity_id: payload.entity_id || null,
        details: payload.details || {},
      }, { onConflict: 'workspace_id,user_id,dedupe_key', ignoreDuplicates: true });
      if (eventError) throw eventError;

      const { error: updateError } = await admin.from('automation_jobs')
        .update({ status: 'completed', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      if (updateError) throw updateError;

      await recordLog(
        admin,
        job.workspace_id,
        job.rule_key,
        `job:${job.id}:delivered`,
        'delivered',
        'Aviso interno entregue na central de automações.',
        { job_id: job.id, run_id: runId, user_id: job.user_id },
      );
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = Number(job.attempts) >= 5;
      const retryAt = new Date(Date.now() + Math.min(60 * 60 * 1000 * (2 ** Number(job.attempts)), 24 * 60 * 60 * 1000));
      const { error: updateError } = await admin.from('automation_jobs')
        .update({
          status: exhausted ? 'failed' : 'pending',
          scheduled_for: retryAt.toISOString(),
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      if (updateError) throw new Error(`Falha ao atualizar job ${job.id}: ${updateError.message}`);
      if (exhausted) {
        await recordLog(
          admin,
          job.workspace_id,
          job.rule_key,
          `job:${job.id}:failed`,
          'failed',
          `O aviso não foi entregue após ${job.attempts} tentativas: ${message}`,
          { job_id: job.id, run_id: runId },
        );
        failed += 1;
      }
    }
  }
  return { claimed: (jobs || []).length, delivered, failed };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const expectedSecret = Deno.env.get('AUTOMATION_CRON_SECRET');
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return reply(401, { error: 'Unauthorized' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('Missing Supabase service configuration for automation worker.');
    return reply(500, { error: 'Automation worker is not configured.' });
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const runId = crypto.randomUUID();

  try {
    const { data: rules, error: rulesError } = await admin.from('automation_rules')
      .select('id,workspace_id,rule_key,category,enabled,config')
      .eq('enabled', true)
      .order('workspace_id')
      .order('category');
    if (rulesError) throw new Error(`Falha ao carregar regras: ${rulesError.message}`);

    const workspaceIds = [...new Set((rules || []).map((rule) => rule.workspace_id))];
    let queued = 0;
    let skipped = 0;
    let blocked = 0;
    let failedRules = 0;
    const timeZone = AUTOMATION_TIME_ZONE;
    const currentDate = getLocalDateParts(new Date(), timeZone).date;

    for (const workspaceId of workspaceIds) {
      const workspaceRules = (rules || []).filter((rule) => rule.workspace_id === workspaceId);
      let context: Awaited<ReturnType<typeof loadWorkspaceContext>>;
      try {
        context = await loadWorkspaceContext(admin, workspaceId);
        const { data: preferences, error: preferenceError } = await admin.from('notification_preferences')
          .select('user_id,rule_key,enabled')
          .eq('workspace_id', workspaceId);
        if (preferenceError) throw new Error(`Falha ao carregar preferências: ${preferenceError.message}`);
        context.preferences = preferences || [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Workspace ${workspaceId} automation scan failed:`, message);
        throw new Error(`Falha ao preparar automações do workspace ${workspaceId}: ${message}`);
      }

      for (const rule of workspaceRules) {
        try {
          if (rule.rule_key === 'crm.follow_up_due' && context.missingCrmLeads) {
            const reason = context.optionalWarnings.find((warning) => warning?.includes('crm_leads')) || 'Tabela public.crm_leads indisponível.';
            await recordLog(admin, workspaceId, rule.rule_key, `${rule.rule_key}:${currentDate}:blocked`, 'blocked', reason);
            await updateRuleState(admin, rule.id, 'blocked', reason);
            blocked += 1;
            continue;
          }

          if (rule.rule_key === 'studio.weekly_finance_summary' && context.missingTransactions) {
            const reason = context.optionalWarnings.find((warning) => warning?.includes('transaction')) || 'Tabela public.transaction indisponível.';
            await recordLog(admin, workspaceId, rule.rule_key, `${rule.rule_key}:${currentDate}:blocked`, 'blocked', reason);
            await updateRuleState(admin, rule.id, 'blocked', reason);
            blocked += 1;
            continue;
          }

          if (rule.rule_key === 'studio.admin_pending') {
            const missingAdminTables = context.optionalWarnings.filter((warning) => (
              warning?.includes('workspace_invitations')
              || warning?.includes('quote')
              || warning?.includes('service_order')
            ));
            if (missingAdminTables.length > 0) {
              const reason = `Não foi possível verificar todas as pendências administrativas: ${missingAdminTables.join(' ')}`;
              await recordLog(admin, workspaceId, rule.rule_key, `${rule.rule_key}:${currentDate}:blocked`, 'blocked', reason);
              await updateRuleState(admin, rule.id, 'blocked', reason);
              blocked += 1;
              continue;
            }
          }

          const evaluation = evaluateAutomationRule(rule, context, new Date(), timeZone);
          if (evaluation.candidates.length === 0) {
            const isOutsideSchedule = evaluation.skippedReason?.startsWith('Fora do dia');
            const isSetupBlock = evaluation.skippedReason?.startsWith('Configure os horários');
            const result = isSetupBlock ? 'blocked' : 'skipped';
            const message = evaluation.skippedReason || 'Nenhuma ação necessária nesta execução.';
            if (!isOutsideSchedule) {
              await recordLog(
                admin,
                workspaceId,
                rule.rule_key,
                `${rule.rule_key}:${currentDate}:${result}`,
                result,
                message,
                { optional_warnings: context.optionalWarnings },
              );
            }
            await updateRuleState(admin, rule.id, result, message);
            if (isSetupBlock) blocked += 1;
            else if (!isOutsideSchedule) skipped += 1;
            continue;
          }

          let ruleQueued = 0;
          for (const candidate of evaluation.candidates) {
            ruleQueued += await enqueueCandidate(
              admin,
              workspaceId,
              candidate,
              context.members,
              context.preferences,
            );
          }
          const message = `${evaluation.candidates.length} evento(s) enfileirado(s) para ${ruleQueued} destinatário(s).`;
          await updateRuleState(admin, rule.id, 'queued', message);
          queued += ruleQueued;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Automation rule ${rule.rule_key} failed:`, message);
          await recordLog(
            admin,
            workspaceId,
            rule.rule_key,
            `${rule.rule_key}:${currentDate}:failed`,
            'failed',
            message,
            { run_id: runId },
          );
          await updateRuleState(admin, rule.id, 'failed', message);
          failedRules += 1;
        }
      }
    }

    const jobSummary = await processJobs(admin, runId);
    return reply(200, {
      success: true,
      run_id: runId,
      workspaces: workspaceIds.length,
      queued,
      skipped,
      blocked,
      failed_rules: failedRules,
      jobs: jobSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Automation worker failed:', message);
    return reply(500, { error: message, run_id: runId });
  }
});
