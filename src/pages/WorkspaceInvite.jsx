import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { workspaceService } from '@/modules/workspaces/services/workspaceService';

export default function WorkspaceInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useRef(true);
  const startedToken = useRef(null);
  const {
    isAuthenticated,
    isLoadingAuth,
    isLoadingWorkspaces,
    refreshAccess,
    refreshWorkspaces,
    userId,
  } = useAuth();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setError('O link de convite está incompleto ou inválido.');
      return;
    }

    if (isLoadingAuth || (isAuthenticated && isLoadingWorkspaces)) return;

    if (!isAuthenticated) return;

    if (startedToken.current === token) return;
    startedToken.current = token;

    const acceptInvitation = async () => {
      setError('');
      try {
        const workspaceId = await workspaceService.acceptInvitation(token);
        await refreshWorkspaces(userId, workspaceId);
        const accessStatus = await refreshAccess();
        if (accessStatus !== 'active') {
          throw new Error('O acesso deste workspace não está ativo. Entre em contato com o proprietário.');
        }
        if (isMounted.current) navigate('/', { replace: true });
      } catch (acceptError) {
        if (isMounted.current) setError(acceptError.message || 'Não foi possível aceitar o convite.');
      }
    };

    acceptInvitation();
  }, [isAuthenticated, isLoadingAuth, isLoadingWorkspaces, navigate, refreshAccess, refreshWorkspaces, token, userId]);

  const handleSignUp = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/workspace-invite?token=${encodeURIComponent(token)}`,
        },
      });

      if (signUpError) {
        setError(signUpError.message || 'Não foi possível criar a conta.');
        return;
      }

      if (data.session) {
        setMessage('Conta criada. Aceitando o convite...');
      } else {
        setMessage('Conta criada. Confirme seu e-mail pelo link enviado; o convite continuará disponível.');
      }
    } catch (signUpError) {
      setError(signUpError.message || 'Não foi possível criar a conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message || 'Não foi possível sair da conta atual.');
        return;
      }
      navigate(`/login?invite=${encodeURIComponent(token || '')}`, { replace: true });
    } catch (signOutError) {
      setError(signOutError.message || 'Não foi possível sair da conta atual.');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <Building2 className="h-10 w-10 text-[#094C7E]" />
          <CardTitle>Convite para um workspace</CardTitle>
          <CardDescription>
            {error
              ? 'Não foi possível concluir o convite.'
              : !isAuthenticated && !isLoadingAuth
                ? 'Acesse sua conta ou crie uma usando o e-mail convidado.'
                : 'Verificando o convite e preparando seu acesso...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {error ? (
            <>
              <p role="alert" className="text-sm text-red-600">{error}</p>
              <div className="flex justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                <Button asChild>
                  <Link to={`/login?invite=${encodeURIComponent(token || '')}`}>Ir para o login</Link>
                </Button>
              </div>
              {isAuthenticated && (
                <Button type="button" variant="ghost" onClick={handleSwitchAccount}>
                  Sair e usar outra conta
                </Button>
              )}
            </>
          ) : !isAuthenticated && !isLoadingAuth ? (
            <form className="space-y-4 text-left" onSubmit={handleSignUp}>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Entre com a conta que recebeu o convite ou crie uma conta usando exatamente o mesmo e-mail.
              </p>
              <div className="space-y-2">
                <Label htmlFor="invite-account-email">E-mail do convite</Label>
                <Input
                  id="invite-account-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-account-password">Criar senha</Label>
                <Input
                  id="invite-account-password"
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
                {isSubmitting ? 'Criando conta...' : 'Criar conta e aceitar convite'}
              </Button>
              <Button asChild type="button" variant="outline" className="w-full">
                <Link to={`/login?invite=${encodeURIComponent(token || '')}`}>Já tenho uma conta</Link>
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              Verificando o convite e preparando seu acesso...
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
