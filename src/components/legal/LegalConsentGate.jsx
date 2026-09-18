import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legalDocuments';

export default function LegalConsentGate({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const checkConsent = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) setIsChecking(false);
        return;
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('legal_documents_version')
        .eq('id', user.id)
        .maybeSingle();

      // Permite o acesso durante a implantação da migração, sem bloquear o app.
      if (profileError && !profileError.message?.includes('legal_documents_version')) {
        console.error('Não foi possível verificar o aceite dos documentos:', profileError);
      }

      if (isMounted) {
        setNeedsConsent(!profileError && data?.legal_documents_version !== LEGAL_DOCUMENT_VERSION);
        setIsChecking(false);
      }
    };

    checkConsent();
    return () => { isMounted = false; };
  }, []);

  const acceptDocuments = async () => {
    setIsSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        legal_documents_version: LEGAL_DOCUMENT_VERSION,
        legal_documents_accepted_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      setError('Não foi possível registrar o aceite. Tente novamente.');
      setIsSaving(false);
      return;
    }

    setNeedsConsent(false);
    setIsSaving(false);
  };

  if (isChecking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="h-6 w-6 animate-spin text-[#094C7E]" aria-label="Verificando documentos" /></div>;
  }

  if (!needsConsent) return children;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8 dark:bg-slate-950">
      <Card className="w-full max-w-lg border-slate-200 shadow-lg dark:border-slate-800">
        <CardHeader>
          <FileCheck2 className="mb-2 h-8 w-8 text-[#094C7E] dark:text-sky-300" aria-hidden="true" />
          <CardTitle>Atualizamos nossos documentos</CardTitle>
          <CardDescription>Para continuar usando o MAEZTRO Gestão, leia e aceite os documentos abaixo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            O aceite registra que você teve acesso aos documentos e concorda com as regras de uso e o tratamento de dados descritos neles.
          </p>
          <label className="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
            <input id="legal-consent" type="checkbox" className="mt-1 h-4 w-4 accent-[#094C7E]" />
            <span>
              Li e aceito os <Link className="font-medium text-[#094C7E] underline dark:text-sky-300" to="/termos-de-uso" target="_blank">Termos de Uso</Link> e a <Link className="font-medium text-[#094C7E] underline dark:text-sky-300" to="/politica-de-privacidade" target="_blank">Política de Privacidade</Link>.
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            className="w-full bg-[#094C7E] hover:bg-[#073b61]"
            disabled={isSaving}
            onClick={() => {
              if (!document.getElementById('legal-consent')?.checked) {
                setError('Marque a caixa para registrar seu aceite.');
                return;
              }
              acceptDocuments();
            }}
          >
            {isSaving ? 'Registrando...' : 'Aceitar e continuar'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
