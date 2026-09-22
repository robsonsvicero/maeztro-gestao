import { Phone, Mail, MapPin, CalendarDays, Music2, Pencil, Trash2, CheckCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseLocalDate } from "@/utils/dateUtils";
import { formatPhone } from "@/utils/formatUtils";

export default function StudentCard({
  student,
  onEdit,
  onDelete,
  onOpenMonthlyFees,
  onReschedule,
}) {
  if (!student) return null;

  const isInactive = student.student_status === 'inactive';

  const initials = (student.full_name || "Aluno")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";

  const formatDate = (value) => {
    if (!value) return "";

    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return value;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  return (
    <Card className="flex h-full flex-col overflow-hidden border-slate-200 bg-white shadow-lg transition-all hover:shadow-xl dark:border-slate-600 dark:bg-slate-800">
      <div className="bg-gradient-to-r from-[#094C7E] to-[#0A5A94] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight">{student.full_name}</h3>
              <p className="truncate text-xs text-blue-100">{student.instrument || "Instrumento não informado"}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide">
              {student.level || "Iniciante"}
            </div>
            {isInactive && (
              <div className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                Inativo
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 p-4 text-sm text-slate-700 dark:text-slate-200">
        {(student.monthly_payment || student.weekly_payment) && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#094C7E] dark:text-sky-300">
              {student.payment_type === 'weekly' ? 'Por aula:' : 'Mensalidade:'}
            </span>
            <span>R$ {Number(student.payment_type === 'weekly' ? student.weekly_payment : student.monthly_payment).toFixed(2)}</span>
          </div>
        )}

        {(student.payment_status || student.next_payment_date) && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#094C7E] dark:text-sky-300">Pagamento:</span>
            {student.payment_status === 'paid' ? (
              <>
                <span className="text-green-600 font-medium">Pago</span>
                {student.last_payment_date && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">em {formatDate(student.last_payment_date)}</span>
                )}
              </>
            ) : (
              <span className="font-bold text-red-600 uppercase">PENDENTE</span>
            )}
          </div>
        )}

        {student.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-[#094C7E] dark:text-sky-300" />
            <a href={`https://wa.me/55${student.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline dark:hover:text-sky-200">
              {formatPhone(student.phone)}
            </a>
          </div>
        )}

        {student.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#094C7E] dark:text-sky-300" />
            <span className="truncate">{student.email}</span>
          </div>
        )}

        {student.address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#094C7E] dark:text-sky-300" />
            <span className="line-clamp-2">{student.address}</span>
          </div>
        )}

        {(student.lesson_day || student.lesson_time) && (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#094C7E] dark:text-sky-300" />
            <span>
              {student.lesson_day || "Agenda disponível"}
              {student.lesson_time ? ` · ${student.lesson_time}` : ""}
            </span>
          </div>
        )}

        {student.notes && (
          <div className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            <div className="mb-1 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <Music2 className="h-3.5 w-3.5 text-[#094C7E] dark:text-sky-300" />
              Observações
            </div>
            <p>{student.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900/60">
        {isInactive ? (
          <Button variant="outline" size="sm" onClick={onEdit} className="col-span-2 w-full min-w-0 border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
            <Pencil className="mr-1.5 h-4 w-4 shrink-0" />
            Editar
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onOpenMonthlyFees} className="col-span-2 w-full min-w-0 border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
              <CheckCircle className="mr-1.5 h-4 w-4 shrink-0" />
              {student.payment_type === 'weekly' ? 'Pagamentos semanais' : 'Mensalidades'}
            </Button>

            {onReschedule && (
              <Button variant="outline" size="sm" onClick={onReschedule} className="col-span-2 w-full min-w-0 border-[#094C7E]/40 bg-white px-2 text-[#094C7E] hover:bg-[#094C7E]/5 dark:border-blue-400/40 dark:bg-slate-700 dark:text-blue-200 dark:hover:bg-slate-600">
                <Clock className="mr-1.5 h-4 w-4 shrink-0" />
                Reagendar Aula
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={onEdit} className="w-full min-w-0 border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
              <Pencil className="mr-1.5 h-4 w-4 shrink-0" />
              Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete} className="w-full min-w-0 px-2">
              <Trash2 className="mr-1.5 h-4 w-4 shrink-0" />
              Excluir
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
