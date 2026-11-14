let activeWorkspaceId = null;

export const getActiveWorkspaceId = () => activeWorkspaceId;

export const setActiveWorkspaceId = (workspaceId) => {
  if (workspaceId !== null && typeof workspaceId !== 'string') {
    throw new Error('O ID do workspace ativo deve ser uma string ou null.');
  }

  activeWorkspaceId = workspaceId;
};

export const requireActiveWorkspaceId = () => {
  if (!activeWorkspaceId) {
    throw new Error('Nenhum workspace ativo foi carregado para esta sessão.');
  }

  return activeWorkspaceId;
};
