import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Copy, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AvailabilityEditor from '@/components/availability/AvailabilityEditor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { availabilityService } from '@/modules/availability/services/availabilityService';
import { workspaceService } from '@/modules/workspaces/services/workspaceService';

const roleLabels = {
  owner: 'Proprietário',
  teacher: 'Professor',
  finance: 'Financeiro',
};

const formatDate = (value) => new Date(value).toLocaleDateString('pt-BR');

export default function Workspace() {
  const queryClient = useQueryClient();
  const {
    activeWorkspace,
    activeWorkspaceId,
    accountType,
    userId,
    workspaces,
    workspaceRole,
    refreshWorkspaces,
  } = useAuth();
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  const isOwner = workspaceRole === 'owner';
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.workspace_name || '');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('teacher');
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    setWorkspaceName(activeWorkspace?.workspace_name || '');
  }, [activeWorkspace?.workspace_name, activeWorkspaceId]);

  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['workspaceMembers', activeWorkspaceId],
    queryFn: () => workspaceService.listMembers(activeWorkspaceId),
    enabled: isOwner && Boolean(activeWorkspaceId),
  });

  const { data: invitations = [], isLoading: isLoadingInvitations } = useQuery({
    queryKey: ['workspaceInvitations', activeWorkspaceId],
    queryFn: () => workspaceService.listInvitations(activeWorkspaceId),
    enabled: isOwner && Boolean(activeWorkspaceId),
  });

  const studioAvailabilityQuery = useQuery({
    queryKey: ['studioAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listStudio(activeWorkspaceId),
    enabled: isOwner && accountType === 'studio' && Boolean(activeWorkspaceId),
  });

  const saveStudioAvailabilityMutation = useMutation({
    mutationFn: (rows) => availabilityService.saveStudio(activeWorkspaceId, rows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['studioAvailability', activeWorkspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboardIntelligence', activeWorkspaceId] });
      toast.success('Horários do estúdio salvos.');
    },
    onError: (error) => toast.error(error.message || 'Não foi possível salvar os horários do estúdio.'),
  });

  const refreshWorkspaceData = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['workspaceMembers', activeWorkspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['workspaceInvitations', activeWorkspaceId] }),
  ]);

  const createWorkspaceMutation = useMutation({
    mutationFn: (name) => workspaceService.create(name),
    onSuccess: async () => {
      setNewWorkspaceName('');
      await refreshWorkspaces(userId);
      toast.success('Workspace criado com sucesso.');
    },
    onError: (error) => toast.error(error.message || 'Não foi possível criar o workspace.'),
  });

  const renameWorkspaceMutation = useMutation({
    mutationFn: (name) => workspaceService.rename(activeWorkspaceId, name),
    onSuccess: async (workspace) => {
      await refreshWorkspaces(userId, workspace.id);
      toast.success('Nome do workspace atualizado.');
    },
    onError: (error) => toast.error(error.message || 'Não foi possível renomear o workspace.'),
  });

  const createInvitationMutation = useMutation({
    mutationFn: () => workspaceService.createInvitation(activeWorkspaceId, inviteEmail, inviteRole),
    onSuccess: async (invitation) => {
      setInviteEmail('');
      setInviteLink(`${window.location.origin}/workspace-invite?token=${encodeURIComponent(invitation.token)}`);
      await refreshWorkspaceData();
      setIsSendingInvitation(true);
      try {
        const { data, error } = await supabase.functions.invoke('send-workspace-invitation', {
          body: { workspace_id: activeWorkspaceId, token: invitation.token },
        });
        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.error || 'O serviço não confirmou o envio do convite.');
        }
        toast.success('Convite enviado por e-mail.');
      } catch (error) {
        toast.error(`Convite criado, mas o e-mail não foi enviado: ${error.message || 'erro desconhecido'}. O link continua disponível para cópia.`);
      } finally {
        setIsSendingInvitation(false);
      }
    },
    onError: (error) => toast.error(error.message || 'Não foi possível criar o convite.'),
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: workspaceService.revokeInvitation,
    onSuccess: refreshWorkspaceData,
    onError: (error) => toast.error(error.message || 'Não foi possível revogar o convite.'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId: memberUserId, roleKey }) => (
      workspaceService.updateMemberRole(activeWorkspaceId, memberUserId, roleKey)
    ),
    onSuccess: refreshWorkspaceData,
    onError: (error) => toast.error(error.message || 'Não foi possível alterar o papel.'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberUserId) => workspaceService.removeMember(activeWorkspaceId, memberUserId),
    onSuccess: refreshWorkspaceData,
    onError: (error) => toast.error(error.message || 'Não foi possível remover o membro.'),
  });

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Link copiado.');
    } catch (error) {
      toast.error(error.message || 'Não foi possível copiar o link.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[#094C7E]" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Estúdio</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          Gerencie o workspace ativo e as pessoas que colaboram com ele.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Workspace ativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Nome do estúdio</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                maxLength={120}
                disabled={!isOwner}
              />
            </div>
            {isOwner && (
              <Button
                type="button"
                variant="outline"
                disabled={!workspaceName.trim() || workspaceName === activeWorkspace?.workspace_name || renameWorkspaceMutation.isPending}
                onClick={() => renameWorkspaceMutation.mutate(workspaceName.trim())}
              >
                {renameWorkspaceMutation.isPending ? 'Salvando...' : 'Salvar nome'}
              </Button>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Seu papel: {roleLabels[workspaceRole] || workspaceRole || '—'}
          </p>
        </CardContent>
      </Card>

      {isOwner ? (
        <>
          {accountType === 'studio' && (
            <div className="space-y-3">
              {studioAvailabilityQuery.error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                  Não foi possível carregar os horários do estúdio: {studioAvailabilityQuery.error.message}
                </p>
              )}
              <AvailabilityEditor
                title="Horários de funcionamento do estúdio"
                description="Defina quando o espaço pode receber aulas. Os horários dos professores são configurados separadamente."
                rows={studioAvailabilityQuery.data || []}
                idPrefix="studio-hours"
                isLoading={studioAvailabilityQuery.isLoading}
                isSaving={saveStudioAvailabilityMutation.isPending}
                isDisabled={Boolean(studioAvailabilityQuery.error)}
                onSave={(rows) => saveStudioAvailabilityMutation.mutate(rows)}
              />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Criar outro workspace</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  createWorkspaceMutation.mutate(newWorkspaceName.trim());
                }}
              >
                <Input
                  aria-label="Nome do novo workspace"
                  placeholder="Nome do novo estúdio"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  maxLength={120}
                  required
                />
                <Button type="submit" disabled={createWorkspaceMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  Criar workspace
                </Button>
              </form>
              {workspaces.length > 1 && (
                <p className="mt-3 text-sm text-slate-500">
                  Você tem {workspaces.length} workspaces. Use o seletor no menu lateral para alternar entre eles.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Convidar membro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  createInvitationMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="invite-email">E-mail</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Papel</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Professor</SelectItem>
                      <SelectItem value="finance">Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="self-end" disabled={createInvitationMutation.isPending || isSendingInvitation}>
                  <UserPlus className="h-4 w-4" />
                  {isSendingInvitation ? 'Enviando...' : 'Convidar'}
                </Button>
              </form>

              <p className="text-sm text-slate-500">
                O convite será enviado por e-mail, vale por 7 dias e só pode ser aceito por uma conta com o mesmo endereço. Os limites de membros e workspaces são definidos pelo plano.
              </p>

              {inviteLink && (
                <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30 sm:flex-row">
                  <Input aria-label="Link do convite" value={inviteLink} readOnly />
                  <Button type="button" variant="outline" onClick={handleCopyInviteLink}>
                    <Copy className="h-4 w-4" />
                    Copiar link
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membros ({members.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingMembers ? (
                <p className="text-sm text-slate-500">Carregando membros...</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum membro encontrado.</p>
              ) : members.map((member) => (
                <div key={member.user_id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {member.full_name || member.email || member.user_id}
                    </p>
                    <p className="truncate text-sm text-slate-500">{member.email || member.user_id}</p>
                    {member.status !== 'active' && <p className="text-xs text-amber-600">Suspenso</p>}
                  </div>
                  {member.role_key === 'owner' ? (
                    <span className="text-sm font-medium">{roleLabels.owner}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role_key}
                        onValueChange={(roleKey) => updateRoleMutation.mutate({ userId: member.user_id, roleKey })}
                        disabled={updateRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teacher">Professor</SelectItem>
                          <SelectItem value="finance">Financeiro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Remover ${member.full_name || member.email}`}
                        disabled={removeMemberMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Remover ${member.full_name || member.email} deste workspace?`)) {
                            removeMemberMutation.mutate(member.user_id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Convites pendentes ({invitations.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingInvitations ? (
                <p className="text-sm text-slate-500">Carregando convites...</p>
              ) : invitations.length === 0 ? (
                <p className="text-sm text-slate-500">Não há convites pendentes.</p>
              ) : invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{invitation.email}</p>
                    <p className="text-sm text-slate-500">
                      {roleLabels[invitation.role_key]} · expira em {formatDate(invitation.expires_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={revokeInvitationMutation.isPending}
                    onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                  >
                    Revogar
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              As configurações da equipe e dos workspaces são administradas pelo proprietário.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
