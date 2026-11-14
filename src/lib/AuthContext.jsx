import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { workspaceService } from '@/modules/workspaces/services/workspaceService';
import { setActiveWorkspaceId as setWorkspaceContextId } from '@/modules/shared/services/workspaceContext.js';

const validAccessTypes = new Set(['trial', 'subscription', 'lifetime']);

const AuthContext = createContext({
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authError: null,
  isAuthenticated: false,
  isAdmin: false,
  accessStatus: 'idle',
  accessType: null,
  accessProvider: null,
  accessReason: null,
  trialEndsAt: null,
  accessEndsAt: null,
  isLoadingWorkspaces: false,
  workspaceError: null,
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  accountType: 'individual',
  workspaceRole: null,
  userId: null,
  setActiveWorkspace: () => {},
  refreshWorkspaces: async () => [],
  refreshAccess: async () => 'idle',
  navigateToLogin: () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessStatus, setAccessStatus] = useState('idle');
  const [accessType, setAccessType] = useState(null);
  const [accessProvider, setAccessProvider] = useState(null);
  const [accessReason, setAccessReason] = useState(null);
  const [trialEndsAt, setTrialEndsAt] = useState(null);
  const [accessEndsAt, setAccessEndsAt] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState(null);
  const sessionUserId = useRef(null);
  const accessRequestId = useRef(0);

  const refreshWorkspaces = useCallback(async (userId, preferredWorkspaceId = null) => {
    if (!userId) {
      setWorkspaces([]);
      setActiveWorkspaceIdState(null);
      setWorkspaceContextId(null);
      setWorkspaceError(null);
      setIsLoadingWorkspaces(false);
      return [];
    }

    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const availableWorkspaces = await workspaceService.listMine();
      if (sessionUserId.current !== userId) return [];

      if (availableWorkspaces.length === 0) {
        const inviteToken = new URLSearchParams(window.location.search).get('token');
        if (window.location.pathname === '/workspace-invite' && inviteToken) {
          setWorkspaces([]);
          setActiveWorkspaceIdState(null);
          setWorkspaceContextId(null);
          return [];
        }
        throw new Error('Esta conta ainda não está vinculada a um workspace.');
      }

      const storageKey = `maeztro.activeWorkspace.${userId}`;
      const storedWorkspaceId = preferredWorkspaceId || window.localStorage.getItem(storageKey);
      const selectedWorkspace = availableWorkspaces.find((workspace) => (
        workspace.workspace_id === storedWorkspaceId
      )) || availableWorkspaces[0];

      setWorkspaces(availableWorkspaces);
      setActiveWorkspaceIdState(selectedWorkspace.workspace_id);
      setWorkspaceContextId(selectedWorkspace.workspace_id);
      window.localStorage.setItem(storageKey, selectedWorkspace.workspace_id);
      return availableWorkspaces;
    } catch (error) {
      if (sessionUserId.current === userId) {
        setWorkspaceError(error);
        setWorkspaces([]);
        setActiveWorkspaceIdState(null);
        setWorkspaceContextId(null);
      }
      throw error;
    } finally {
      if (sessionUserId.current === userId) setIsLoadingWorkspaces(false);
    }
  }, []);

  const setActiveWorkspace = useCallback((workspaceId) => {
    if (workspaceId === activeWorkspaceId) return;
    const selectedWorkspace = workspaces.find((workspace) => workspace.workspace_id === workspaceId);
    if (!selectedWorkspace) {
      throw new Error('O workspace selecionado não pertence a esta conta.');
    }

    setActiveWorkspaceIdState(workspaceId);
    setWorkspaceContextId(workspaceId);
    window.localStorage.setItem(`maeztro.activeWorkspace.${session?.user?.id}`, workspaceId);
    queryClientInstance.clear();
    window.location.reload();
  }, [activeWorkspaceId, session, workspaces]);

  const refreshAccess = useCallback(async (currentSession) => {
    const requestId = ++accessRequestId.current;
    const sessionToCheck = currentSession ?? session;
    if (!sessionToCheck) {
      setAccessStatus('idle');
      setIsAdmin(false);
      setAccessType(null);
      setAccessProvider(null);
      setAccessReason(null);
      setTrialEndsAt(null);
      setAccessEndsAt(null);
      return 'idle';
    }
    if (sessionUserId.current !== sessionToCheck.user.id) return 'idle';

    setAccessStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('activate-access', {
        headers: {
          Authorization: `Bearer ${sessionToCheck.access_token}`,
        },
      });
      if (error) throw error;
      if (requestId !== accessRequestId.current || sessionUserId.current !== sessionToCheck.user.id) return 'idle';
      const status = data?.status ?? 'no_license';
      setAccessStatus(status);
      setIsAdmin(Boolean(data?.is_admin));
      setAccessType(validAccessTypes.has(data?.access_type) ? data.access_type : null);
      setAccessProvider(data?.provider ?? null);
      setAccessReason(data?.access_reason ?? null);
      setTrialEndsAt(data?.trial_ends_at ?? null);
      setAccessEndsAt(data?.access_ends_at ?? data?.trial_ends_at ?? null);
      return status;
    } catch (error) {
      if (requestId !== accessRequestId.current || sessionUserId.current !== sessionToCheck.user.id) return 'idle';
      console.error('Erro ao verificar licença:', error);
      setAccessStatus('verification_error');
      setAccessReason('verification_error');
      return 'verification_error';
    }
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      let currentSession = null;
      try {
        const { data, error } = await supabase.auth.getSession();
        currentSession = data.session;

        if (!isMounted) return;

        if (error && error.status !== 401 && error.name !== 'AuthSessionMissingError') {
          if (error.status === 400 || error.message?.includes('refresh_token')) {
            await supabase.auth.signOut().catch(() => {});
            setSession(null);
            setAccessStatus('idle');
          } else {
            setAuthError({ type: 'auth_required', message: error.message });
          }
        }

        sessionUserId.current = currentSession?.user?.id ?? null;
        setSession(currentSession ?? null);
        if (currentSession) {
          await refreshWorkspaces(currentSession.user.id);
          await refreshAccess(currentSession);
        }
      } catch (error) {
        if (isMounted && (!currentSession || sessionUserId.current === currentSession.user.id)) {
          if (currentSession) {
            setSession(currentSession);
            setWorkspaceError(error);
          } else {
            await supabase.auth.signOut().catch(() => {});
            setSession(null);
            setAccessStatus('idle');
            setAuthError({ type: 'auth_required', message: error.message || 'Sessão inválida' });
          }
        }
      } finally {
        if (isMounted) setIsLoadingAuth(false);
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        const nextUserId = nextSession?.user?.id ?? null;
        const userChanged = sessionUserId.current !== nextUserId;
        sessionUserId.current = nextUserId;

        if (!nextSession) {
          accessRequestId.current += 1;
          setSession(null);
          setWorkspaces([]);
          setActiveWorkspaceIdState(null);
          setWorkspaceContextId(null);
          setWorkspaceError(null);
          setIsLoadingWorkspaces(false);
          setAccessStatus('idle');
          setIsAdmin(false);
          setAccessType(null);
          setAccessProvider(null);
          setAccessReason(null);
          setTrialEndsAt(null);
          setAccessEndsAt(null);
          setIsLoadingAuth(false);
          return;
        }

        setSession((currentSession) => currentSession ?? nextSession);
        setIsLoadingAuth(false);

        // Token renewal and tab visibility changes must not blank the app.
        if (userChanged && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          setIsLoadingWorkspaces(true);
          setTimeout(() => {
            if (!isMounted) return;
            refreshWorkspaces(nextUserId)
              .then(() => refreshAccess(nextSession))
              .catch((error) => {
                if (isMounted && sessionUserId.current === nextUserId) setWorkspaceError(error);
              });
          }, 0);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => {
      const activeWorkspace = workspaces.find((workspace) => workspace.workspace_id === activeWorkspaceId) ?? null;
      return {
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      isAuthenticated: Boolean(session),
      isAdmin,
      accessStatus,
      accessType,
      accessProvider,
      accessReason,
      trialEndsAt,
      accessEndsAt,
      isLoadingWorkspaces,
      workspaceError,
      workspaces,
      activeWorkspaceId,
      activeWorkspace,
      accountType: activeWorkspace?.account_type ?? 'individual',
      workspaceRole: activeWorkspace?.role_key ?? null,
      userId: session?.user?.id ?? null,
      setActiveWorkspace,
      refreshWorkspaces,
      refreshAccess,
      navigateToLogin: () => {
        window.location.href = '/login';
      },
    };
    },
    [accessProvider, accessReason, accessStatus, accessEndsAt, accessType, activeWorkspaceId, authError, isAdmin, isLoadingAuth, isLoadingWorkspaces, refreshAccess, refreshWorkspaces, session, setActiveWorkspace, trialEndsAt, workspaceError, workspaces]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
