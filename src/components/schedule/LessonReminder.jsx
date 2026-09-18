import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarDays, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

const REMINDER_WINDOW_MINUTES = 15;
const LATE_WINDOW_MINUTES = 10;

const getLessonStart = (lesson) => {
  const date = lesson?.date || lesson?.lesson_date;
  const time = lesson?.start_time;
  if (!date || !time) return null;

  const start = new Date(`${date}T${time}`);
  return Number.isNaN(start.getTime()) ? null : start;
};

const formatTimeRemaining = (minutesUntilStart) => {
  if (minutesUntilStart <= 0) return "começa agora";
  if (minutesUntilStart < 1) return "começa em menos de 1 minuto";
  return `começa em ${Math.ceil(minutesUntilStart)} minutos`;
};

export default function LessonReminder() {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [dismissedLessons, setDismissedLessons] = useState(() => new Set());

  const { data: lessons = [] } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => base44.entities.Lesson.list("-date"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const upcomingLesson = useMemo(() => {
    return lessons
      .filter((lesson) => !["completed", "cancelled"].includes(lesson.status))
      .map((lesson) => ({ lesson, start: getLessonStart(lesson) }))
      .filter(({ lesson, start }) => {
        if (!start || dismissedLessons.has(lesson.id)) return false;
        const minutesUntilStart = (start.getTime() - now.getTime()) / 60_000;
        return minutesUntilStart <= REMINDER_WINDOW_MINUTES && minutesUntilStart >= -LATE_WINDOW_MINUTES;
      })
      .sort((first, second) => first.start.getTime() - second.start.getTime())[0] || null;
  }, [dismissedLessons, lessons, now]);

  if (!upcomingLesson) return null;

  const { lesson, start } = upcomingLesson;
  const minutesUntilStart = (start.getTime() - now.getTime()) / 60_000;
  const dismiss = () => {
    setDismissedLessons((current) => new Set(current).add(lesson.id));
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:left-auto md:w-[380px]" role="alert" aria-live="assertive">
      <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl ring-1 ring-amber-100 dark:border-amber-800 dark:bg-slate-800 dark:ring-amber-900/40">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Aula se aproximando</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {lesson.student_name || "Aluno"} às {lesson.start_time} · {formatTimeRemaining(minutesUntilStart)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2 shrink-0" onClick={dismiss} aria-label="Dispensar aviso">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Button
          className="mt-4 w-full bg-amber-600 text-white hover:bg-amber-700"
          onClick={() => navigate(createPageUrl("Schedule"))}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Abrir agenda
        </Button>
      </div>
    </div>
  );
}
