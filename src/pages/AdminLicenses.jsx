import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Download, FileText, Plus, RefreshCw, Save, ShieldAlert, X } from 'lucide-react';

const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR') : 'Vitalícia';
const inputDate = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const endOfDay = (value) => value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
const accessTypeLabel = (type, basePlanId) => {
  if (type === 'trial') return 'Teste gratuito';
  if (type === 'lifetime') return 'Licença vitalícia';
  if (type === 'subscription') return basePlanId === 'annual' ? 'Assinatura anual' : basePlanId === 'monthly' ? 'Assinatura mensal' : 'Assinatura';
  return type ?? '—';
};
const statusLabel = (status) => ({ active: 'Ativa', revoked: 'Revogada', expired: 'Expirada', pending: 'Pendente', grace_period: 'Período de tolerância', on_hold: 'Suspensa', canceled: 'Cancelada' }[status] ?? status);
const statuses = ['active', 'pending', 'grace_period', 'on_hold', 'canceled', 'expired', 'revoked'];

const invokeAdmin = async (body = {}) => {
  const { data, error } = await supabase.functions.invoke('admin-licenses', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

export default function AdminLicenses() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [form, setForm] = useState({ email: '', name: '' });
  const [edits, setEdits] = useState({});
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-licenses'], queryFn: () => invokeAdmin() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-licenses'] });

  const createLicense = useMutation({
    mutationFn: async (values) => {
      const { data, error } = await supabase.functions.invoke('admin-create-lifetime-license', { body: { email: values.email } });
      if (error) {
        let realMessage = error.message || 'Não foi possível criar a licença.';
        try {
          const body = await error?.context?.json?.();
          if (body?.error) realMessage = body.error;
        } catch { /* ignora erro ao parsear */ }
        throw new Error(realMessage);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (result) => { setForm({ email: '', name: '' }); setCreateError(''); setCreateMessage(result?.message || 'Licença vitalícia criada com sucesso.'); refresh(); },
    onError: (mutationError) => setCreateError(mutationError.message || 'Não foi possível criar a licença.'),
  });
  const updateLicense = useMutation({
    mutationFn: ({ entitlementId, status, expiresOn }) => invokeAdmin({ action: 'update_license', entitlementId, status, accessEndsAt: endOfDay(expiresOn) }),
    onSuccess: () => { setEdits({}); refresh(); },
  });
  const editFor = (entitlement) => edits[entitlement.id] ?? { status: entitlement.status, expiresOn: inputDate(entitlement.access_ends_at) };
  const changeEdit = (entitlement, change) => setEdits((previous) => ({
    ...previous,
    [entitlement.id]: { status: entitlement.status, expiresOn: inputDate(entitlement.access_ends_at), ...previous[entitlement.id], ...change },
  }));

  // Compila a lista de itens para o relatório
  const reportRows = (data?.customers ?? []).flatMap((customer) => {
    const name = customer.name || 'Sem nome';
    const email = customer.email || '—';
    const entitlements = customer.entitlements?.length ? customer.entitlements : [null];

    return entitlements.map((entitlement) => {
      const startDate = entitlement?.access_starts_at || entitlement?.created_at || null;
      const endDate = entitlement?.access_ends_at || null;

      return {
        id: entitlement?.id ? `${customer.id}-${entitlement.id}` : customer.id,
        name,
        email,
        startDateFormatted: startDate ? new Date(startDate).toLocaleDateString('pt-BR') : '—',
        endDateFormatted: entitlement ? (endDate ? new Date(endDate).toLocaleDateString('pt-BR') : 'Vitalícia') : 'Sem licença',
        rawStartDate: startDate,
        rawEndDate: endDate,
      };
    });
  });

  const exportToCSV = () => {
    if (!reportRows.length) return;
    const header = ['Nome', 'E-mail', 'Data de Início da Licença', 'Data Final'];
    const rows = reportRows.map((r) => [
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.email.replace(/"/g, '""')}"`,
      `"${r.startDateFormatted}"`,
      `"${r.endDateFormatted}"`
    ]);

    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_licencas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) return <div className="p-4 md:p-8"><Card className="max-w-xl p-6"><ShieldAlert className="mb-3 h-8 w-8 text-red-600" /><h1 className="text-xl font-bold">Acesso restrito</h1><p className="mt-2 text-slate-600">Esta área é exclusiva para o administrador.</p></Card></div>;

  return <div className="w-full max-w-none space-y-6 p-4 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Licenças</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">Gerencie licenças manuais, validade e acesso dos professores.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShowReportModal(true)}>
          <FileText className="mr-2 h-4 w-4" />Gerar Relatório
        </Button>
        <Button onClick={() => setShowCreate((visible) => !visible)}>
          <Plus className="mr-2 h-4 w-4" />Nova licença
        </Button>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />Atualizar
        </Button>
      </div>
    </div>

    {showCreate && <Card className="w-full p-4 md:p-6"><h2 className="text-lg font-semibold">Incluir licença vitalícia</h2><p className="mt-1 text-sm text-slate-500">Se o e-mail ainda não tiver uma conta MAEZTRO, ela será criada automaticamente e um convite será enviado ao usuário para definir a senha.</p><form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setCreateError(''); setCreateMessage(''); createLicense.mutate(form); }}>
      <div className="space-y-2"><Label htmlFor="license-email">E-mail *</Label><Input id="license-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="professor@exemplo.com" /></div>
      <div className="space-y-2"><Label htmlFor="license-name">Nome (opcional)</Label><Input id="license-name" type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do professor" /></div>
      <div className="flex flex-wrap items-end gap-3"><Button type="submit" disabled={createLicense.isPending}><CheckCircle2 className="mr-2 h-4 w-4" />{createLicense.isPending ? 'Incluindo...' : 'Incluir licença'}</Button>{createError && <p className="text-sm text-red-600">{createError}</p>}{createMessage && <p className="text-sm text-emerald-700">{createMessage}</p>}</div>
    </form></Card>}

    <Card className="w-full p-4"><h2 className="mb-4 text-lg font-semibold">Professores e licenças</h2>{isLoading ? <p className="text-slate-500">Carregando...</p> : <div className="overflow-x-auto"><table className="min-w-[1400px] w-full text-left text-sm"><thead className="border-y bg-slate-50 text-slate-600 dark:bg-slate-900/40"><tr><th className="p-3">Professor</th><th className="p-3">Plano</th><th className="p-3">Status de acesso</th><th className="p-3">Validade</th><th className="p-3">Conta</th><th className="p-3">1º acesso</th><th className="p-3">Aceite dos termos</th><th className="p-3 text-right">Salvar</th></tr></thead><tbody>
      {data?.customers?.flatMap((customer) => (customer.entitlements?.length ? customer.entitlements : [null]).map((entitlement) => {
        const edit = entitlement ? editFor(entitlement) : null;
        return <tr key={entitlement?.id ?? customer.id} className="border-b"><td className="p-3"><p className="font-medium">{customer.name || 'Sem nome'}</p><p className="text-xs text-slate-500">{customer.email}</p></td><td className="p-3">{entitlement ? accessTypeLabel(entitlement.access_type, entitlement.base_plan_id) : '—'}</td><td className="p-3">{entitlement ? <select className="h-9 rounded-md border border-input bg-transparent px-2" value={edit.status} onChange={(event) => changeEdit(entitlement, { status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select> : 'Sem licença'}</td><td className="p-3">{entitlement ? <div className="space-y-1"><Input aria-label="Data de validade; deixe vazio para licença vitalícia" className="w-40" type="date" value={edit.expiresOn} onChange={(event) => changeEdit(entitlement, { expiresOn: event.target.value })} /><p className="text-xs text-slate-500">Atual: {formatDate(entitlement.access_ends_at)}</p></div> : '—'}</td><td className="p-3"><span className="text-emerald-700">Vinculada</span></td><td className="p-3">{customer.first_access_completed ? <div><Badge className="bg-emerald-100 text-emerald-800">Concluído</Badge><p className="mt-1 text-xs text-slate-500">{formatDate(customer.first_access_at)}</p></div> : <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>}</td><td className="p-3">{customer.legal_documents_accepted_at ? <div><Badge className="bg-emerald-100 text-emerald-800">Aceito</Badge><p className="mt-1 text-xs text-slate-500">{formatDate(customer.legal_documents_accepted_at)}</p><p className="text-xs text-slate-400">v{customer.legal_documents_version}</p></div> : <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>}</td><td className="p-3 text-right">{entitlement && <Button size="sm" variant="outline" disabled={updateLicense.isPending} onClick={() => updateLicense.mutate({ entitlementId: entitlement.id, ...edit })}><Save className="mr-1 h-4 w-4" />Salvar</Button>}</td></tr>;
      }))}
      {!data?.customers?.length && <tr><td colSpan="8" className="p-6 text-center text-slate-500">Nenhuma compra ou licença registrada.</td></tr>}
    </tbody></table></div>}</Card>

    <Card className="w-full p-4"><h2 className="mb-4 text-lg font-semibold">Últimos eventos de assinatura</h2><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-y bg-slate-50 text-slate-600 dark:bg-slate-900/40"><tr><th className="p-3">Evento</th><th className="p-3">Status</th><th className="p-3">Erro</th><th className="p-3">Registrado em</th></tr></thead><tbody>{data?.events?.map((event) => <tr key={event.id} className="border-b"><td className="p-3 font-medium">{event.event_type}</td><td className="p-3"><Badge className={event.processing_status === 'processed' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{event.processing_status}</Badge></td><td className="p-3 text-slate-600">{event.processing_error || '—'}</td><td className="p-3">{formatDate(event.created_at)}</td></tr>)}{!data?.events?.length && <tr><td colSpan="4" className="p-6 text-center text-slate-500">Nenhum evento registrado.</td></tr>}</tbody></table></div></Card>

    {/* Modal de Relatório de Licenças */}
    {showReportModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Relatório de Licenças</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Listagem de usuários com dados de vigência de licença</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowReportModal(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto my-4 border rounded-md">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Data de Início</th>
                  <th className="p-3">Data Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{row.email}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{row.startDateFormatted}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{row.endDateFormatted}</td>
                  </tr>
                ))}
                {!reportRows.length && (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-slate-500">
                      Nenhuma licença encontrada para exibir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-xs text-slate-500">Total: {reportRows.length} registro(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowReportModal(false)}>
                Fechar
              </Button>
              <Button onClick={exportToCSV} disabled={!reportRows.length}>
                <Download className="mr-2 h-4 w-4" /> Baixar relatório em CSV/Excel (Planilha)
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )}
  </div>;
}
