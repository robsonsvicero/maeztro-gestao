import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { privacySections } from '@/lib/legalDocuments';

export default function PrivacyPolicy() {
  return (
    <LegalDocumentPage
      title="Política de Privacidade"
      description="Como o MAEZTRO Gestão trata dados pessoais."
      sections={privacySections}
    />
  );
}
