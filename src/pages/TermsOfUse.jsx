import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { termsSections } from '@/lib/legalDocuments';

export default function TermsOfUse() {
  return (
    <LegalDocumentPage
      title="Termos de Uso"
      description="Regras para utilização do MAEZTRO Gestão."
      sections={termsSections}
    />
  );
}
