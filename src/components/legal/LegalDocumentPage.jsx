import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { legalCompany } from '@/lib/legalDocuments';

export default function LegalDocumentPage({ title, description, sections }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 dark:bg-slate-950 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-[#094C7E] hover:underline dark:text-sky-300">
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
          <ShieldCheck className="h-6 w-6 text-[#094C7E] dark:text-sky-300" aria-hidden="true" />
        </div>
        <Card className="border-slate-200 shadow-lg dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-3xl">{title}</CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph} className="mb-2">{paragraph}</p>)}
              </section>
            ))}
            <p className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Responsável: {legalCompany.legalName} · {legalCompany.document}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
