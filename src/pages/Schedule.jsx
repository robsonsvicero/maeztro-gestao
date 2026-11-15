import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Calendar as CalendarIcon, List, CalendarDays } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLessonPaymentStatus } from "@/utils/paymentUtils";
import { lessonService } from "@/modules/lessons/services/lessonService";
import { appSettingsService } from "@/modules/settings/services/settingsService";
import { studentService } from "@/modules/students/services/studentService";
import { automationService } from "@/modules/automations/automationService";
import { availabilityService } from "@/modules/availability/services/availabilityService";
import { crmTrialService } from "@/modules/crm/services/crmService";
import { useAuth } from "@/lib/AuthContext";

import LessonForm from "../components/schedule/LessonForm";
import CalendarView from "../components/schedule/CalendarView";
import ListView from "../components/schedule/ListView";
import DayView from "../components/schedule/DayView";

export default function Schedule() {
  const { activeWorkspaceId, accountType, workspaceRole, userId } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState("day");
  const [prefilledStartTime, setPrefilledStartTime] = useState(null);
  const queryClient = useQueryClient();

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonService.list('-date'),
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentService.list(),
  });

  const { data: appSettings } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const settings = await appSettingsService.list();
      return settings[0] || null;
    },
  });

  const studioAvailabilityQuery = useQuery({
    queryKey: ['studioAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listStudio(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });

  const teacherAvailabilityQuery = useQuery({
    queryKey: ['teacherAvailability', activeWorkspaceId],
    queryFn: () => availabilityService.listTeachers(activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId),
  });
  const teacherNames = new Map(teachers.map((teacher) => [teacher.user_id, teacher.full_name]));

  const crmTrialEventsQuery = useQuery({
    queryKey: ['crmScheduleTrials', activeWorkspaceId],
    queryFn: () => crmTrialService.listForSchedule(),
    enabled: Boolean(activeWorkspaceId),
  });
  const trialEvents = (crmTrialEventsQuery.data || []).map((event) => ({
    ...event,
    teacher_name: teacherNames.get(event.teacher_user_id) || 'Professor não definido',
  }));

  const today = new Date();
  const selectedLocalDate = [
    selectedDate.getFullYear(),
    String(selectedDate.getMonth() + 1).padStart(2, '0'),
    String(selectedDate.getDate()).padStart(2, '0'),
  ].join('-');
  const todayLocalDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const visibleTrialEvents = trialEvents.filter((event) => (
    view === 'list'
      ? event.date >= todayLocalDate
      : event.date === selectedLocalDate
  ));
  const studioDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const scheduleSettings = accountType === 'studio'
    ? {
      ...appSettings,
      available_hours: (studioAvailabilityQuery.data || []).reduce((hours, row) => {
        const day = studioDayNames[Number(row.weekday)];
        if (!day) return hours;
        hours[day] = [...(hours[day] || []), {
          start: row.start_time.slice(0, 5),
          end: row.end_time.slice(0, 5),
        }];
        return hours;
      }, {}),
    }
    : appSettings;

  const lessonsWithPaymentStatus = lessons.map((lesson) => {
    const student = students.find((item) => item.id === lesson.student_id);
    return {
      ...lesson,
      teacher_name: teacherNames.get(lesson.teacher_user_id) || 'Professor não definido',
      ...(student ? { payment_status: getLessonPaymentStatus(student, lesson) } : {}),
    };
  });

  const createMutation = useMutation({
    mutationFn: (data) => lessonService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['lessons']);
      setShowForm(false);
      setEditingLesson(null);
      setPrefilledStartTime(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => lessonService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['lessons']);
      setShowForm(false);
      setEditingLesson(null);
      setPrefilledStartTime(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => lessonService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['lessons']);
    },
  });

  const handleSubmit = (data) => {
    if (editingLesson) {
      updateMutation.mutate({ id: editingLesson.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (lesson) => {
    setEditingLesson(lesson);
    setPrefilledStartTime(null);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm('Tem certeza que deseja excluir esta aula?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleStatusChange = (lesson, newStatus) => {
    updateMutation.mutate({ id: lesson.id, data: { ...lesson, status: newStatus } });
  };

  const handleNewLessonAtTime = (startTime) => {
    setEditingLesson(null);
    setPrefilledStartTime(startTime);
    setShowForm(true);
  };

  const handleLessonUpdate = (lesson, updates) => {
    updateMutation.mutate({
      id: lesson.id,
      data: {
        ...lesson,
        ...updates
      },
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-slate-900 dark:text-slate-100">
            Agenda
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gerencie suas aulas e horários
          </p>
        </div>
        {(studioAvailabilityQuery.error || teacherAvailabilityQuery.error) && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            Não foi possível carregar as disponibilidades: {
              studioAvailabilityQuery.error?.message || teacherAvailabilityQuery.error?.message
            }
          </p>
        )}
        <Button 
          onClick={() => {
            setEditingLesson(null);
            setPrefilledStartTime(null);
            setShowForm(!showForm);
          }}
          className="bg-gradient-to-r from-[#094C7E] to-[#0A5A94] hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Aula
        </Button>
      </div>

      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-800"
        >
          <SheetHeader className="mb-6 pr-8 text-left">
            <SheetTitle>{editingLesson ? 'Editar aula' : 'Nova aula'}</SheetTitle>
            <SheetDescription>
              {editingLesson ? 'Altere os dados da aula agendada.' : 'Preencha os dados para agendar uma aula.'}
            </SheetDescription>
          </SheetHeader>
          <LessonForm
            lesson={editingLesson}
            students={students}
            teachers={teachers}
            currentUserId={userId}
            workspaceRole={workspaceRole}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingLesson(null);
              setPrefilledStartTime(null);
            }}
            appSettings={appSettings}
            accountType={accountType}
            studioAvailability={studioAvailabilityQuery.data || []}
            teacherAvailability={teacherAvailabilityQuery.data || []}
            isAvailabilityLoading={studioAvailabilityQuery.isLoading || teacherAvailabilityQuery.isLoading}
            defaultDate={selectedDate}
            defaultStartTime={prefilledStartTime}
          />
        </SheetContent>
      </Sheet>

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="day" className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-700">
            <CalendarDays className="w-4 h-4 mr-2" />
            Dia
          </TabsTrigger>
          <TabsTrigger value="calendar" className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-700">
            <CalendarIcon className="w-4 h-4 mr-2" />
            Mês
          </TabsTrigger>
          <TabsTrigger value="list" className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-700">
            <List className="w-4 h-4 mr-2" />
            Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-6">
          <CalendarView
            lessons={lessonsWithPaymentStatus}
            trialEvents={trialEvents}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onLessonClick={handleEdit}
            onDeleteLesson={handleDelete}
            onStatusChange={handleStatusChange}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="day" className="mt-6">
          <DayView
            lessons={lessonsWithPaymentStatus}
            trialEvents={trialEvents}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onLessonClick={handleEdit}
            onDeleteLesson={handleDelete}
            onStatusChange={handleStatusChange}
            onLessonUpdate={handleLessonUpdate}
            onNewLesson={handleNewLessonAtTime}
            appSettings={scheduleSettings}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          <ListView
            lessons={lessonsWithPaymentStatus}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>

      {crmTrialEventsQuery.error ? (
        <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="font-semibold text-red-900 dark:text-red-100">Não foi possível carregar as aulas experimentais.</p>
          <p className="mt-1 text-red-800 dark:text-red-200">{crmTrialEventsQuery.error.message}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => crmTrialEventsQuery.refetch()}>
            Tentar novamente
          </Button>
        </section>
      ) : view === 'list' && visibleTrialEvents.length > 0 && (
        <section aria-label={view === 'list' ? 'Próximas aulas experimentais' : 'Aulas experimentais do dia'} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#094C7E] dark:text-blue-300" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              {view === 'list' ? 'Próximas aulas experimentais' : `Aulas experimentais · ${selectedDate.toLocaleDateString('pt-BR')}`}
            </h2>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {visibleTrialEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{event.title}</p>
                  {view === 'list' && <p className="text-sm text-slate-600 dark:text-slate-300">{new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR')}</p>}
                  <p className="text-sm text-slate-600 dark:text-slate-300">{event.teacher_name}</p>
                </div>
                <span className="tabular-nums text-sm text-slate-600 dark:text-slate-300">
                  {event.start_time?.slice(0, 5)}–{event.end_time?.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
