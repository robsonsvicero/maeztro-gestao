import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';

const roleLabels = {
  owner: 'Proprietário',
  teacher: 'Professor',
  finance: 'Financeiro',
};

export default function WorkspaceSwitcher({ showSingle = true }) {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useAuth();
  const activeWorkspace = workspaces.find((workspace) => workspace.workspace_id === activeWorkspaceId);

  if (!activeWorkspace || (!showSingle && workspaces.length < 2)) return null;

  return (
    <div className="mt-3 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
      <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
      {workspaces.length > 1 ? (
        <Select value={activeWorkspaceId} onValueChange={setActiveWorkspace}>
          <SelectTrigger className="h-9 min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                {workspace.workspace_name} — {roleLabels[workspace.role_key] || workspace.role_key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{activeWorkspace.workspace_name}</p>
          <p className="text-xs text-slate-500">{roleLabels[activeWorkspace.role_key] || activeWorkspace.role_key}</p>
        </div>
      )}
    </div>
  );
}
