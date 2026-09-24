import { CalendarDays, CheckCircle2, LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: CalendarDays,
    title: "Agenda organizada",
    description: "Planeje aulas, horários e compromissos em um só lugar.",
  },
  {
    icon: LayoutDashboard,
    title: "Visão do negócio",
    description: "Acompanhe alunos, finanças e atividades da sua gestão.",
  },
  {
    icon: CheckCircle2,
    title: "Rotina mais simples",
    description: "Reduza tarefas manuais e mantenha suas informações acessíveis.",
  },
];

const plans = [
  {
    name: "Plano Mensal",
    price: "R$ 29,90",
    description: "Flexibilidade para organizar sua rotina mês a mês.",
    checkoutUrl: "https://pay.kiwify.com.br/LNHszQc",
  },
  {
    name: "Plano Anual",
    price: "R$ 274,90",
    description: "Mais economia para manter sua gestão organizada durante o ano.",
    note: "Pode ser parcelado em até 12 vezes com juros. Confira o valor final e as condições na Kiwify.",
    checkoutUrl: "https://pay.kiwify.com.br/h4t2yde",
    featured: true,
  },
];

export default function PublicHome() {
  return (
    <main className="min-h-screen bg-[#f4f7fa] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/logo_horizontal.png" alt="MAEZTRO Gestão" className="h-12 object-contain" />
          </div>
          <Button asChild variant="outline">
            <Link to="/login"><LogIn className="h-4 w-4" /> Entrar</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:py-28">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#094C7E]">Gestão para profissionais</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-6xl">
            Sua rotina de aulas, sem ficar espalhada.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Horários, informações de alunos e recebimentos podem acabar distribuídos entre calendário, mensagens, planilhas e anotações. O MAEZTRO Gestão ajuda professores de música independentes a organizar a rotina profissional em um só lugar.
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Mais clareza sobre o trabalho administrativo e mais espaço para ensinar, estudar e tocar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[#094C7E] text-white hover:bg-[#073B60]">
              <Link to="/teste-gratis"><UserPlus className="h-4 w-4" /> Começar o teste grátis</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">Teste grátis por 14 dias. Sem cartão.</p>
        </div>
        <div className="rounded-[2rem] border border-[#bfd3e2] bg-[#e2edf5] p-8 shadow-sm">
          <img src="/logo_vertical.png" alt="MAEZTRO Gestão" className="mx-auto h-40 w-40 object-contain" />
          <p className="mt-6 text-center text-xl font-medium text-[#123F63]">
            Mais tempo para ensinar. Mais clareza para administrar.
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="border-l-2 border-[#8eb4cf] px-5">
              <Icon className="h-6 w-6 text-[#094C7E]" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[#bfd3e2] bg-[#eef5fa]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#094C7E]">Teste grátis</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Uma rotina profissional mais organizada
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Use o MAEZTRO para apoiar a organização de alunos, horários e informações financeiras. Solicite acesso ao teste grátis de 14 dias, sem cartão.
            </p>
            <p className="mt-4 leading-7 text-slate-600">
              Cinco dias antes de o teste terminar, você recebe avisos dentro do sistema. Para continuar usando o MAEZTRO depois dos 14 dias, é necessário contratar uma assinatura. Sem assinatura ao fim do período gratuito, o login é bloqueado.
            </p>
          </div>
          <div className="mt-8">
            <Button asChild size="lg" className="bg-[#094C7E] text-white hover:bg-[#073B60]">
              <Link to="/teste-gratis"><UserPlus className="h-4 w-4" /> Começar o teste grátis</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#094C7E]">Planos</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Escolha o plano que acompanha sua rotina
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Depois do período gratuito, continue usando o MAEZTRO com o plano mensal ou anual que fizer mais sentido para você.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                  plan.featured ? "border-[#094C7E] ring-2 ring-[#094C7E]/10" : "border-[#bfd3e2]"
                }`}
              >
                <h3 className="text-xl font-semibold text-slate-950">{plan.name}</h3>
                <p className="mt-5 text-3xl font-bold tracking-tight text-[#094C7E]">{plan.price}</p>
                <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                {plan.note && <p className="mt-4 text-xs leading-5 text-slate-500">{plan.note}</p>}
                <Button asChild className="mt-auto w-full bg-[#094C7E] text-white hover:bg-[#073B60]">
                  <a href={plan.checkoutUrl} target="_blank" rel="noopener noreferrer">
                    <UserPlus className="h-4 w-4" /> Assinar {plan.name.toLowerCase()}
                  </a>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-sm text-slate-500">
        MAEZTRO Gestão · Plataforma de organização profissional
      </footer>
    </main>
  );
}
