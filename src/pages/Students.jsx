import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getMonthlyPaymentAmount,
  getNextPaymentDate,
  getPaymentStatus,
  removeWeeklyPaymentEntry,
  getWeeklyPaymentAmount,
} from "@/utils/paymentUtils";
import { generateAutomaticLessons, deleteFutureLessons, getLessonDayOfWeek, rescheduleFutureLessons } from "@/utils/lessonUtils";
import { getLocalDateString, parseLocalDate } from "@/utils/dateUtils";
import { transactionService, receiptService } from "@/modules/finance/services/financeService";
import { lessonService } from "@/modules/lessons/services/lessonService";
import { appSettingsService } from "@/modules/settings/services/settingsService";
import { studentService } from "@/modules/students/services/studentService";
import { automationService } from "@/modules/automations/automationService";
import { useAuth } from "@/lib/AuthContext";

import StudentForm from "../components/students/StudentForm";
import StudentCard from "../components/students/StudentCard";
import StudentMonthlyFeesView from "../components/students/StudentMonthlyFeesView";
import StudentWeeklyFeesView from "../components/students/StudentWeeklyFeesView";
import ReceiptPreview from "../components/receipts/ReceiptPreview";
import RescheduleModal from "../components/students/RescheduleModal";

export default function Students() {
  const { workspaceRole, activeWorkspaceId, userId } = useAuth();
  const canManageFinancials = workspaceRole === 'owner';
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [selectedStudentForFees, setSelectedStudentForFees] = useState(null);
  const [previewReceipt, setPreviewReceipt] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [rescheduleStudent, setRescheduleStudent] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const queryClient = useQueryClient();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentService.list('-created_date'),
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appSettingsService.list(),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['workspaceTeachers', activeWorkspaceId],
    queryFn: () => automationService.listAssignableMembers(),
    enabled: Boolean(activeWorkspaceId),
  });

  const settings = appSettings[0] || {};

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const created = await studentService.create(data);
      if (!created) {
        throw new Error('Não foi possível salvar o aluno. Verifique a sessão e as permissões do Supabase.');
      }
      return created;
    },
    onSuccess: async (createdStudent) => {
      // Agendar aulas automaticamente se tiver dia/horário definido e status ativo
      if (createdStudent.lesson_day && createdStudent.lesson_time && createdStudent.student_status === 'active') {
        try {
          const durationMinutes = Number(settings.default_lesson_duration) || 60;
          const createdLessons = await generateAutomaticLessons(createdStudent, lessonService, durationMinutes);
          queryClient.invalidateQueries({ queryKey: ['lessons'] });
          toast.success(`Aluno salvo e ${createdLessons.length} aulas agendadas automaticamente!`);
        } catch (error) {
          console.error('Erro ao agendar aulas:', error);
          toast.error('Aluno salvo, mas houve erro ao agendar aulas.');
        }
      } else {
        toast.success('Aluno salvo com sucesso!');
      }

      queryClient.invalidateQueries({ queryKey: ['students'] });
      setShowForm(false);
      setEditingStudent(null);
      setSelectedStudentForFees(null);
    },
    onError: (error) => {
      toast.error(error?.message || 'Não foi possível salvar o aluno.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const updated = await studentService.update(id, data);
      if (!updated) {
        throw new Error('Não foi possível atualizar o aluno. Verifique a sessão e as permissões do Supabase.');
      }
      return updated;
    },
    onSuccess: async (updatedStudent) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      if (
        updatedStudent.lesson_day
        && updatedStudent.lesson_time
        && updatedStudent.student_status === 'active'
      ) {
        try {
          const durationMinutes = Number(settings.default_lesson_duration) || 60;
          const createdLessons = await generateAutomaticLessons(updatedStudent, lessonService, durationMinutes);
          queryClient.invalidateQueries({ queryKey: ['lessons'] });
          if (createdLessons.length > 0) {
            toast.success(`Dados atualizados e ${createdLessons.length} aulas agendadas automaticamente!`);
          } else {
            toast.success('Dados do aluno atualizados com sucesso!');
          }
        } catch (error) {
          console.error('Erro ao agendar aulas:', error);
          toast.error(error?.message || 'Dados atualizados, mas não foi possível agendar as aulas automaticamente.');
        }
      } else {
        toast.success('Dados do aluno atualizados com sucesso!');
      }
      setShowForm(false);
      setEditingStudent(null);
      setSelectedStudentForFees(null);
    },
    onError: (error) => {
      toast.error(error?.message || 'Não foi possível atualizar o aluno.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (student) => {
      const updated = await studentService.update(student.id, {
        student_status: 'inactive',
        student_state: 'archived',
      });

      if (!updated) {
        throw new Error('Não foi possível arquivar o aluno. Verifique as permissões do Supabase.');
      }

      const deletedFutureLessons = await deleteFutureLessons(student.id, lessonService);

      return { updated, deletedFutureLessons };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['lessons'] });

      const deleted = result?.deletedFutureLessons || 0;
      if (deleted > 0) {
        toast.success(`Aluno arquivado com sucesso. ${deleted} agendamento(s) futuro(s) removido(s). Recebimentos e recibos permanecem no histórico financeiro.`);
      } else {
        toast.success('Aluno arquivado com sucesso. Recebimentos e recibos permanecem no histórico financeiro.');
      }
    },
    onError: (error) => {
      toast.error(error?.message || 'Não foi possível arquivar o aluno.');
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (data) => {
    // Para criação de novo aluno
    if (!editingStudent) {
      createMutation.mutate(data);
      return;
    }

    // Para atualização de aluno existente
    const wasActive = editingStudent.student_status === 'active';
    const isNowInactive = data.student_status === 'inactive';

    // Se mudou de ativo para inativo, deletar aulas futuras
    if (wasActive && isNowInactive) {
      deleteFutureLessons(editingStudent.id, lessonService).then((deletedCount) => {
        if (deletedCount > 0) {
          toast.info(`${deletedCount} aula(s) futura(s) cancelada(s)`);
          queryClient.invalidateQueries({ queryKey: ['lessons'] });
        }
      }).catch((error) => {
        console.error('Erro ao deletar aulas:', error);
        toast.error(error?.message || 'Não foi possível cancelar as aulas futuras.');
      });
    }

    updateMutation.mutate({ id: editingStudent.id, data });
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setShowForm(true);
  };

  const handleDelete = (student) => {
    if (confirm(`Tem certeza que deseja arquivar o aluno ${student.full_name}? Os recibos e pagamentos receberão um histórico preservado, e o aluno sairá da lista ativa.`)) {
      deleteMutation.mutate(student);
    }
  };

  const handleReschedule = async (newDay, newTime) => {
    if (!rescheduleStudent) return;
    setIsRescheduling(true);
    try {
      const durationMinutes = Number(settings.default_lesson_duration) || 60;
      const { deletedCount, createdCount } = await rescheduleFutureLessons(
        rescheduleStudent,
        newDay,
        newTime,
        { lessonService, studentService },
        durationMinutes,
      );
      // refetchQueries força recarregamento imediato dos dados do servidor
      await queryClient.refetchQueries({ queryKey: ['students'] });
      await queryClient.refetchQueries({ queryKey: ['lessons'] });
      toast.success(
        `Reagendamento concluído! ${deletedCount} aula(s) cancelada(s) e ${createdCount} nova(s) criada(s).`
      );
      setRescheduleStudent(null);
    } catch (error) {
      console.error('Erro ao reagendar aulas:', error);
      toast.error(error?.message || 'Não foi possível reagendar as aulas.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const createReceiptForStudent = async (student, monthNumber, paymentDate = getLocalDateString(), paymentMethod = 'pix') => {
    const year = new Date().getFullYear();
    const amount = getMonthlyPaymentAmount(student, monthNumber, year);
    const monthLabel = new Date(year, monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const receiptPayload = {
      receipt_number: `REC-${Date.now()}`,
      student_id: student.id,
      student_name: student.full_name,
      amount,
      description: `Mensalidade ${monthLabel}`,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      status: 'paid',
    };

    const createdReceipt = await receiptService.create(receiptPayload);

    return createdReceipt;
  };

  const handleRegisterPayment = async (student, monthNumber = new Date().getMonth() + 1, paymentInfo = {}) => {
    const today = getLocalDateString();
    const paymentEntry = {
      month: String(monthNumber),
      year: String(new Date().getFullYear()),
      status: 'paid',
      paid_at: today,
      amount: Number(student.monthly_payment || 0),
      payment_method: paymentInfo.paymentMethod || 'pix',
    };

    const paymentHistory = Array.isArray(student.payment_history) ? [...student.payment_history] : [];
    const existingIndex = paymentHistory.findIndex((entry) => Number(entry.month) === monthNumber && Number(entry.year) === new Date().getFullYear());

    if (existingIndex >= 0) {
      paymentHistory[existingIndex] = paymentEntry;
    } else {
      paymentHistory.push(paymentEntry);
    }

    // Recalcular o próximo vencimento considerando o novo pagamento
    const nextPaymentDate = getNextPaymentDate(
      student.payment_day,
      'pending',
      paymentHistory,
    );

    // Recalcular o status de pagamento
    const paymentStatus = getPaymentStatus(nextPaymentDate, paymentHistory);

    const updatedStudent = {
      ...student,
      payment_status: paymentStatus,
      last_payment_date: today,
      next_payment_date: nextPaymentDate,
      payment_history: paymentHistory,
    };

    const monthLabel = new Date(new Date().getFullYear(), monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    await transactionService.create({
      type: 'income',
      category: 'monthly_payment',
      amount: Number(student.monthly_payment || 0),
      description: `Mensalidade ${monthLabel}`,
      date: today,
      payment_method: paymentInfo.paymentMethod || 'pix',
      student_name: student.full_name,
      student_id: student.id,
      payment_month: String(monthNumber),
      payment_year: String(new Date().getFullYear()),
    });

    await studentService.update(student.id, updatedStudent);
    queryClient.invalidateQueries(['students']);
    return updatedStudent;
  };

  const handlePayMonth = async (student, monthNumber, paymentInfo = {}) => {
    const { generateReceipt = false, paymentMethod = 'pix' } = paymentInfo;
    const updatedStudent = await handleRegisterPayment(student, monthNumber, { paymentMethod });

    // Atualizar o estado com os dados atualizados imediatamente
    setSelectedStudentForFees(updatedStudent);

    if (generateReceipt) {
      const receipt = await createReceiptForStudent(updatedStudent, monthNumber, getLocalDateString(), paymentMethod);
      queryClient.invalidateQueries(['receipts']);
      setPreviewReceipt(receipt);
    }
  };

  const syncWeeklyLessonsPaymentStatus = async (student, week, status = 'paid') => {
    if (!student?.id || !week?.weekStart || !week?.weekEnd) return;

    const lessons = await lessonService.list();
    const start = parseLocalDate(week.weekStart);
    const end = parseLocalDate(week.weekEnd);

    const matchingLessons = (lessons || []).filter((lesson) => {
      if (lesson.student_id !== student.id) return false;
      const lessonDate = lesson.date || lesson.lesson_date;
      if (!lessonDate) return false;
      const date = parseLocalDate(lessonDate);
      return date >= start && date <= end;
    });

    await Promise.all(matchingLessons.map(async (lesson) => {
      await lessonService.update(lesson.id, {
        ...lesson,
        payment_status: status,
      });
    }));

    await queryClient.invalidateQueries({ queryKey: ['lessons'] });
  };

  const createWeeklyReceiptForStudent = async (student, week, paymentDate = getLocalDateString(), paymentMethod = 'pix') => {
    return receiptService.create({
      receipt_number: `REC-${Date.now()}`,
      student_id: student.id,
      student_name: student.full_name,
      amount: getWeeklyPaymentAmount(student, week.weekStart),
      description: `Aulas da semana de ${new Date(`${week.weekStart}T00:00:00`).toLocaleDateString('pt-BR')}`,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      status: 'paid',
    });
  };

  const handleRegisterWeeklyPayment = async (student, week, paymentInfo = {}) => {
    const today = getLocalDateString();
    const paymentHistory = Array.isArray(student.payment_history) ? [...student.payment_history] : [];
    const paymentEntry = {
      period: 'week',
      week_start: week.weekStart,
      week_end: week.weekEnd,
      status: 'paid',
      paid_at: today,
      amount: Number(student.weekly_payment || 0),
      payment_method: paymentInfo.paymentMethod || 'pix',
    };
    const existingIndex = paymentHistory.findIndex((entry) => entry.week_start === week.weekStart);
    if (existingIndex >= 0) paymentHistory[existingIndex] = paymentEntry;
    else paymentHistory.push(paymentEntry);

    await transactionService.create({
      type: 'income',
      category: 'lesson_payment',
      amount: Number(student.weekly_payment || 0),
      description: `Aulas da semana de ${new Date(`${week.weekStart}T00:00:00`).toLocaleDateString('pt-BR')}`,
      date: today,
      payment_method: paymentInfo.paymentMethod || 'pix',
      student_name: student.full_name,
      student_id: student.id,
    });

    const updatedStudent = await studentService.update(student.id, {
      payment_history: paymentHistory,
      payment_status: 'paid',
      last_payment_date: today,
    });

    await syncWeeklyLessonsPaymentStatus(updatedStudent, week, 'paid');

    queryClient.invalidateQueries({ queryKey: ['students'] });
    setSelectedStudentForFees(updatedStudent);

    if (paymentInfo.generateReceipt) {
      const receipt = await createWeeklyReceiptForStudent(updatedStudent, week, today, paymentInfo.paymentMethod);
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setPreviewReceipt(receipt);
    }
  };

  const handleGenerateWeeklyReceipt = async (student, week, paymentMethod = 'pix') => {
    await syncWeeklyLessonsPaymentStatus(student, week, 'paid');
    const receipt = await createWeeklyReceiptForStudent(student, week, getLocalDateString(), paymentMethod);
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
    setPreviewReceipt(receipt);
  };

  const handleDeletePayment = async (student, monthNumber) => {
    const year = new Date().getFullYear();
    const paymentHistory = Array.isArray(student.payment_history) ? [...student.payment_history] : [];
    const filteredHistory = paymentHistory.filter(
      (entry) => !(Number(entry.month) === monthNumber && Number(entry.year) === year)
    );

    // Recalcular próximo vencimento sem o pagamento removido
    const nextPaymentDate = getNextPaymentDate(
      student.payment_day,
      'pending',
      filteredHistory,
    );

    const updatedStudent = {
      ...student,
      payment_history: filteredHistory,
      next_payment_date: nextPaymentDate,
      last_payment_date: filteredHistory.length > 0
        ? filteredHistory.reduce((latest, entry) => entry.paid_at > latest ? entry.paid_at : latest, '')
        : null,
    };

    await studentService.update(student.id, updatedStudent);
    queryClient.invalidateQueries(['students']);
    setSelectedStudentForFees(updatedStudent);
    toast.success('Pagamento removido. Mensalidade voltou para aberto.');
  };

  const handleDeleteWeeklyPayment = async (student, week) => {
    try {
      const paymentHistory = Array.isArray(student.payment_history) ? student.payment_history : [];
      const filteredHistory = removeWeeklyPaymentEntry(paymentHistory, week.weekStart);
      if (filteredHistory.length === paymentHistory.length) return;

      await syncWeeklyLessonsPaymentStatus(student, week, 'pending');

      const lastPaymentDate = filteredHistory.reduce((latest, entry) => (
        entry?.status === 'paid' && entry?.paid_at > latest ? entry.paid_at : latest
      ), '');
      const hasPaidPayments = filteredHistory.some((entry) => entry?.status === 'paid');
      const updatedStudent = await studentService.update(student.id, {
        ...student,
        payment_history: filteredHistory,
        payment_status: hasPaidPayments ? 'paid' : 'pending',
        last_payment_date: lastPaymentDate || null,
      });

      if (!updatedStudent) {
        throw new Error('Não foi possível atualizar o histórico de pagamentos do aluno.');
      }

      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedStudentForFees(updatedStudent);
      toast.success('Pagamento removido. A semana voltou para aberto.');
    } catch (error) {
      console.error('Erro ao excluir pagamento semanal:', error);
      toast.error(error?.message || 'Não foi possível excluir o pagamento semanal.');
    }
  };

  const handleGenerateReceipt = async (student, monthNumber, paymentMethod = 'pix') => {
    const receipt = await createReceiptForStudent(student, monthNumber, getLocalDateString(), paymentMethod);
    queryClient.invalidateQueries(['receipts']);
    setPreviewReceipt(receipt);
  };

  const filteredStudents = students
    .filter((student) => student.student_state !== 'archived')
    .filter(student =>
      student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.instrument?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const sortedStudents = [...filteredStudents].sort((firstStudent, secondStudent) => {
    if (sortBy === 'lesson_day') {
      const firstDay = getLessonDayOfWeek(firstStudent.lesson_day);
      const secondDay = getLessonDayOfWeek(secondStudent.lesson_day);

      if (firstDay !== undefined || secondDay !== undefined) {
        if (firstDay === undefined) return 1;
        if (secondDay === undefined) return -1;
        if (firstDay !== secondDay) return firstDay - secondDay;
      }
    }

    const fieldBySort = {
      name: 'full_name',
      level: 'level',
      instrument: 'instrument',
      lesson_day: 'lesson_day',
    };
    const field = fieldBySort[sortBy];
    const firstValue = firstStudent[field] || '';
    const secondValue = secondStudent[field] || '';

    if (!firstValue && secondValue) return 1;
    if (firstValue && !secondValue) return -1;
    if (!firstValue && !secondValue) return 0;
    return firstValue.localeCompare(secondValue, 'pt-BR', { sensitivity: 'base', numeric: true });
  });

  if (selectedStudentForFees) {
    return (
      <div className="relative">
        {selectedStudentForFees.payment_type === 'weekly' ? (
          <StudentWeeklyFeesView
            student={selectedStudentForFees}
            onBack={() => { setSelectedStudentForFees(null); setPreviewReceipt(null); }}
            onPay={(week, paymentInfo) => handleRegisterWeeklyPayment(selectedStudentForFees, week, paymentInfo)}
            onDeletePayment={(week) => handleDeleteWeeklyPayment(selectedStudentForFees, week)}
            onGenerateReceipt={(week) => handleGenerateWeeklyReceipt(selectedStudentForFees, week)}
          />
        ) : (
          <StudentMonthlyFeesView
            student={selectedStudentForFees}
            onBack={() => { setSelectedStudentForFees(null); setPreviewReceipt(null); }}
            onPay={(monthNumber, paymentInfo) => handlePayMonth(selectedStudentForFees, monthNumber, paymentInfo)}
            onDeletePayment={(monthNumber) => handleDeletePayment(selectedStudentForFees, monthNumber)}
            onGenerateReceipt={(monthNumber) => handleGenerateReceipt(selectedStudentForFees, monthNumber)}
          />
        )}

        {previewReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-900">
              <ReceiptPreview
                receipt={previewReceipt}
                companySettings={settings}
                onClose={() => {
                  setPreviewReceipt(null);
                  queryClient.invalidateQueries(['students']);
                  setSelectedStudentForFees((currentStudent) => currentStudent ? { ...currentStudent } : currentStudent);
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (previewReceipt) {
    return (
      <ReceiptPreview
        receipt={previewReceipt}
        companySettings={settings}
        onClose={() => {
          setPreviewReceipt(null);
          queryClient.invalidateQueries(['students']);
        }}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-slate-900 dark:text-slate-100">
            Alunos
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gerencie seus alunos de música
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingStudent(null);
            setShowForm(!showForm);
          }}
          className="bg-gradient-to-r from-[#094C7E] to-[#0A5A94] hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Aluno
        </Button>
      </div>

      {showForm && (
        <Card className="p-6 shadow-xl bg-white dark:bg-slate-800">
          <StudentForm
            student={editingStudent}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            canEditFinancialFields={canManageFinancials}
            teachers={teachers}
            currentUserId={userId}
            workspaceRole={workspaceRole}
            onCancel={() => {
              setShowForm(false);
              setEditingStudent(null);
            }}
          />
        </Card>
      )}

      <Card className="p-4 shadow-lg bg-white dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Buscar por nome ou instrumento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger aria-label="Ordenar alunos" className="w-full sm:w-52 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome</SelectItem>
              <SelectItem value="level">Nível</SelectItem>
              <SelectItem value="instrument">Instrumento</SelectItem>
              <SelectItem value="lesson_day">Dia da aula</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-6 animate-pulse bg-white dark:bg-slate-800">
              <div className="h-32 rounded bg-slate-200 dark:bg-slate-700" />
            </Card>
          ))}
        </div>
      ) : sortedStudents.length === 0 ? (
        <Card className="p-12 shadow-xl bg-white dark:bg-slate-800">
          <p className="text-center text-slate-500 dark:text-slate-400">
            Nenhum aluno encontrado
          </p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedStudents.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              onEdit={() => handleEdit(student)}
              onDelete={() => handleDelete(student)}
              onOpenMonthlyFees={canManageFinancials ? () => setSelectedStudentForFees(student) : undefined}
              showFinancialInfo={canManageFinancials}
              onReschedule={student.lesson_day || student.lesson_time ? () => setRescheduleStudent(student) : undefined}
            />
          ))}
        </div>
      )}

      {rescheduleStudent && (
        <RescheduleModal
          student={rescheduleStudent}
          isLoading={isRescheduling}
          onConfirm={handleReschedule}
          onClose={() => setRescheduleStudent(null)}
        />
      )}
    </div>
  );
}
