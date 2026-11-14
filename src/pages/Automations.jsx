import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Clock3, History, LoaderCircle, Settings2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { automationService } from '@/modules/automations/automationService';
import { AUTOMATION_CATEGORIES, AUTOMATION_RULES, WEEKDAYS } from '@/modules/automations/automationCatalog';

const initialAvailability = WEEKDAYS.map(({ value }) => ({
  weekday: value,
  is_available: false,
  start_time: '08:00',
  end_time: '20:00',
}));

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

function AvailabilitySettings({ rows, isLoading, isSaving, onSave }) {
  const [draft, setDraft] = useState(initialAvailability);

  useEffect(() => {
    if (!rows) return;
    setDraft(initialAvailability.map((day) => {
      const saved = rows.find((row) => row.weekday === day.weekday);
      return saved ? {
        ...day,
        ...saved,
        start_time: saved.start_time?.slice(0, 5) || day.start_time,
        end_time: saved.end_time?.slice(0, 5) || day.end_time,
      } : day;
    }));
  }, [rows]);

  const updateDay = (weekday, updates) => setDraft((current) => current.map((day) => (
    day.weekday === weekday ? { ...day, ...updates } : day
  )));

  const handleSave = () => {
    const invalidDay = draft.find((day) => (
      day.is_available
      && (!day.start_time || !day.end_time || day.start_time >= day.end_time)
    ));
    if (invalidDay) {
      toast.error('Confira os horários de abertura e fechamento de cada dia.');
      return;
    }
    onSave(draft);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5" />
          Horários disponíveis do estúdio
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Usados para calcular a ocupação semanal. A agenda não será alterada automaticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando horários cadastrados...</p>}
        {draft.map((day) => {
          const label = WEEKDAYS.find((item) => item.value === day.weekday)?.label;
          return (
            <div key={day.weekday} className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_1fr_1fr]">
              <Label className="font-medium">{label}</Label>
              <div className="flex items-center gap-2">
                <Switch
                  aria-label={`${label} disponível`}
                  checked={day.is_available}
                  onCheckedChange={(is_available) => updateDay(day.weekday, { is_available })}
                />
                <span className="text-sm text-muted-foreground">{day.is_available ? 'Aberto' : 'Fechado'}</span>
              </div>
              <Input
                type="time"
                aria-label={`${label}: abre às`}
                disabled={!day.is_available}
                value={day.start_time}
                onChange={(event) => updateDay(day.weekday, { start_time: event.target.value })}
              />
              <Input
                type="time"
                aria-label={`${label}: fecha às`}
                disabled={!day.is_available}
                value={day.end_time}
                onChange={(event) => updateDay(day.weekday, { end_time: event.target.value })}
              />
            </div>
          );
        })}
        <div className="flex justify-end pt-2">
          <Button type="button" disabled={isLoading || isSaving} onClick={handleSave}>
            {isSaving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Salvar horários
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const availabilityQuery = useQuery({
    queryKey: ['workspaceAvailability', activeWorkspaceId],
    queryFn: () => automationService.listAvailability(),
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
  const availabilityMutation = useMutation({
    mutationFn: (rows) => automationService.saveAvailability(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaceAvailability', activeWorkspaceId] });
      toast.success('Horários do estúdio salvos.');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível salvar os horários.'),
  });

  const rules = rulesQuery.data || [];
  const preferences = preferencesQuery.data || [];
  const rulesLoading = rulesQuery.isLoading;
  const mutationPending = updateRuleMutation.isPending || preferenceMutation.isPending;
  const pageError = rulesQuery.error || preferencesQuery.error || eventsQuery.error
    || logsQuery.error || jobsQuery.error || availabilityQuery.error;

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
            <AvailabilitySettings
              rows={availabilityQuery.data}
              isLoading={availabilityQuery.isLoading}
              isSaving={availabilityMutation.isPending}
              onSave={(rows) => availabilityMutation.mutate(rows)}
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
