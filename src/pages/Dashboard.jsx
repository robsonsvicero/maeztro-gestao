import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Info,
  Plus,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseLocalDate } from '@/utils/dateUtils';
import { useAuth } from '@/lib/AuthContext';
import { studentService } from '@/modules/students/services/studentService';
import { lessonService } from '@/modules/lessons/services/lessonService';
import { transactionService } from '@/modules/finance/services/financeService';
import { appSettingsService } from '@/modules/settings/services/settingsService';
import { crmContactService, crmLeadService, crmTrialService } from '@/modules/crm/services/crmService';
import { automationService } from '@/modules/automations/automationService';
import { availabilityService } from '@/modules/availability/services/availabilityService';
import { getDashboardIntelligence, normalizePersonalAvailability } from '@/modules/intelligence/dashboardMetrics';
import StatCard from '../components/dashboard/StatCard';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import MonthlyChart from '../components/dashboard/MonthlyChart';

const FORECAST_DAYS = 15;
const currency = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const displayDate = (value) => {
  if (!value) return 'Sem data';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

function DashboardSection({ title, description, actionHref, actionLabel, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
        </div>
        {actionHref && (
          <Link
            to={createPageUrl(actionHref)}
            className="text-sm font-medium text-[#094C7E] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-300"
          >
            {actionLabel}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function SummaryMeasure({ label, value, detail, icon: Icon }) {
  return (
    <div className="min-w-0 border-b border-slate-200 py-4 first:pt-0 last:border-0 dark:border-slate-700 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-0 sm:last:pr-0">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Icon className="h-4 w-4 shrink-0 text-[#094C7E] dark:text-blue-300" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{detail}</p>
    </div>
  );
}

function InsightRow({ title, detail, status, href }) {
  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {status && <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{status}</span>}
        {href && (
          <Link
            to={createPageUrl(href)}
            className="text-sm font-medium text-[#094C7E] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-300"
          >
            Abrir
          </Link>
        )}
      </div>
    </li>
  );
}

export default function Dashboard() {
  const { activeWorkspaceId, accountType } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const currentMonth = now;

  const transactionsQuery = useQuery({
    queryKey: ['transactions', activeWorkspaceId],
    queryFn: () => transactionService.list('-date'),
    enabled: Boolean(activeWorkspaceId),
  });
  const studentsQuery = useQuery({
    queryKey: ['students', activeWorkspaceId, 'intelligence'],
    queryFn: () => studentService.listForIntelligence(),
    enabled: Boolean(activeWorkspaceId),
  });
  const lessonsQuery = useQuery({
    queryKey: ['lessons', activeWorkspaceId],
    queryFn: () => lessonService.list('-date'),
    enabled: Boolean(activeWorkspaceId),
  });
  const leadsQuery = useQuery({
    queryKey: ['crm', activeWorkspaceId],
    queryFn: () => crmLeadService.list(),
    enabled: Boolean(activeWorkspaceId),
  });
  const contactLeadIdsQuery = useQuery({
    queryKey: ['crmContactLeadIds', activeWorkspaceId],
    queryFn: () => crmContactService.listLeadIdsWithContacts(),
    enabled: Boolean(activeWorkspaceId),
  });
  const trialsQuery = useQuery({
    queryKey: ['crmTrials', activeWorkspaceId],
    queryFn: () => crmTrialService.list(),
    enabled: Boolean(activeWorkspaceId),
  });
  const studioAvailabilityQuery = useQuery({
    queryKey: ['studioAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listStudio(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });
  const teacherAvailabilityQuery = useQuery({
    queryKey: ['teacherAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listTeachers(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });
  const appSettingsQuery = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appSettingsService.list(),
    enabled: Boolean(activeWorkspaceId && accountType === 'individual'),
  });
  const teachersQuery = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId),
  });

  const dashboardQueries = [
    { label: 'alunos e previsão de encerramento', query: studentsQuery },
    { label: 'aulas', query: lessonsQuery },
    { label: 'financeiro', query: transactionsQuery },
    { label: 'interessados do CRM', query: leadsQuery },
    { label: 'histórico de contatos', query: contactLeadIdsQuery },
    { label: 'aulas experimentais', query: trialsQuery },
    ...(accountType === 'studio'
      ? [
        { label: 'horários do estúdio', query: studioAvailabilityQuery },
        { label: 'horários dos professores', query: teacherAvailabilityQuery },
      ]
      : [{ label: 'horários do professor', query: appSettingsQuery }]),
    { label: 'equipe de professores', query: teachersQuery },
  ];
  const isLoading = dashboardQueries.some(({ query }) => query.isLoading);
  const errors = dashboardQueries.filter(({ query }) => query.error);
  const students = studentsQuery.data || [];
  const lessons = lessonsQuery.data || [];
  const leads = leadsQuery.data || [];
  const transactions = transactionsQuery.data || [];
  const availability = useMemo(() => (
    accountType === 'studio'
      ? studioAvailabilityQuery.data || []
      : normalizePersonalAvailability(appSettingsQuery.data?.[0]?.available_hours)
  ), [accountType, studioAvailabilityQuery.data, appSettingsQuery.data]);

  const intelligence = useMemo(() => getDashboardIntelligence({
    students,
    lessons,
    leads,
    trials: trialsQuery.data || [],
    contactLeadIds: contactLeadIdsQuery.data || [],
    availability,
    teacherSchedules: teacherAvailabilityQuery.data || [],
    teachers: teachersQuery.data || [],
    accountType,
    now,
    horizonDays: FORECAST_DAYS,
  }), [
    students,
    lessons,
    leads,
    trialsQuery.data,
    contactLeadIdsQuery.data,
    availability,
    teacherAvailabilityQuery.data,
    teachersQuery.data,
    accountType,
    now,
  ]);

  const monthTransactions = transactions.filter((transaction) => {
    const date = parseLocalDate(transaction.date);
    return date >= startOfMonth(currentMonth) && date <= endOfMonth(currentMonth);
  });
  const income = (list) => list
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const expenses = (list) => list
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const monthIncome = income(monthTransactions);
  const monthExpenses = expenses(monthTransactions);
  const monthBalance = monthIncome - monthExpenses;
  const activeStudents = students.filter(
    (student) => student.student_status !== 'inactive' && student.student_state !== 'archived',
  );

  const attentionItems = [
    ...intelligence.pendingCharges
      .filter((charge) => (
        charge.status === 'overdue'
        || charge.date === intelligence.startDate
        || (charge.weekStart <= intelligence.startDate && charge.weekEnd >= intelligence.startDate)
      ))
      .map((charge) => ({
        key: charge.key,
        title: charge.studentName,
        detail: charge.weekStart
          ? `${charge.status === 'overdue' ? 'Cobrança semanal em atraso' : 'Cobrança semanal em aberto'} · semana de ${displayDate(charge.weekStart)}`
          : `${charge.label} · ${charge.status === 'overdue' ? `em atraso desde ${displayDate(charge.date)}` : 'vence hoje'}`,
        status: currency(charge.amount),
        href: 'Students',
        priority: charge.status === 'overdue' ? 0 : 1,
      })),
    ...intelligence.followUpsDue.map((lead) => ({
      key: `follow-up:${lead.id}`,
      title: lead.full_name,
      detail: 'Retorno agendado para hoje ou em atraso',
      status: 'CRM',
      href: 'CRM',
      priority: 2,
    })),
    ...intelligence.leadsWithoutContact.map((lead) => ({
      key: `no-contact:${lead.id}`,
      title: lead.full_name,
      detail: 'Interessado sem contato registrado',
      status: 'CRM',
      href: 'CRM',
      priority: 3,
    })),
    ...intelligence.endingStudents.map((student) => ({
      key: `ending:${student.id}`,
      title: student.name,
      detail: `Previsão de encerramento em ${displayDate(student.date)}`,
      status: 'Aluno',
      href: 'Students',
      priority: 4,
    })),
  ].sort((left, right) => left.priority - right.priority);

  const queryKeys = [
    ['transactions', activeWorkspaceId],
    ['students', activeWorkspaceId, 'intelligence'],
    ['lessons', activeWorkspaceId],
    ['crm', activeWorkspaceId],
    ['crmContactLeadIds', activeWorkspaceId],
    ['crmTrials', activeWorkspaceId],
    ...(accountType === 'studio'
      ? [['studioAvailability', activeWorkspaceId], ['teacherAvailability', activeWorkspaceId]]
      : [['appSettings']]),
    ['workspaceTeachers', activeWorkspaceId],
  ];
  const refresh = () => {
    setNow(new Date());
    queryKeys.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };
  const missingIntelligenceMigration = errors.some(({ query }) => {
    const message = String(query.error?.message);
    return (
      (['42703', 'PGRST204'].includes(query.error?.code) && message.includes('expected_end_date'))
      || (['42P01', 'PGRST205'].includes(query.error?.code) && message.includes('crm_contacted_lead_ids'))
    );
  });

  return (
    <main className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Inteligência de Gestão</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Decisões operacionais com dados do estúdio · próximos {FORECAST_DAYS} dias
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Link to={createPageUrl('Finances')}>
            <Button className="bg-[#094C7E] text-white hover:bg-[#073d65]">
              <Plus className="mr-2 h-4 w-4" />
              Nova transação
            </Button>
          </Link>
        </div>
      </header>

      {errors.length > 0 ? (
        <section role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <h2 className="font-semibold">Não foi possível carregar todos os indicadores</h2>
              <p className="text-sm">
                {missingIntelligenceMigration
                  ? 'A estrutura de inteligência ainda não foi aplicada. Revise e execute supabase/intelligence.sql no Supabase.'
                  : 'Corrija o erro informado e atualize o Dashboard; os indicadores incompletos não serão apresentados como zero.'}
              </p>
              <ul className="list-inside list-disc text-sm">
                {errors.map(({ label, query }) => (
                  <li key={label}>{label}: {query.error.message}</li>
                ))}
              </ul>
              <Button type="button" size="sm" variant="outline" onClick={refresh}>
                Tentar novamente
              </Button>
            </div>
          </div>
        </section>
      ) : isLoading ? (
        <div aria-label="Carregando inteligência de gestão" className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ) : (
        <>
          <section aria-label="Resumo operacional" className="rounded-xl border border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              <SummaryMeasure
                label="Atenção hoje"
                value={attentionItems.length}
                detail={attentionItems.length === 1 ? 'item que pede ação' : 'itens que pedem ação'}
                icon={AlertTriangle}
              />
              <SummaryMeasure
                label="Cobranças pendentes"
                value={intelligence.pendingChargeCount}
                detail={currency(intelligence.pendingChargeAmount)}
                icon={Wallet}
              />
              <SummaryMeasure
                label={`Previsão em ${FORECAST_DAYS} dias`}
                value={currency(intelligence.forecastAmount)}
                detail={`${intelligence.forecastCharges.length} cobranças estimadas`}
                icon={ArrowUpRight}
              />
              <SummaryMeasure
                label={`Horas de aula marcadas · ${FORECAST_DAYS} dias`}
                value={`${intelligence.occupiedHours} h`}
                detail={`${intelligence.occupiedAppointmentCount} aulas e experimentais`}
                icon={Clock3}
              />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <DashboardSection
              title="Quem precisa de atenção hoje?"
              description="Cobranças atrasadas ou para hoje, retornos, interessados sem contato e encerramentos próximos."
            >
              {attentionItems.length === 0 ? (
                <p className="py-4 text-sm text-slate-600 dark:text-slate-300">Nenhuma ação urgente identificada para hoje.</p>
              ) : (
                <ul>
                  {attentionItems.slice(0, 7).map((item) => (
                    <InsightRow key={item.key} title={item.title} detail={item.detail} status={item.status} href={item.href} />
                  ))}
                </ul>
              )}
              {attentionItems.length > 7 && (
                <p className="pt-3 text-sm text-slate-600 dark:text-slate-300">
                  Mais {attentionItems.length - 7} itens também precisam de atenção.
                </p>
              )}
            </DashboardSection>

            <DashboardSection
              title="Cobranças pendentes"
              description={`Vencidas ou com vencimento nos próximos ${FORECAST_DAYS} dias.`}
              actionHref="Students"
              actionLabel="Abrir alunos"
            >
              {intelligence.pendingCharges.length === 0 ? (
                <p className="py-4 text-sm text-slate-600 dark:text-slate-300">Nenhuma cobrança em aberto neste período.</p>
              ) : (
                <ul>
                  {intelligence.pendingCharges.slice(0, 6).map((charge) => (
                    <InsightRow
                      key={charge.key}
                      title={charge.studentName}
                      detail={`${charge.label} · ${charge.weekStart ? `semana de ${displayDate(charge.weekStart)}` : `vencimento ${displayDate(charge.date)}`}`}
                      status={currency(charge.amount)}
                      href="Students"
                    />
                  ))}
                </ul>
              )}
            </DashboardSection>

            <DashboardSection
              title="Previsão de recebimentos"
              description={`Cobranças estimadas para os próximos ${FORECAST_DAYS} dias; não é uma garantia de pagamento.`}
              actionHref="Finances"
              actionLabel="Ver finanças"
            >
              <p className="mb-3 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">
                {currency(intelligence.forecastAmount)}
              </p>
              {intelligence.forecastCharges.length === 0 ? (
                <p className="py-3 text-sm text-slate-600 dark:text-slate-300">Nenhum recebimento previsto com os dados atuais.</p>
              ) : (
                <ul>
                  {intelligence.forecastCharges.slice(0, 6).map((charge) => (
                    <InsightRow
                      key={charge.key}
                      title={charge.studentName}
                      detail={`${charge.label} · ${charge.weekStart ? `semana de ${displayDate(charge.weekStart)}` : displayDate(charge.date)}`}
                      status={currency(charge.amount)}
                      href="Students"
                    />
                  ))}
                </ul>
              )}
            </DashboardSection>

            <DashboardSection
              title="Ocupação e disponibilidade"
              description={`Aulas marcadas e estimativa de horários livres nos próximos ${FORECAST_DAYS} dias.`}
              actionHref={accountType === 'studio' ? 'Automations' : 'Settings'}
              actionLabel={accountType === 'studio' ? 'Configurar equipe' : 'Configurar horários'}
            >
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{accountType === 'studio'
                  ? 'A estimativa combina o funcionamento do estúdio com os horários individuais e os compromissos de cada professor.'
                  : 'A estimativa usa os horários configurados pelo professor em Configurações e considera os compromissos deste professor.'}</p>
              </div>
              {!intelligence.teacherAvailability.configured ? (
                <p className="py-3 text-sm text-slate-600 dark:text-slate-300">
                  {accountType === 'studio'
                    ? 'Configure o funcionamento na página Estúdio e a disponibilidade dos professores em Automações.'
                    : 'Configure seus horários disponíveis em Configurações para estimar a disponibilidade.'}
                </p>
              ) : intelligence.teacherAvailability.availableTeachers.length === 0 ? (
                <p className="py-3 text-sm text-slate-600 dark:text-slate-300">Nenhum professor tem horário livre nesta grade e período.</p>
              ) : (
                <ul>
                  {intelligence.teacherAvailability.availableTeachers.map((teacher) => (
                    <InsightRow
                      key={teacher.userId}
                      title={teacher.name}
                      detail={teacher.nextSlot
                        ? `Próximo intervalo livre: ${displayDate(teacher.nextSlot.date)}, ${teacher.nextSlot.startTime}–${teacher.nextSlot.endTime}`
                        : 'Sem intervalo livre identificado'}
                      status={`${teacher.availableHours} h livres`}
                    />
                  ))}
                </ul>
              )}
            </DashboardSection>

            <DashboardSection
              title="Interessados sem retorno"
              description="Pessoas com cadastro aberto e nenhum contato registrado no histórico."
              actionHref="CRM"
              actionLabel="Abrir CRM"
            >
              {intelligence.leadsWithoutContact.length === 0 ? (
                <p className="py-4 text-sm text-slate-600 dark:text-slate-300">Todos os interessados abertos têm ao menos um contato registrado.</p>
              ) : (
                <ul>
                  {intelligence.leadsWithoutContact.slice(0, 6).map((lead) => (
                    <InsightRow
                      key={lead.id}
                      title={lead.full_name}
                      detail={lead.instrument ? `Interesse em ${lead.instrument}` : 'Ainda sem contato registrado'}
                      status={lead.stage}
                      href="CRM"
                    />
                  ))}
                </ul>
              )}
            </DashboardSection>

            <DashboardSection
              title="Alunos próximos de encerrar"
              description={`Data prevista dentro dos próximos ${FORECAST_DAYS} dias.`}
              actionHref="Students"
              actionLabel="Ver alunos"
            >
              {intelligence.endingStudents.length === 0 ? (
                <p className="py-4 text-sm text-slate-600 dark:text-slate-300">Nenhum encerramento previsto neste período.</p>
              ) : (
                <ul>
                  {intelligence.endingStudents.slice(0, 6).map((student) => (
                    <InsightRow
                      key={student.id}
                      title={student.name}
                      detail={`Previsão de encerramento: ${displayDate(student.date)}`}
                      status="Acompanhar"
                      href="Students"
                    />
                  ))}
                </ul>
              )}
            </DashboardSection>
          </div>
        </>
      )}

      {errors.length > 0 ? null : isLoading ? (
        <div aria-label="Carregando resumo financeiro" className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ) : (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Resumo financeiro do mês</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
              <StatCard
                title="Receita do Mês"
                value={currency(monthIncome)}
                icon={ArrowUpRight}
                iconColor="text-green-600"
                bgGradient="from-green-50 to-emerald-50"
                trend={`${monthTransactions.filter((transaction) => transaction.type === 'income').length} entradas`}
              />
              <StatCard
                title="Despesas do Mês"
                value={currency(monthExpenses)}
                icon={ArrowDownRight}
                iconColor="text-red-600"
                bgGradient="from-red-50 to-rose-50"
                trend={`${monthTransactions.filter((transaction) => transaction.type === 'expense').length} saídas`}
              />
              <StatCard
                title="Saldo do Mês"
                value={currency(monthBalance)}
                icon={Wallet}
                iconColor="text-[#094C7E]"
                bgGradient="from-blue-50 to-cyan-50"
                trend={monthBalance >= 0 ? 'Positivo' : 'Negativo'}
              />
              <StatCard
                title="Alunos Ativos"
                value={activeStudents.length}
                icon={Users}
                iconColor="text-[#094C7E]"
                bgGradient="from-slate-50 to-slate-100"
                trend="Total cadastrados"
              />
            </div>
          </section>

          <MonthlyChart transactions={monthTransactions} />
          <RecentTransactions transactions={transactions.slice(0, 5)} isLoading={false} />
        </>
      )}
    </main>
  );
}
