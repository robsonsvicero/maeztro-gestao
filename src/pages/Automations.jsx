import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Clock3, History, Settings2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AvailabilityEditor from '@/components/availability/AvailabilityEditor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { automationService } from '@/modules/automations/automationService';
import { AUTOMATION_CATEGORIES, AUTOMATION_RULES, WEEKDAYS } from '@/modules/automations/automationCatalog';
import { availabilityService } from '@/modules/availability/services/availabilityService';

const resultLabels = {
  queued: 'Na fila',
  delivered: 'Entregue',
  skipped: 'Ignorada',
  failed: 'Falhou',
  blocked: 'Bloqueada',
};

const severityStyles = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Ainda não executada';

const getRuleDefinition = (key) => AUTOMATION_RULES.find((rule) => rule.key === key);

function RuleCard({
  rule,
  preferenceEnabled,
  isUpdating,
  onToggleRule,
  onTogglePreference,
  onSaveConfig,
}) {
  const definition = getRuleDefinition(rule.rule_key);
  const [configDraft, setConfigDraft] = useState(rule.config || {});

  useEffect(() => {
    setConfigDraft(rule.config || {});
  }, [rule.config]);

  if (!definition) return null;

  const saveConfig = () => {
    const invalidField = definition.fields.find((field) => {
      const value = Number(configDraft[field.key]);
      return !Number.isFinite(value) || value < field.min || value > field.max;
    });
    if (invalidField) {
      toast.error(`${invalidField.label}: informe um valor entre ${invalidField.min} e ${invalidField.max}.`);
      return;
    }

    const config = Object.fromEntries(
      Object.entries(configDraft).map(([key, value]) => [
        key,
        key === 'required_fields' ? value : Number(value),
      ]),
    );
    onSaveConfig(rule, config);
  };

  const configChanged = JSON.stringify(configDraft) !== JSON.stringify(rule.config || {});

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">{definition.label}</CardTitle>
            <p className="text-sm text-muted-foreground">{definition.description}</p>
          </div>
          <Switch
            aria-label={`Ativar ${definition.label}`}
            checked={rule.enabled}
            disabled={isUpdating}
            onCheckedChange={(enabled) => onToggleRule(rule, enabled)}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={rule.enabled ? 'default' : 'secondary'}>
            {rule.enabled ? 'Ativa' : 'Pausada'}
          </Badge>
          {rule.last_result && (
            <Badge variant="outline">{resultLabels[rule.last_result] || rule.last_result}</Badge>
          )}
          <span className="self-center text-muted-foreground">
            Última verificação: {formatDateTime(rule.last_evaluated_at)}
          </span>
        </div>
        {rule.last_message && (
          <p className="text-xs text-muted-foreground">{rule.last_message}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {definition.fields?.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {definition.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`${rule.id}-${field.key}`} className="text-xs">
                  {field.label}
                </Label>
                {field.key === 'weekday' ? (
                  <Select
                    value={String(configDraft[field.key] ?? 1)}
                    onValueChange={(value) => setConfigDraft((current) => ({ ...current, [field.key]: Number(value) }))}
                  >
                    <SelectTrigger id={`${rule.id}-${field.key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day) => (
                        <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`${rule.id}-${field.key}`}
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={configDraft[field.key] ?? ''}
                    onChange={(event) => setConfigDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={preferenceEnabled}
              disabled={isUpdating}
              onCheckedChange={(enabled) => onTogglePreference(rule.rule_key, enabled)}
            />
            Receber este aviso no meu painel
          </label>
          {definition.fields?.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!configChanged || isUpdating}
              onClick={saveConfig}
            >
              Salvar critérios
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TeacherAvailabilitySettings({ teachers, rows, isLoading, isDisabled, savingUserId, onSave }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Disponibilidade dos professores</h2>
        <p className="text-sm text-muted-foreground">
          Cada agenda é individual; os horários do estúdio continuam sendo definidos na página Estúdio.
        </p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando disponibilidade da equipe...</p>
        : teachers.length === 0 ? <Card><CardContent className="p-5 text-sm text-muted-foreground">
          Não há professores ativos para configurar.
        </CardContent></Card>
          : teachers.map((teacher) => (
            <AvailabilityEditor
              key={teacher.user_id}
              title={teacher.role_key === 'owner' ? `${teacher.full_name} (proprietário)` : teacher.full_name}
              description="Esses horários determinam quando este professor pode receber agendamentos."
              rows={rows.filter((row) => row.teacher_user_id === teacher.user_id)}
              idPrefix={`teacher-hours-${teacher.user_id}`}
              isDisabled={isDisabled}
              isSaving={savingUserId === teacher.user_id}
              onSave={(teacherRows) => onSave(teacher.user_id, teacherRows)}
            />
          ))}
    </section>
  );
}

function EventsList({ events, isLoading, onMarkRead, onMarkAllRead, isUpdating }) {
  const unreadCount = events.filter((event) => !event.read_at).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" />
          Avisos do painel
        </CardTitle>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" disabled={isUpdating} onClick={onMarkAllRead}>
            <Check className="mr-2 h-4 w-4" />
            Marcar todos como lidos
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando avisos...</p>
          : events.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aviso foi gerado ainda.</p>
            : <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className={`rounded-lg border p-4 ${event.read_at ? 'opacity-70' : 'bg-muted/30'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{event.title}</h3>
                        <Badge className={severityStyles[event.severity] || severityStyles.info}>
                          {event.severity === 'warning' ? 'Atenção' : event.severity === 'critical' ? 'Urgente' : 'Informação'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.body}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                    </div>
                    {!event.read_at && (
                      <Button variant="ghost" size="sm" disabled={isUpdating} onClick={() => onMarkRead(event.id)}>
                        Marcar como lido
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>}
      </CardContent>
    </Card>
  );
}

export default function Automations() {
  const { activeWorkspaceId, accountType, userId } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('rules');
  const rulesKey = ['automationRules', activeWorkspaceId];

  const rulesQuery = useQuery({
    queryKey: rulesKey,
    queryFn: () => automationService.listRules(),
    enabled: Boolean(activeWorkspaceId),
  });
  const preferencesQuery = useQuery({
    queryKey: ['automationPreferences', activeWorkspaceId, userId],
    queryFn: () => automationService.listPreferences(userId),
    enabled: Boolean(activeWorkspaceId && userId),
  });
  const eventsQuery = useQuery({
    queryKey: ['automationEvents', activeWorkspaceId],
    queryFn: () => automationService.listEvents(),
    enabled: Boolean(activeWorkspaceId),
  });
  const logsQuery = useQuery({
    queryKey: ['automationLogs', activeWorkspaceId],
    queryFn: () => automationService.listLogs(),
    enabled: Boolean(activeWorkspaceId),
  });
  const jobsQuery = useQuery({
    queryKey: ['automationJobs', activeWorkspaceId],
    queryFn: () => automationService.listJobs(),
    enabled: Boolean(activeWorkspaceId),
  });
  const teachersQuery = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });
  const teacherAvailabilityQuery = useQuery({
    queryKey: ['teacherAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listTeachers(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });

  const refreshAutomationData = () => {
    queryClient.invalidateQueries({ queryKey: rulesKey });
    queryClient.invalidateQueries({ queryKey: ['automationEvents', activeWorkspaceId] });
    queryClient.invalidateQueries({ queryKey: ['automationLogs', activeWorkspaceId] });
    queryClient.invalidateQueries({ queryKey: ['automationJobs', activeWorkspaceId] });
  };

  const updateRuleMutation = useMutation({
    mutationFn: ({ rule, changes }) => automationService.updateRule(rule.id, changes),
    onSuccess: refreshAutomationData,
    onError: (error) => toast.error(error?.message || 'Não foi possível salvar a automação.'),
  });
  const preferenceMutation = useMutation({
    mutationFn: ({ ruleKey, enabled }) => automationService.setPreference(userId, ruleKey, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationPreferences', activeWorkspaceId, userId] }),
    onError: (error) => toast.error(error?.message || 'Não foi possível salvar sua preferência.'),
  });
  const markReadMutation = useMutation({
    mutationFn: (eventId) => automationService.markEventRead(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationEvents', activeWorkspaceId] }),
    onError: (error) => toast.error(error?.message || 'Não foi possível marcar o aviso como lido.'),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => automationService.markAllEventsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationEvents', activeWorkspaceId] }),
    onError: (error) => toast.error(error?.message || 'Não foi possível atualizar os avisos.'),
  });
  const teacherAvailabilityMutation = useMutation({
    mutationFn: ({ teacherUserId, rows }) => (
      availabilityService.saveTeacher(activeWorkspaceId, teacherUserId, rows)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacherAvailability', activeWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardIntelligence', activeWorkspaceId] });
      toast.success('Disponibilidade do professor salva.');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível salvar a disponibilidade.'),
  });

  const rules = rulesQuery.data || [];
  const preferences = preferencesQuery.data || [];
  const rulesLoading = rulesQuery.isLoading;
  const mutationPending = updateRuleMutation.isPending || preferenceMutation.isPending;
  const pageError = rulesQuery.error || preferencesQuery.error || eventsQuery.error
    || logsQuery.error || jobsQuery.error || teachersQuery.error || teacherAvailabilityQuery.error;

  return (
    <main className="space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
          <Workflow className="h-8 w-8 text-[#094C7E]" />
          Automações
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Configure os alertas internos do workspace, acompanhe os avisos e consulte o motivo de ações ignoradas ou bloqueadas.
          Nesta fase, as automações não enviam mensagens a alunos nem por e-mail ou WhatsApp.
        </p>
      </header>

      {pageError && (
        <Card className="border-red-300">
          <CardContent className="p-4 text-sm text-red-700">
            Não foi possível carregar as automações: {pageError.message}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="rules"><Settings2 className="mr-2 h-4 w-4" />Regras</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-2 h-4 w-4" />Histórico</TabsTrigger>
          <TabsTrigger value="queue"><Clock3 className="mr-2 h-4 w-4" />Fila</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-6 space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Regras por área</h2>
              <p className="text-sm text-muted-foreground">
                A regra controla o workspace; a preferência individual controla se você recebe o aviso.
              </p>
            </div>
            {rulesLoading ? <p className="text-sm text-muted-foreground">Carregando regras...</p>
              : rules.length === 0 ? <Card><CardContent className="p-5 text-sm text-muted-foreground">
                Nenhuma regra encontrada. Aplique primeiro a migration `automations.sql`.
              </CardContent></Card>
                : AUTOMATION_CATEGORIES.map((category) => {
                  const categoryRules = rules.filter((rule) => rule.category === category.key);
                  if (categoryRules.length === 0) return null;
                  return (
                    <section key={category.key} className="space-y-3">
                      <h3 className="text-lg font-semibold">{category.label}</h3>
                      {categoryRules.map((rule) => (
                        <RuleCard
                          key={rule.id}
                          rule={rule}
                          preferenceEnabled={preferences.find((item) => item.rule_key === rule.rule_key)?.enabled !== false}
                          isUpdating={mutationPending}
                          onToggleRule={(targetRule, enabled) => updateRuleMutation.mutate({
                            rule: targetRule,
                            changes: { enabled },
                          })}
                          onTogglePreference={(ruleKey, enabled) => preferenceMutation.mutate({ ruleKey, enabled })}
                          onSaveConfig={(targetRule, config) => updateRuleMutation.mutate({
                            rule: targetRule,
                            changes: { config },
                          })}
                        />
                      ))}
                    </section>
                  );
                })}
          </section>

          {accountType === 'studio' && (
            <TeacherAvailabilitySettings
              teachers={teachersQuery.data || []}
              rows={teacherAvailabilityQuery.data || []}
              isLoading={teachersQuery.isLoading || teacherAvailabilityQuery.isLoading}
              isDisabled={Boolean(teachersQuery.error || teacherAvailabilityQuery.error)}
              savingUserId={teacherAvailabilityMutation.isPending
                ? teacherAvailabilityMutation.variables?.teacherUserId
                : null}
              onSave={(teacherUserId, rows) => teacherAvailabilityMutation.mutate({ teacherUserId, rows })}
            />
          )}

          <EventsList
            events={eventsQuery.data || []}
            isLoading={eventsQuery.isLoading}
            isUpdating={markReadMutation.isPending || markAllReadMutation.isPending}
            onMarkRead={(eventId) => markReadMutation.mutate(eventId)}
            onMarkAllRead={() => markAllReadMutation.mutate()}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Histórico de execuções</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {logsQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico...</p>
                : (logsQuery.data || []).length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há execuções registradas.</p>
                  : logsQuery.data.map((log) => (
                    <div key={log.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{getRuleDefinition(log.rule_key)?.label || log.rule_key}</p>
                        <p className="text-sm text-muted-foreground">{log.message}</p>
                        {Object.keys(log.details || {}).length > 0 && (
                          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={log.result === 'failed' || log.result === 'blocked' ? 'destructive' : 'outline'}>
                          {resultLabels[log.result] || log.result}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                      </div>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Fila de ações internas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {jobsQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando fila...</p>
                : (jobsQuery.data || []).length === 0 ? <p className="text-sm text-muted-foreground">A fila está vazia.</p>
                  : jobsQuery.data.map((job) => (
                    <div key={job.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{getRuleDefinition(job.rule_key)?.label || job.rule_key}</p>
                        <p className="text-xs text-muted-foreground">
                          Tentativas: {job.attempts} · Agendada: {formatDateTime(job.scheduled_for)}
                        </p>
                        {job.last_error && <p className="mt-1 text-sm text-red-700">{job.last_error}</p>}
                      </div>
                      <Badge variant={job.status === 'failed' ? 'destructive' : 'outline'}>{resultLabels[job.status] || job.status}</Badge>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
