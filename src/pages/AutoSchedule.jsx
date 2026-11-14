import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, Send, Sparkles } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPaymentStatus } from "@/utils/paymentUtils";
import { lessonService } from "@/modules/lessons/services/lessonService";
import { useAuth } from "@/lib/AuthContext";
import { notificationService } from "@/modules/notifications/services/notificationService";
import { appSettingsService } from "@/modules/settings/services/settingsService";
import { studentService } from "@/modules/students/services/studentService";
import { automationService } from "@/modules/automations/automationService";
import { availabilityService } from "@/modules/availability/services/availabilityService";
import { generateTimeSlots, intersectAvailability, WEEKDAY_BY_NAME } from "@/modules/availability/availabilityUtils";

import ScheduleSuggestions from "../components/schedule/ScheduleSuggestions";
import StudentSelector from "../components/schedule/StudentSelector";

export default function AutoSchedule() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const queryClient = useQueryClient();
  const { activeWorkspaceId, accountType, userId, workspaceRole } = useAuth();

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentService.list(),
  });

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonService.list(),
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appSettingsService.list(),
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
  const teachersQuery = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId && accountType === 'studio'),
  });

  const settings = appSettings[0] || {};
  const selectedTeacher = teachersQuery.data?.find((teacher) => teacher.user_id === selectedTeacherId);
  const effectiveAvailability = accountType === 'studio'
    ? intersectAvailability(
      studioAvailabilityQuery.data || [],
      (teacherAvailabilityQuery.data || []).filter((row) => row.teacher_user_id === selectedTeacherId),
    )
    : [];
  const individualHasAvailability = Object.values(settings.available_hours || {})
    .some((slots) => Array.isArray(slots) && slots.length > 0);
  const isAvailabilityConfigured = accountType === 'studio'
    ? Boolean(selectedTeacherId)
      && (studioAvailabilityQuery.data || []).length > 0
      && (teacherAvailabilityQuery.data || []).some((row) => row.teacher_user_id === selectedTeacherId)
    : individualHasAvailability;
  const isAvailabilityLoading = accountType === 'studio'
    && (studioAvailabilityQuery.isLoading || teacherAvailabilityQuery.isLoading || teachersQuery.isLoading);

  const createLessonMutation = useMutation({
    mutationFn: async (lessonData) => {
      const lesson = await lessonService.create(lessonData);

      // Send email notification to student
      if (selectedStudent.email) {
        try {
          await notificationService.sendEmail({
            from_name: settings.professional_name || "Profissional",
            to: selectedStudent.email,
            subject: "Aula Agendada - Confirmação",
            body: `
              Olá ${selectedStudent.full_name},

              Sua aula foi agendada com sucesso!

              Detalhes:
              - Instrumento: ${lessonData.instrument}
              - Data: ${format(new Date(lessonData.date), "dd/MM/yyyy")}
              - Horário: ${lessonData.start_time} - ${lessonData.end_time}
              ${lessonData.location ? `- Local: ${lessonData.location}` : ''}

              Nos vemos em breve!

              ${settings.professional_name || "Profissional"}
            `
          });
        } catch (emailError) {
          console.error("Erro ao enviar email ao aluno:", emailError);
        }
      }

      // Send email notification to teacher
      if (settings.admin_email) {
        try {
          await notificationService.sendEmail({
            from_name: settings.professional_name || "Sistema",
            to: settings.admin_email,
            subject: "Nova Aula Agendada",
            body: `
              Nova aula agendada:

              Aluno: ${selectedStudent.full_name}
              Instrumento: ${lessonData.instrument}
              Data: ${format(new Date(lessonData.date), "dd/MM/yyyy")}
              Horário: ${lessonData.start_time} - ${lessonData.end_time}
              ${lessonData.location ? `Local: ${lessonData.location}` : ''}
            `
          });
        } catch (adminEmailError) {
          console.error("Erro ao enviar email ao admin:", adminEmailError);
        }
      }

      return lesson;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      setSelectedStudent(null);
      setSelectedSlot(null);
      setIsScheduling(false);
    },
    onError: () => {
      setIsScheduling(false);
    },
  });

  const handleConfirmSchedule = async () => {
    if (!selectedStudent || !selectedSlot) return;

    setIsScheduling(true);

    const lessonData = {
      student_id: selectedStudent.id,
      teacher_user_id: accountType === 'studio'
        ? selectedTeacherId
        : selectedStudent.teacher_user_id || null,
      attendance_status: 'pending',
      student_name: selectedStudent.full_name,
      instrument: selectedStudent.instrument,
      date: format(selectedSlot.date, 'yyyy-MM-dd'),
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
      duration: settings.default_lesson_duration || 60,
      status: "scheduled",
      payment_status: getPaymentStatus(selectedStudent.next_payment_date, selectedStudent.payment_history)
    };

    createLessonMutation.mutate(lessonData);
  };

  const getAvailableSlots = () => {
    if (!selectedStudent || !isAvailabilityConfigured) return [];

    const slots = [];
    const startDate = startOfWeek(new Date(), { locale: ptBR });
    const duration = settings.default_lesson_duration || 60;
    const personalAvailability = Object.entries(settings.available_hours || {}).flatMap(([day, windows]) => (
      Array.isArray(windows) && WEEKDAY_BY_NAME[day] !== undefined
        ? windows.map((window) => ({
          weekday: WEEKDAY_BY_NAME[day],
          start_time: window.start,
          end_time: window.end,
        }))
        : []
    ));

    // Get next 4 weeks
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) {
        const currentDate = addDays(startDate, week * 7 + day);
        if (currentDate <= new Date()) continue;
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        const dayAppointments = lessons.filter((lesson) => (
          String(lesson.date || lesson.lesson_date || '').slice(0, 10) === dateKey
        ));
        const availabilityRows = accountType === 'studio' ? effectiveAvailability : personalAvailability;
        const timeSlots = generateTimeSlots({
          availabilityRows,
          weekday: currentDate.getDay(),
          durationMinutes: duration,
          appointments: dayAppointments,
          teacherUserId: selectedTeacherId,
          accountType,
        });
        slots.push(...timeSlots.map((timeSlot) => ({
          date: currentDate,
          ...timeSlot,
          dayName: format(currentDate, 'EEEE', { locale: ptBR }),
        })));
      }
    }

    return slots;
  };

  const availableSlots = getAvailableSlots();

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-slate-900 dark:text-slate-100">
          <Sparkles className="w-8 h-8 inline-block mr-2 text-[#094C7E]" />
          Agendamento Automático
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Agende aulas dentro da disponibilidade do professor e do funcionamento do estúdio.
        </p>
      </div>

      {accountType === 'studio' && (studioAvailabilityQuery.error || teacherAvailabilityQuery.error || teachersQuery.error) && (
        <Card role="alert" className="border-red-300">
          <CardContent className="p-4 text-sm text-red-700">
            Não foi possível carregar os horários: {
              studioAvailabilityQuery.error?.message
              || teacherAvailabilityQuery.error?.message
              || teachersQuery.error?.message
            }
          </CardContent>
        </Card>
      )}

      {accountType === 'studio' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label htmlFor="schedule-teacher">Professor responsável</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={(teacherId) => {
                  setSelectedTeacherId(teacherId);
                  setSelectedSlot(null);
                }}
                disabled={Boolean(selectedStudent?.teacher_user_id) || workspaceRole === 'teacher'}
              >
                <SelectTrigger id="schedule-teacher">
                  <SelectValue placeholder="Selecione um professor" />
                </SelectTrigger>
                <SelectContent>
                  {(teachersQuery.data || []).map((teacher) => (
                    <SelectItem key={teacher.user_id} value={teacher.user_id}>
                      {teacher.full_name}{teacher.role_key === 'owner' ? ' (proprietário)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTeacher && (
                <p className="text-sm text-muted-foreground">
                  Os horários sugeridos respeitam a disponibilidade de {selectedTeacher.full_name} e do estúdio.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {((accountType === 'studio' && !isAvailabilityLoading && !isAvailabilityConfigured)
        || (accountType !== 'studio' && !individualHasAvailability)) && (
        <Card className="shadow-xl border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-6">
            <p className="text-yellow-800 dark:text-yellow-200">
              {accountType === 'studio'
                ? (studioAvailabilityQuery.data || []).length === 0
                  ? 'Configure o funcionamento do espaço na página Estúdio.'
                  : 'Configure os horários deste professor em Automações ou Configurações.'
                : 'Configure seus horários disponíveis nas Configurações para usar o agendamento automático.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <StudentSelector
          students={students}
          selectedStudent={selectedStudent}
          onSelectStudent={(student) => {
            setSelectedStudent(student);
            setSelectedTeacherId(student?.teacher_user_id || (workspaceRole === 'teacher' ? userId : ''));
            setSelectedSlot(null);
          }}
        />

        {selectedStudent && (
          <Card className="shadow-xl bg-white dark:bg-slate-800">
            <CardHeader className="border-b dark:border-slate-700">
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <User className="w-5 h-5 text-[#094C7E]" />
                Aluno Selecionado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                <div>
                  <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                    {selectedStudent.full_name}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedStudent.instrument} - {selectedStudent.level === 'iniciante' ? 'Iniciante' : selectedStudent.level === 'intermediário' ? 'Intermediário' : 'Avançado'}
                  </p>
                </div>
                {selectedStudent.lesson_day && (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <strong>Preferência:</strong> {selectedStudent.lesson_day} 
                    {selectedStudent.lesson_time && ` às ${selectedStudent.lesson_time}`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedStudent && isAvailabilityConfigured && (
        <ScheduleSuggestions
          slots={availableSlots}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
        />
      )}

      {selectedSlot && (
        <Card className="shadow-xl border-2 border-[#094C7E] bg-white dark:bg-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold mb-2 text-slate-900 dark:text-slate-100">
                  Confirmar Agendamento
                </p>
                <div className="flex gap-4 text-sm">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(selectedSlot.date, "dd/MM/yyyy")} - {selectedSlot.dayName}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {selectedSlot.start_time} - {selectedSlot.end_time}
                  </Badge>
                </div>
              </div>
              <Button
                onClick={handleConfirmSchedule}
                disabled={isScheduling || createLessonMutation.isPending}
                className="bg-gradient-to-r from-[#094C7E] to-[#0A5A94]"
              >
                <Send className="w-4 h-4 mr-2" />
                {isScheduling ? 'Agendando...' : 'Confirmar e Notificar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
