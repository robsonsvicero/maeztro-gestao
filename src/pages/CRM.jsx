import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { automationService } from '@/modules/automations/automationService';
import { availabilityService } from '@/modules/availability/services/availabilityService';
import { slotFitsAvailability } from '@/modules/availability/availabilityUtils';
import {
  CRM_CONTACT_CHANNELS,
  CRM_SOURCES,
  CRM_STAGES,
  CRM_TRIAL_STATUSES,
} from '@/modules/crm/crmCatalog';
import { getCrmMetrics } from '@/modules/crm/crmMetrics';
import {
  convertCrmLead,
  crmContactService,
  crmLeadService,
  crmTrialService,
} from '@/modules/crm/services/crmService';
import { createPageUrl } from '@/utils';

const crmQueryKey = (workspaceId) => ['crm', workspaceId];
const scheduleTrialsQueryKey = (workspaceId) => ['crmScheduleTrials', workspaceId];
const contactsQueryKey = (leadId) => ['crmLeadContacts', leadId];

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const localDateTime = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const toIsoDateTime = (value) => value ? new Date(value).toISOString() : null;

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Sem data';

const formatDate = (value) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'medium' })
  : '';

const formatTime = (value) => value?.slice(0, 5) || '';

const stageLabel = (stage) => CRM_STAGES.find((item) => item.key === stage)?.label || stage;

function LeadForm({ lead, isSaving, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({
    full_name: lead?.full_name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    source: lead?.source || 'Outro',
    instrument: lead?.instrument || '',
    availability: lead?.availability || '',
    notes: lead?.notes || '',
  }));

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const sourceOptions = form.source && !CRM_SOURCES.includes(form.source)
    ? [form.source, ...CRM_SOURCES]
    : CRM_SOURCES;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      source: form.source.trim() || 'Outro',
      instrument: form.instrument.trim() || null,
      availability: form.availability.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-name">Nome *</Label>
          <Input id="lead-name" autoFocus required maxLength={160} value={form.full_name} onChange={(event) => update('full_name', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-phone">Telefone</Label>
          <Input id="lead-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-email">E-mail</Label>
          <Input id="lead-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-source">Origem do contato</Label>
          <Select value={form.source} onValueChange={(value) => update('source', value)}>
            <SelectTrigger id="lead-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sourceOptions.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-instrument">Instrumento de interesse</Label>
          <Input id="lead-instrument" maxLength={120} value={form.instrument} onChange={(event) => update('instrument', event.target.value)} placeholder="Ex.: piano" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-availability">Disponibilidade de horários</Label>
          <Textarea id="lead-availability" value={form.availability} onChange={(event) => update('availability', event.target.value)} rows={2} placeholder="Dias e períodos que funcionam melhor" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lead-notes">Observações</Label>
          <Textarea id="lead-notes" value={form.notes} onChange={(event) => update('notes', event.target.value)} rows={3} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isSaving || !form.full_name.trim()}>
          {isSaving ? 'Salvando...' : lead ? 'Salvar alterações' : 'Cadastrar interessado'}
        </Button>
      </div>
    </form>
  );
}

