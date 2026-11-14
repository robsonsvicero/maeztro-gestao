export const pageRoles = {
  Dashboard: ['owner'],
  Finances: ['owner', 'finance'],
  Clients: ['owner'],
  Receipts: ['owner'],
  Students: ['owner', 'teacher'],
  Settings: ['owner', 'teacher', 'finance'],
  Schedule: ['owner', 'teacher'],
  AutoSchedule: ['owner', 'teacher'],
  Automations: ['owner'],
  CRM: ['owner'],
  Budget: ['owner'],
  Outros: ['owner'],
  Workspace: ['owner', 'teacher', 'finance'],
};

export const canAccessPage = (page, role, isAdmin = false) => (
  isAdmin || !pageRoles[page] || pageRoles[page].includes(role)
);

export const isStudioMember = (role, accountType, isAdmin = false) => (
  !isAdmin
  && accountType === 'studio'
  && ['teacher', 'finance'].includes(role)
);

export const canManageSettings = (role, accountType, isAdmin = false) => (
  isAdmin || role === 'owner' || isStudioMember(role, accountType)
);