function ContactForm({ leadId, isSaving, onSave }) {
  const [channel, setChannel] = useState('whatsapp');
  const [summary, setSummary] = useState('');
  const [contactAt, setContactAt] = useState(() => localDateTime());
  const [followUpAt, setFollowUpAt] = useState('');

  const submit = (event) => {
    event.preventDefault();
    onSave({
      leadId,
      contact: {
        channel,
        summary: summary.trim(),
        contact_at: toIsoDateTime(contactAt),
        follow_up_at: toIsoDateTime(followUpAt),
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Registrar contato</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-channel">Canal</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger id="contact-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CRM_CONTACT_CHANNELS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-at">Quando</Label>
          <Input id="contact-at" type="datetime-local" value={contactAt} onChange={(event) => setContactAt(event.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-summary">Resumo da conversa</Label>
        <Textarea id="contact-summary" value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} maxLength={2000} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-follow-up">Lembrar de retornar em</Label>
        <Input id="contact-follow-up" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSaving || !summary.trim()}>
          {isSaving ? 'Registrando...' : 'Salvar contato'}
        </Button>
      </div>
    </form>
  );
}

function TrialForm({
  leadId,
  teachers,
  teachersError,
  isSaving,
  onSchedule,
  accountType,
  studioAvailability,
  teacherAvailability,
  availabilityLoading,
  availabilityQueryError,
}) {
  const [date, setDate] = useState(() => localDate());
  const [startTime, setStartTime] = useState('15:00');
  const [endTime, setEndTime] = useState('16:00');
  const [teacherUserId, setTeacherUserId] = useState('none');
  const [availabilityError, setAvailabilityError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    setAvailabilityError('');
    if (accountType === 'studio') {
      if (availabilityQueryError) {
        setAvailabilityError(`Não foi possível carregar os horários: ${availabilityQueryError.message}`);
        return;
      }
      if (availabilityLoading) {
        setAvailabilityError('Aguarde o carregamento dos horários antes de agendar.');
        return;
      }
      if (teacherUserId === 'none') {
        setAvailabilityError('Selecione o professor responsável pela aula experimental.');
        return;
      }
      const slot = {
        weekday: new Date(`${date}T12:00:00`).getDay(),
        start_time: startTime,
        end_time: endTime,
      };
      if (!slotFitsAvailability(slot, studioAvailability)) {
        setAvailabilityError('O horário precisa estar dentro do funcionamento do estúdio.');
        return;
      }
      if (!slotFitsAvailability(slot, teacherAvailability.filter((row) => (
        row.teacher_user_id === teacherUserId
      )))) {
        setAvailabilityError('O horário está fora da disponibilidade do professor selecionado.');
        return;
      }
    }

    onSchedule({
      leadId,
      date,
      startTime,
      endTime,
      teacherUserId: teacherUserId === 'none' ? null : teacherUserId,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-[#094C7E] dark:text-blue-300" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Agendar aula experimental</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="trial-date">Data</Label>
          <Input id="trial-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trial-start">Início</Label>
          <Input id="trial-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trial-end">Término</Label>
          <Input id="trial-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="trial-teacher">Professor responsável</Label>
          <Select value={teacherUserId} onValueChange={setTeacherUserId}>
            <SelectTrigger id="trial-teacher"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Definir depois</SelectItem>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.user_id} value={teacher.user_id}>{teacher.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {teachersError && (
        <p role="alert" className="text-sm text-red-800 dark:text-red-200">
          {accountType === 'studio'
            ? 'Não foi possível carregar a equipe. Recarregue o CRM antes de agendar.'
            : 'Não foi possível carregar a equipe. Você pode agendar sem designar um professor e definir depois.'}
        </p>
      )}
      {availabilityQueryError && (
        <p role="alert" className="text-sm text-red-800 dark:text-red-200">
          Não foi possível carregar os horários: {availabilityQueryError.message}
        </p>
      )}
      {availabilityError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{availabilityError}</p>}
      {startTime >= endTime && <p className="text-sm text-red-700 dark:text-red-300">O horário de término deve ser posterior ao início.</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSaving || startTime >= endTime}>
          {isSaving ? 'Agendando...' : 'Confirmar experimental'}
        </Button>
      </div>
    </form>
  );
}

function LeadDetails({
  lead,
  contacts,
  linkedTrials,
  trials,
  teachers,
  isLoadingContacts,
  contactsError,
  onRetryContacts,
  teachersError,
  isSavingContact,
  isSchedulingTrial,
  isUpdatingTrial,
  isUpdatingLead,
  isConverting,
  accountType,
  studioAvailability,
  teacherAvailability,
  availabilityLoading,
  availabilityQueryError,
  onAddContact,
  onScheduleTrial,
  onUpdateTrial,
  onUpdateLead,
  onConvert,
  onEdit,
}) {
  const [stage, setStage] = useState(lead.stage);
  const [lossReason, setLossReason] = useState(lead.loss_reason || '');
  const [showTrialForm, setShowTrialForm] = useState(false);

  useEffect(() => {
    setStage(lead.stage);
    setLossReason(lead.loss_reason || '');
  }, [lead.id, lead.stage, lead.loss_reason]);

  const trialsById = new Map(trials.map((trial) => [trial.id, trial]));
  const leadTrials = linkedTrials
    .map((link) => trialsById.get(link.trial_id))
    .filter(Boolean)
    .sort((left, right) => `${right.trial_date} ${right.start_time}`.localeCompare(`${left.trial_date} ${left.start_time}`));

  const saveStage = () => {
    if (stage === 'not_converted' && !lossReason.trim()) {
      toast.error('Registre o motivo para acompanhar uma nova tentativa no futuro.');
      return;
    }
    onUpdateLead(lead.id, { stage, loss_reason: stage === 'not_converted' ? lossReason.trim() : null });
  };

  return (
    <div className="space-y-6 pb-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{stageLabel(lead.stage)}</Badge>
          <Badge variant="secondary">{lead.source || 'Origem não informada'}</Badge>
        </div>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{lead.full_name}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          {lead.phone && <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={`tel:${lead.phone}`}><Phone className="h-4 w-4" />{lead.phone}</a>}
          {lead.email && <a className="underline-offset-4 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
          {lead.instrument && <span>{lead.instrument}</span>}
        </div>
        {lead.availability && <p className="text-sm text-slate-600 dark:text-slate-300">Disponibilidade: {lead.availability}</p>}
        {lead.notes && <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{lead.notes}</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(lead)}>Editar cadastro</Button>
      </section>

      {lead.stage !== 'enrolled' && (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Etapa do funil</h3>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger aria-label="Etapa do interessado"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRM_STAGES.filter((item) => item.key !== 'enrolled').map((item) => (
                  <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={saveStage} disabled={isUpdatingLead || stage === lead.stage && (stage !== 'not_converted' || lossReason === (lead.loss_reason || ''))}>
              Salvar etapa
            </Button>
          </div>
          {stage === 'not_converted' && (
            <div className="space-y-1.5">
              <Label htmlFor="lead-loss-reason">Motivo e oportunidade de novo contato *</Label>
              <Textarea id="lead-loss-reason" value={lossReason} onChange={(event) => setLossReason(event.target.value)} rows={2} required />
            </div>
          )}
        </section>
      )}

      {lead.stage !== 'enrolled' && (
        <section className="flex flex-col gap-3 rounded-xl bg-[#094C7E]/5 p-4 dark:bg-blue-950/30">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Converter em aluno</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              O sistema confere o telefone antes de vincular ou criar o cadastro.
            </p>
          </div>
          {(!lead.phone || !lead.instrument) && (
            <p className="text-sm text-amber-800 dark:text-amber-200">Informe telefone e instrumento no cadastro antes de converter.</p>
          )}
          <div>
            <Button type="button" onClick={() => onConvert(lead)} disabled={isConverting || !lead.phone || !lead.instrument}>
              <ArrowRight className="mr-2 h-4 w-4" />{isConverting ? 'Verificando cadastro...' : 'Converter em aluno'}
            </Button>
          </div>
        </section>
      )}

      {lead.stage === 'enrolled' && (
        <section className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <Check className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Matrícula registrada</p>
            <p>Vinculado ao cadastro de aluno em {formatDateTime(lead.enrolled_at)}.</p>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Aulas experimentais</h3>
          {lead.stage !== 'enrolled' && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowTrialForm((open) => !open)}>
              <CalendarDays className="mr-2 h-4 w-4" />{showTrialForm ? 'Fechar' : 'Agendar'}
            </Button>
          )}
        </div>
        {showTrialForm && (
          <TrialForm
            leadId={lead.id}
            teachers={teachers}
            teachersError={teachersError}
            accountType={accountType}
            studioAvailability={studioAvailability}
            teacherAvailability={teacherAvailability}
            availabilityLoading={availabilityLoading}
            availabilityQueryError={availabilityQueryError}
            isSaving={isSchedulingTrial}
            onSchedule={(payload) => onScheduleTrial(payload, () => setShowTrialForm(false))}
          />
        )}
        {leadTrials.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhuma aula experimental cadastrada.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {leadTrials.map((trial) => (
              <li key={trial.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {formatDate(trial.trial_date)} · {formatTime(trial.start_time)}–{formatTime(trial.end_time)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {CRM_TRIAL_STATUSES.find((status) => status.key === trial.status)?.label || trial.status}
                  </p>
                </div>
                {trial.status === 'scheduled' && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={isUpdatingTrial} onClick={() => onUpdateTrial(trial.id, 'completed')}>
                      <Check className="mr-1 h-4 w-4" />Realizada
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={isUpdatingTrial} onClick={() => onUpdateTrial(trial.id, 'cancelled')}>Cancelar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#094C7E] dark:text-blue-300" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Histórico de contatos</h3>
        </div>
        <ContactForm leadId={lead.id} isSaving={isSavingContact} onSave={onAddContact} />
        {isLoadingContacts ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Carregando histórico...</p>
        ) : contactsError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            <p>Não foi possível carregar o histórico: {contactsError.message}</p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRetryContacts}>Tentar novamente</Button>
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Ainda não há contatos registrados.</p>
        ) : (
          <ol className="divide-y divide-slate-200 dark:divide-slate-700">
            {contacts.map((contact) => (
              <li key={contact.id} className="py-3">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {CRM_CONTACT_CHANNELS.find((item) => item.key === contact.channel)?.label || contact.channel}
                  <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{formatDateTime(contact.contact_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{contact.summary}</p>
                {contact.follow_up_at && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                    <BellRing className="h-3.5 w-3.5" />Retorno: {formatDateTime(contact.follow_up_at)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function CRM() {
  const { activeWorkspaceId, workspaceRole, accountType } = useAuth();
  const queryClient = useQueryClient();
  const [activeStage, setActiveStage] = useState('new_lead');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sheetMode, setSheetMode] = useState(null);
  const [activeLead, setActiveLead] = useState(null);
  const [conversionMatches, setConversionMatches] = useState(null);

  const crmQuery = useQuery({
    queryKey: crmQueryKey(activeWorkspaceId),
    queryFn: async () => {
      const [leads, trials, leadTrials] = await Promise.all([
        crmLeadService.list('-created_at'),
        crmTrialService.list(),
        crmTrialService.listLeadLinks(),
      ]);
      return { leads, trials, leadTrials };
    },
    enabled: Boolean(activeWorkspaceId && workspaceRole === 'owner'),
  });

  const teachersQuery = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId && workspaceRole === 'owner'),
  });
  const studioAvailabilityQuery = useQuery({
    queryKey: ['studioAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listStudio(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && workspaceRole === 'owner' && accountType === 'studio'),
  });
  const teacherAvailabilityQuery = useQuery({
    queryKey: ['teacherAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listTeachers(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && workspaceRole === 'owner' && accountType === 'studio'),
  });

  const contactsQuery = useQuery({
    queryKey: contactsQueryKey(activeLead?.id),
    queryFn: () => crmContactService.list(activeLead.id),
    enabled: Boolean(activeLead?.id && sheetMode === 'view'),
  });

  const leads = crmQuery.data?.leads || [];
  const trials = crmQuery.data?.trials || [];
  const leadTrials = crmQuery.data?.leadTrials || [];
  const metrics = useMemo(() => getCrmMetrics(leads, trials, leadTrials), [leads, trials, leadTrials]);

  const invalidateCrm = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmQueryKey(activeWorkspaceId) }),
      queryClient.invalidateQueries({ queryKey: scheduleTrialsQueryKey(activeWorkspaceId) }),
    ]);
  };

  const createLeadMutation = useMutation({
    mutationFn: (payload) => crmLeadService.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmQueryKey(activeWorkspaceId) });
      toast.success('Interessado cadastrado.');
      setSheetMode(null);
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível cadastrar o interessado.'),
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ leadId, changes }) => crmLeadService.update(leadId, changes),
    onSuccess: async (updatedLead) => {
      setActiveLead(updatedLead);
      await queryClient.invalidateQueries({ queryKey: crmQueryKey(activeWorkspaceId) });
      toast.success('Cadastro atualizado.');
      setSheetMode('view');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível atualizar o interessado.'),
  });

  const addContactMutation = useMutation({
    mutationFn: ({ leadId, contact }) => crmContactService.create(leadId, contact),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: contactsQueryKey(activeLead?.id) }),
        queryClient.invalidateQueries({ queryKey: crmQueryKey(activeWorkspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['crmContactLeadIds', activeWorkspaceId] }),
      ]);
      toast.success('Contato registrado e retorno atualizado.');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível registrar o contato.'),
  });

  const scheduleTrialMutation = useMutation({
    mutationFn: (payload) => crmTrialService.schedule(payload),
    onSuccess: async () => {
      await invalidateCrm();
      toast.success('Aula experimental agendada.');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível agendar a aula experimental.'),
  });

  const updateTrialMutation = useMutation({
    mutationFn: ({ trialId, status }) => crmTrialService.update(trialId, { status }),
    onSuccess: async () => {
      await invalidateCrm();
      toast.success('Status da aula experimental atualizado.');
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível atualizar a aula experimental.'),
  });

  const conversionMutation = useMutation({
    mutationFn: ({ leadId, studentId, createNewDespiteMatches }) => convertCrmLead(
      leadId,
      studentId,
      createNewDespiteMatches,
    ),
    onSuccess: async (result, variables) => {
      if (result?.status === 'created' || result?.status === 'linked' || result?.status === 'already_converted') {
        await queryClient.invalidateQueries({ queryKey: crmQueryKey(activeWorkspaceId) });
        await queryClient.invalidateQueries({ queryKey: ['students'] });
        setActiveLead((current) => current?.id === variables.leadId ? {
          ...current,
          stage: 'enrolled',
          enrolled_student_id: result.student_id,
          enrolled_at: current.enrolled_at || new Date().toISOString(),
        } : current);
        toast.success(result.status === 'linked' ? 'Interessado vinculado ao aluno existente.' : 'Interessado convertido em aluno.');
        setConversionMatches(null);
      } else if (result?.status === 'student_already_linked') {
        toast.error('Este cadastro de aluno já está vinculado a outro interessado.');
      }
    },
    onError: (error) => toast.error(error?.message || 'Não foi possível converter o interessado.'),
  });

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return leads.filter((lead) => {
      if (lead.stage !== activeStage) return false;
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
      if (!query) return true;
      return [lead.full_name, lead.phone, lead.email, lead.instrument]
        .some((value) => value?.toLocaleLowerCase('pt-BR').includes(query));
    });
  }, [activeStage, leads, search, sourceFilter]);
  const availableSources = useMemo(
    () => [...new Set(leads.map((lead) => lead.source).filter(Boolean))].sort(),
    [leads],
  );

  const upcomingFollowUps = useMemo(() => leads
    .filter((lead) => lead.stage !== 'enrolled' && lead.next_follow_up_at)
    .sort((left, right) => new Date(left.next_follow_up_at) - new Date(right.next_follow_up_at))
    .slice(0, 6), [leads]);

  const openNewLead = () => {
    setActiveLead(null);
    setSheetMode('create');
  };

  const openLead = (lead) => {
    setActiveLead(lead);
    setSheetMode('view');
  };

  const handleSaveLead = (payload) => {
    if (sheetMode === 'edit' && activeLead) {
      updateLeadMutation.mutate({ leadId: activeLead.id, changes: payload });
    } else {
      createLeadMutation.mutate(payload);
    }
  };

  const requestConversion = (lead) => {
    conversionMutation.mutate({ leadId: lead.id }, {
      onSuccess: (result) => {
        if (result?.status === 'matches_required') {
          setConversionMatches({ lead, students: result.matches || [] });
        }
      },
    });
  };

  if (workspaceRole !== 'owner') {
    return (
      <main className="p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">CRM</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">O CRM está disponível apenas para o proprietário do estúdio.</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 pb-8 md:p-8">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">CRM</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Acompanhe cada conversa até a matrícula. As informações dos interessados são privadas.
          </p>
        </div>
        <Button onClick={openNewLead} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />Novo interessado
        </Button>
      </header>

      <section aria-label="Resumo do funil" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="font-semibold text-slate-900 dark:text-slate-100">{metrics.interested} interessados</p>
        <p className="text-slate-600 dark:text-slate-300">{metrics.completedTrials} fizeram aula experimental</p>
        <p className="text-slate-600 dark:text-slate-300">{metrics.enrolled} matrículas</p>
        <Link to={createPageUrl('Automations')} className="ml-auto inline-flex items-center gap-1 font-medium text-[#094C7E] underline-offset-4 hover:underline dark:text-blue-300">
          <BellRing className="h-4 w-4" />Central de avisos
        </Link>
      </section>

      {crmQuery.isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Carregando o funil de interessados...
        </div>
      ) : crmQuery.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
          <p className="font-semibold text-red-900 dark:text-red-100">Não foi possível carregar o CRM</p>
          <p className="mt-1 text-sm text-red-800 dark:text-red-200">{crmQuery.error.message}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => crmQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <nav aria-label="Etapas do funil" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {CRM_STAGES.map((stage, index) => {
              const isActive = activeStage === stage.key;
              return (
                <button
                  type="button"
                  key={stage.key}
                  aria-pressed={isActive}
                  onClick={() => setActiveStage(stage.key)}
                  className={`min-w-[136px] snap-start rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#094C7E] ${
                    isActive
                      ? 'border-[#094C7E] bg-[#094C7E] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500'
                  }`}
                >
                  <span className="block text-xs font-medium opacity-80">{String(index + 1).padStart(2, '0')}</span>
                  <span className="mt-1 block text-sm font-semibold">{stage.shortLabel}</span>
                  <span className="mt-1 block tabular-nums text-xs">{metrics.byStage[stage.key]} pessoas</span>
                </button>
              );
            })}
          </nav>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
            <section className="min-w-0">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{stageLabel(activeStage)}</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-0 sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pessoa ou instrumento" className="pl-9" aria-label="Buscar interessado" />
                  </label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger aria-label="Filtrar por origem" className="sm:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as origens</SelectItem>
                      {availableSources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {visibleLeads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
                  <UserRoundPlus className="mx-auto h-8 w-8 text-slate-500 dark:text-slate-400" />
                  <p className="mt-3 font-semibold text-slate-900 dark:text-slate-100">
                    {search || sourceFilter !== 'all' ? 'Nenhum interessado encontrado' : 'Nenhuma pessoa nesta etapa'}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-300">
                    {search || sourceFilter !== 'all' ? 'Tente outra busca ou remova o filtro de origem.' : 'Cadastre uma pessoa interessada para começar a acompanhar o funil.'}
                  </p>
                  {!search && sourceFilter === 'all' && (
                    <Button type="button" className="mt-4" onClick={openNewLead}><Plus className="mr-2 h-4 w-4" />Cadastrar interessado</Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                  {visibleLeads.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => openLead(lead)}
                        className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#094C7E] dark:hover:bg-slate-800/70 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{lead.full_name}</span>
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                            {lead.instrument && <span>{lead.instrument}</span>}
                            {lead.phone && <span>{lead.phone}</span>}
                            <span>{lead.source}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-sm">
                          {lead.next_follow_up_at && (
                            <span className={`inline-flex items-center gap-1 ${new Date(lead.next_follow_up_at) < new Date() ? 'font-medium text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}`}>
                              <Clock3 className="h-4 w-4" />{formatDateTime(lead.next_follow_up_at)}
                            </span>
                          )}
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">Próximos retornos</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">O que precisa da sua atenção.</p>
                </div>
                <BellRing className="h-5 w-5 shrink-0 text-[#094C7E] dark:text-blue-300" />
              </div>
              {upcomingFollowUps.length === 0 ? (
                <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Nenhum retorno agendado. Registre um contato para lembrar o próximo passo.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
                  {upcomingFollowUps.map((lead) => {
                    const overdue = new Date(lead.next_follow_up_at) < new Date();
                    return (
                      <li key={lead.id}>
                        <button type="button" onClick={() => openLead(lead)} className="w-full py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#094C7E]">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">{lead.full_name}</span>
                            {overdue && <Badge variant="destructive">Atrasado</Badge>}
                          </span>
                          <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{formatDateTime(lead.next_follow_up_at)}</span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{lead.instrument || 'Instrumento não informado'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}

      <Sheet open={Boolean(sheetMode)} onOpenChange={(open) => {
        if (!open) {
          setSheetMode(null);
          setConversionMatches(null);
        }
      }}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-white dark:bg-slate-900 sm:max-w-xl">
          <SheetHeader className="mb-6 pr-8 text-left">
            <SheetTitle>
              {sheetMode === 'create' ? 'Novo interessado' : sheetMode === 'edit' ? 'Editar interessado' : activeLead?.full_name || 'Interessado'}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === 'view' ? 'Acompanhe etapa, contatos, aulas experimentais e matrícula.' : 'Os dados ficam visíveis somente para o proprietário.'}
            </SheetDescription>
          </SheetHeader>
          {sheetMode === 'create' && (
            <LeadForm
              isSaving={createLeadMutation.isPending}
              onCancel={() => setSheetMode(null)}
              onSubmit={handleSaveLead}
            />
          )}
          {sheetMode === 'edit' && activeLead && (
            <LeadForm
              key={activeLead.id}
              lead={activeLead}
              isSaving={updateLeadMutation.isPending}
              onCancel={() => setSheetMode('view')}
              onSubmit={handleSaveLead}
            />
          )}
          {sheetMode === 'view' && activeLead && (
                <>
                <LeadDetails
              key={activeLead.id}
              lead={activeLead}
              contacts={contactsQuery.data || []}
              linkedTrials={leadTrials.filter((link) => link.lead_id === activeLead.id)}
              trials={trials}
              teachers={teachersQuery.data || []}
              isLoadingContacts={contactsQuery.isLoading}
              contactsError={contactsQuery.error}
              onRetryContacts={() => contactsQuery.refetch()}
              teachersError={teachersQuery.error}
              accountType={accountType}
              studioAvailability={studioAvailabilityQuery.data || []}
              teacherAvailability={teacherAvailabilityQuery.data || []}
              availabilityLoading={studioAvailabilityQuery.isLoading || teacherAvailabilityQuery.isLoading}
              availabilityQueryError={studioAvailabilityQuery.error || teacherAvailabilityQuery.error}
              isSavingContact={addContactMutation.isPending}
              isSchedulingTrial={scheduleTrialMutation.isPending}
              isUpdatingTrial={updateTrialMutation.isPending}
              isUpdatingLead={updateLeadMutation.isPending}
              isConverting={conversionMutation.isPending}
              onAddContact={({ leadId, contact }) => addContactMutation.mutate({ leadId, contact })}
              onScheduleTrial={(payload, onSuccess) => scheduleTrialMutation.mutate(payload, { onSuccess })}
              onUpdateTrial={(trialId, status) => updateTrialMutation.mutate({ trialId, status })}
              onUpdateLead={(leadId, changes) => updateLeadMutation.mutate({ leadId, changes })}
              onConvert={requestConversion}
              onEdit={(lead) => {
                setActiveLead(lead);
                setSheetMode('edit');
              }}
            />
            {conversionMatches && (
              <section aria-labelledby="conversion-matches-title" className="mt-6 space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <div>
                  <h3 id="conversion-matches-title" className="font-semibold text-amber-950 dark:text-amber-100">Cadastro com este telefone encontrado</h3>
                  <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                    Para evitar duplicidade, vincule o aluno existente. Se for outra pessoa, confirme antes de criar um novo cadastro.
                  </p>
                </div>
                <ul className="divide-y divide-amber-200 rounded-lg border border-amber-200 dark:divide-amber-800 dark:border-amber-800">
                  {conversionMatches.students.map((student) => (
                    <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{student.full_name}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{student.phone}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={conversionMutation.isPending}
                        onClick={() => conversionMutation.mutate({
                          leadId: conversionMatches.lead.id,
                          studentId: student.id,
                        })}
                      >
                        Vincular
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="outline" onClick={() => setConversionMatches(null)}>Revisar depois</Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={conversionMutation.isPending}
                    onClick={() => conversionMutation.mutate({
                      leadId: conversionMatches.lead.id,
                      createNewDespiteMatches: true,
                    })}
                  >
                    Criar novo cadastro mesmo assim
                  </Button>
                </div>
              </section>
            )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
