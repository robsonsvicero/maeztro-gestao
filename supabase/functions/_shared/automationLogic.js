export const AUTOMATION_TIME_ZONE = 'America/Sao_Paulo';

const weekdayNames = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const dayOrdinal = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 86400000);
};

const localParts = (date, timeZone = AUTOMATION_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: weekdayNames[values.weekday],
  };
};

const localMinuteOrdinal = (date, time) => {
  const ordinal = dayOrdinal(date);
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (ordinal === null || !match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return ordinal * 1440 + hour * 60 + minute;
};

const timeStringToMinutes = (time) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
};

const activeStudent = (student) => Boolean(student)
  && student.student_status !== 'inactive'
  && student.student_state !== 'archived';

const makeCandidate = (rule, key, title, body, severity = 'info', entityType = null, entityId = null, details = {}) => ({
  rule_key: rule.rule_key,
  dedupe_key: `${rule.rule_key}:${key}`,
  title,
  body,
  severity,
  entity_type: entityType,
  entity_id: entityId,
  details,
});

const finiteConfigNumber = (value, fallback, minimum = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};

const weeklyWindow = (rule, now, timeZone) => {
  const current = localParts(now, timeZone);
  const config = rule.config || {};
  return current.weekday === Number(config.weekday ?? 1)
    && current.hour >= Number(config.hour ?? 8);
};

const weekStartOrdinal = (date, timeZone) => {
  const current = localParts(new Date(`${date}T12:00:00Z`), timeZone);
  const ordinal = dayOrdinal(date);
  return ordinal === null ? null : ordinal - ((current.weekday + 6) % 7);
};

const dateFromOrdinal = (ordinal) => new Date(ordinal * 86400000).toISOString().slice(0, 10);

const getLessonEndTime = (lesson) => {
  if (lesson.end_time) return lesson.end_time;
  const start = timeStringToMinutes(lesson.start_time);
  if (start === null) return null;
  const end = start + (Number(lesson.duration) || 60);
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
};

const overlaps = (startA, endA, startB, endB) => Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

const getOccupancy = (lessons, availability, weekStart) => {
  const intervalsByDay = Array.from({ length: 7 }, () => []);
  let availableMinutes = 0;

  for (const row of availability) {
    if (!row.is_available) continue;
    const start = timeStringToMinutes(row.start_time);
    const end = timeStringToMinutes(row.end_time);
    if (start === null || end === null || end <= start) continue;
    intervalsByDay[(Number(row.weekday) + 6) % 7].push([start, end]);
    availableMinutes += end - start;
  }

  if (availableMinutes === 0) return { availableMinutes: 0, occupiedMinutes: 0, percentage: null };

  let occupiedMinutes = 0;
  for (let day = 0; day < 7; day += 1) {
    const date = new Date((weekStart + day) * 86400000).toISOString().slice(0, 10);
    const occupied = [];

    for (const lesson of lessons) {
      if (lesson.date !== date || lesson.status === 'cancelled') continue;
      const start = timeStringToMinutes(lesson.start_time);
      const end = timeStringToMinutes(getLessonEndTime(lesson));
      if (start === null || end === null || end <= start) continue;

      for (const [availableStart, availableEnd] of intervalsByDay[day]) {
        const overlapStart = Math.max(start, availableStart);
        const overlapEnd = Math.min(end, availableEnd);
        if (overlapEnd > overlapStart) occupied.push([overlapStart, overlapEnd]);
      }
    }

    occupied.sort((left, right) => left[0] - right[0]);
    let active = null;
    for (const interval of occupied) {
      if (!active) {
        active = [...interval];
      } else if (interval[0] <= active[1]) {
        active[1] = Math.max(active[1], interval[1]);
      } else {
        occupiedMinutes += active[1] - active[0];
        active = [...interval];
      }
    }
    if (active) occupiedMinutes += active[1] - active[0];
  }

  return {
    availableMinutes,
    occupiedMinutes,
    percentage: Math.round((occupiedMinutes / availableMinutes) * 100),
  };
};

export const getLocalDateParts = localParts;
export const getDayDifference = (fromDate, toDate) => {
  const from = dayOrdinal(fromDate);
  const to = dayOrdinal(toDate);
  return from === null || to === null ? null : to - from;
};

export const getWeekKey = (date, timeZone = AUTOMATION_TIME_ZONE) => {
  const start = weekStartOrdinal(date, timeZone);
  return start === null ? null : new Date(start * 86400000).toISOString().slice(0, 10);
};

export const evaluateAutomationRule = (rule, data, now = new Date(), timeZone = AUTOMATION_TIME_ZONE) => {
  const candidates = [];
  const config = rule.config || {};
  const current = localParts(now, timeZone);
  const todayOrdinal = dayOrdinal(current.date);
  const students = data.students || [];
  const lessons = data.lessons || [];

  const add = (...args) => candidates.push(makeCandidate(rule, ...args));
  const getStudent = (id) => students.find((student) => student.id === id);
  const upcomingLessons = lessons.filter((lesson) => (
    lesson.status === 'scheduled'
    && getDayDifference(current.date, lesson.date) !== null
    && getDayDifference(current.date, lesson.date) >= 0
  ));

  switch (rule.rule_key) {
    case 'finance.payment_due_soon': {
      const daysBefore = finiteConfigNumber(config.days_before, 3);
      for (const student of students) {
        if (!activeStudent(student) || !student.next_payment_date) continue;
        const daysUntil = getDayDifference(current.date, student.next_payment_date);
        if (daysUntil === null || daysUntil < 0 || daysUntil > daysBefore) continue;
        if (!['pending', 'overdue'].includes(student.payment_status)) continue;
        add(
          `student:${student.id}:due:${student.next_payment_date}`,
          'Vencimento próximo',
          `${student.full_name || 'Aluno'}: pagamento vence ${daysUntil === 0 ? 'hoje' : `em ${daysUntil} dia(s)`}.`,
          daysUntil === 0 ? 'warning' : 'info',
          'student',
          student.id,
          { due_date: student.next_payment_date, days_until_due: daysUntil },
        );
      }
      break;
    }
    case 'finance.payment_overdue': {
      for (const student of students) {
        if (!activeStudent(student) || !student.next_payment_date) continue;
        const daysUntil = getDayDifference(current.date, student.next_payment_date);
        if (daysUntil === null || daysUntil >= 0 || !['pending', 'overdue'].includes(student.payment_status)) continue;
        add(
          `student:${student.id}:due:${student.next_payment_date}`,
          'Pagamento em atraso',
          `${student.full_name || 'Aluno'} está com pagamento vencido desde ${student.next_payment_date}.`,
          'warning',
          'student',
          student.id,
          { due_date: student.next_payment_date, days_overdue: Math.abs(daysUntil) },
        );
      }
      break;
    }
    case 'finance.payment_received': {
      for (const student of students) {
        if (!activeStudent(student)) continue;
        const history = Array.isArray(student.payment_history) ? student.payment_history : [];
        for (const payment of history) {
          if (payment?.status !== 'paid' || String(payment.paid_at || '').slice(0, 10) !== current.date) continue;
          const paymentKey = payment.period === 'week'
            ? `week:${payment.week_start || payment.paid_at}`
            : `month:${payment.month || ''}:${payment.year || ''}:${payment.paid_at}`;
          add(
            `student:${student.id}:${paymentKey}`,
            'Recebimento registrado',
            `Pagamento de ${student.full_name || 'aluno'} registrado no financeiro.`,
            'info',
            'student',
            student.id,
            { paid_at: payment.paid_at, period: payment.period || 'month', amount: Number(payment.amount || 0) },
          );
        }
      }
      break;
    }
    case 'finance.weekly_pending_summary': {
      if (!weeklyWindow(rule, now, timeZone)) break;
      const pending = students.filter((student) => (
        activeStudent(student)
        && ['pending', 'overdue'].includes(student.payment_status)
      ));
      if (pending.length > 0) {
        const overdue = pending.filter((student) => student.payment_status === 'overdue').length;
        add(
          `week:${getWeekKey(current.date, timeZone)}`,
          'Resumo semanal de pagamentos',
          `${pending.length} aluno(s) com pagamento pendente, incluindo ${overdue} em atraso.`,
          overdue > 0 ? 'warning' : 'info',
          'workspace',
          null,
          { pending_count: pending.length, overdue_count: overdue },
        );
      }
      break;
    }
    case 'agenda.lesson_reminder': {
      const hoursBefore = finiteConfigNumber(config.hours_before, 24, 1);
      const nowMinute = todayOrdinal * 1440 + current.hour * 60 + current.minute;
      for (const lesson of lessons) {
        if (lesson.status !== 'scheduled') continue;
        const lessonMinute = localMinuteOrdinal(lesson.date, lesson.start_time);
        if (lessonMinute === null) continue;
        const minutesUntil = lessonMinute - nowMinute;
        if (minutesUntil < 0 || minutesUntil > hoursBefore * 60) continue;
        const student = getStudent(lesson.student_id);
        add(
          `lesson:${lesson.id}:reminder`,
          'Lembrete de aula',
          `${lesson.student_name || student?.full_name || 'Aluno'} tem aula em ${lesson.date} às ${lesson.start_time}.`,
          'info',
          'lesson',
          lesson.id,
          { lesson_date: lesson.date, start_time: lesson.start_time, teacher_user_id: lesson.teacher_user_id || null },
        );
      }
      break;
    }
    case 'agenda.attendance_confirmation': {
      const minutesAfter = finiteConfigNumber(config.minutes_after, 30);
      const nowMinute = todayOrdinal * 1440 + current.hour * 60 + current.minute;
      for (const lesson of lessons) {
        if (lesson.status !== 'scheduled' || lesson.attendance_status !== 'pending') continue;
        const endMinute = localMinuteOrdinal(lesson.date, getLessonEndTime(lesson));
        if (endMinute === null) continue;
        const minutesSinceEnd = nowMinute - endMinute;
        if (minutesSinceEnd < minutesAfter || minutesSinceEnd > 24 * 60) continue;
        add(
          `lesson:${lesson.id}:attendance`,
          'Confirme a presença',
          `A aula de ${lesson.student_name || 'aluno'} em ${lesson.date} ainda está sem confirmação de presença.`,
          'warning',
          'lesson',
          lesson.id,
          { attendance_status: lesson.attendance_status || 'pending' },
        );
      }
      break;
    }
    case 'agenda.cancellation_alert':
    case 'agenda.reschedule_suggestion': {
      const status = rule.rule_key.endsWith('cancellation_alert') ? 'cancelled' : 'rescheduled';
      for (const lesson of lessons) {
        const daysUntil = getDayDifference(current.date, lesson.date);
        const maximumDays = status === 'cancelled' ? 7 : 30;
        if (lesson.status !== status || daysUntil === null || daysUntil < 0 || daysUntil > maximumDays) continue;
        const student = getStudent(lesson.student_id);
        const title = status === 'cancelled' ? 'Aula cancelada' : 'Reposição sugerida';
        const body = status === 'cancelled'
          ? `A aula de ${lesson.student_name || student?.full_name || 'aluno'} em ${lesson.date} foi cancelada.`
          : `Verifique uma reposição para a aula de ${lesson.student_name || student?.full_name || 'aluno'} em ${lesson.date}.`;
        add(
          `lesson:${lesson.id}:${status}`,
          title,
          body,
          status === 'cancelled' ? 'warning' : 'info',
          'lesson',
          lesson.id,
          { lesson_date: lesson.date, status },
        );
      }
      break;
    }
    case 'students.no_upcoming_lesson': {
      const daysWithoutFuture = Math.max(1, Number(config.days_without_future ?? 7));
      for (const student of students) {
        if (!activeStudent(student)) continue;
        const hasUpcoming = upcomingLessons.some((lesson) => (
          lesson.student_id === student.id
          && getDayDifference(current.date, lesson.date) <= daysWithoutFuture
        ));
        if (hasUpcoming) continue;
        add(
          `student:${student.id}:no-upcoming:${getWeekKey(current.date, timeZone)}`,
          'Aluno sem aula futura',
          `${student.full_name || 'Aluno'} não tem aula agendada nos próximos ${daysWithoutFuture} dias.`,
          'warning',
          'student',
          student.id,
          { days_without_future: daysWithoutFuture },
        );
      }
      break;
    }
    case 'students.incomplete_enrollment': {
      const fields = Array.isArray(config.required_fields)
        ? config.required_fields
        : ['phone', 'instrument', 'lesson_day', 'lesson_time'];
      for (const student of students) {
        if (!activeStudent(student)) continue;
        const missing = fields.filter((field) => !String(student[field] ?? '').trim());
        if (missing.length === 0) continue;
        add(
          `student:${student.id}:incomplete:${getWeekKey(current.date, timeZone)}`,
          'Cadastro de aluno incompleto',
          `${student.full_name || 'Aluno'}: complete os campos ${missing.join(', ')}.`,
          'info',
          'student',
          student.id,
          { missing_fields: missing },
        );
      }
      break;
    }
    case 'students.recurring_absence': {
      const threshold = Math.max(2, Number(config.absence_threshold ?? 3));
      const windowDays = Math.max(1, Number(config.window_days ?? 30));
      const absencesByStudent = new Map();
      for (const lesson of lessons) {
        const daysAgo = getDayDifference(lesson.date, current.date);
        if (lesson.attendance_status !== 'absent' || daysAgo === null || daysAgo < 0 || daysAgo > windowDays) continue;
        if (!activeStudent(getStudent(lesson.student_id))) continue;
        absencesByStudent.set(lesson.student_id, (absencesByStudent.get(lesson.student_id) || 0) + 1);
      }
      for (const [studentId, absenceCount] of absencesByStudent) {
        if (absenceCount < threshold) continue;
        const student = getStudent(studentId);
        add(
          `student:${studentId}:absences:${getWeekKey(current.date, timeZone)}`,
          'Faltas recorrentes',
          `${student?.full_name || 'Aluno'} teve ${absenceCount} falta(s) nos últimos ${windowDays} dias.`,
          'warning',
          'student',
          studentId,
          { absence_count: absenceCount, window_days: windowDays },
        );
      }
      break;
    }
    case 'students.churn_risk': {
      const threshold = Math.max(1, Number(config.days_without_completed_lesson ?? 30));
      const lastCompleted = new Map();
      for (const lesson of lessons) {
        if (lesson.status !== 'completed') continue;
        const previous = lastCompleted.get(lesson.student_id);
        if (!previous || lesson.date > previous) lastCompleted.set(lesson.student_id, lesson.date);
      }
      for (const student of students) {
        if (!activeStudent(student) || !lastCompleted.has(student.id)) continue;
        const daysSinceLesson = getDayDifference(lastCompleted.get(student.id), current.date);
        if (daysSinceLesson === null || daysSinceLesson < threshold) continue;
        const hasUpcoming = upcomingLessons.some((lesson) => lesson.student_id === student.id);
        if (hasUpcoming) continue;
        add(
          `student:${student.id}:churn:${lastCompleted.get(student.id)}`,
          'Possível evasão',
          `${student.full_name || 'Aluno'} está há ${daysSinceLesson} dias sem aula concluída e não tem aula futura.`,
          'warning',
          'student',
          student.id,
          { last_completed_lesson: lastCompleted.get(student.id), days_without_completed_lesson: daysSinceLesson },
        );
      }
      break;
    }
    case 'studio.teacher_activity_summary': {
      if (!weeklyWindow(rule, now, timeZone)) break;
      const currentWeekStart = weekStartOrdinal(current.date, timeZone);
      const weekStart = currentWeekStart - 7;
      const weekEndDate = dateFromOrdinal(weekStart + 6);
      const weekStartDate = dateFromOrdinal(weekStart);
      const activity = new Map();
      let unassigned = 0;
      for (const lesson of lessons) {
        if (lesson.date < weekStartDate || lesson.date > weekEndDate) continue;
        if (!lesson.teacher_user_id) {
          unassigned += 1;
          continue;
        }
        const currentActivity = activity.get(lesson.teacher_user_id) || { total: 0, completed: 0, cancelled: 0 };
        currentActivity.total += 1;
        if (lesson.status === 'completed') currentActivity.completed += 1;
        if (lesson.status === 'cancelled') currentActivity.cancelled += 1;
        activity.set(lesson.teacher_user_id, currentActivity);
      }
      for (const [teacherId, stats] of activity) {
        const teacher = (data.members || []).find((member) => member.user_id === teacherId);
        add(
          `teacher:${teacherId}:week:${weekStartDate}`,
          'Resumo de atividades do professor',
          `${teacher?.full_name || 'Professor'}: ${stats.total} aula(s), ${stats.completed} concluída(s) e ${stats.cancelled} cancelada(s) na semana.`,
          'info',
          'workspace',
          null,
          { teacher_user_id: teacherId, ...stats, unassigned_lessons: unassigned },
        );
      }
      if (activity.size === 0 && unassigned > 0) {
        return {
          candidates,
          skippedReason: `${unassigned} aula(s) da semana não têm professor responsável vinculado.`,
        };
      }
      break;
    }
    case 'studio.schedule_occupancy': {
      const weekStart = weekStartOrdinal(current.date, timeZone);
      const occupancy = getOccupancy(lessons, data.availability || [], weekStart);
      if (occupancy.percentage === null) {
        return { candidates, skippedReason: 'Configure os horários de funcionamento do estúdio para calcular a ocupação.' };
      }
      const threshold = finiteConfigNumber(config.threshold_percent, 80, 1);
      if (occupancy.percentage >= threshold) {
        add(
          `week:${getWeekKey(current.date, timeZone)}:occupancy`,
          'Ocupação alta da agenda',
          `A agenda está com ${occupancy.percentage}% de ocupação, acima do limite de ${threshold}%.`,
          'warning',
          'workspace',
          null,
          { ...occupancy, threshold_percent: threshold },
        );
      }
      break;
    }
    case 'studio.admin_pending': {
      if (!weeklyWindow(rule, now, timeZone)) break;
      const pending = data.pendingAdmin || {};
      const totals = {
        invitations: Number(pending.invitations || 0),
        quotes: Number(pending.quotes || 0),
        serviceOrders: Number(pending.serviceOrders || 0),
      };
      const total = totals.invitations + totals.quotes + totals.serviceOrders;
      if (total > 0) {
        add(
          `week:${getWeekKey(current.date, timeZone)}:admin-pending`,
          'Pendências administrativas',
          `${total} pendência(s): ${totals.invitations} convite(s), ${totals.quotes} orçamento(s) e ${totals.serviceOrders} ordem(ns) de serviço.`,
          'warning',
          'workspace',
          null,
          totals,
        );
      }
      break;
    }
    case 'studio.weekly_finance_summary': {
      if (!weeklyWindow(rule, now, timeZone)) break;
      const currentWeekStart = weekStartOrdinal(current.date, timeZone);
      const weekStartDate = dateFromOrdinal(currentWeekStart - 7);
      const weekEndDate = dateFromOrdinal(currentWeekStart - 1);
      const totals = (data.transactions || []).reduce((result, transaction) => {
        if (transaction.date < weekStartDate || transaction.date > weekEndDate) return result;
        const amount = Number(transaction.amount || 0);
        if (!Number.isFinite(amount)) return result;
        if (transaction.type === 'income') result.income += amount;
        if (transaction.type === 'expense') result.expenses += amount;
        return result;
      }, { income: 0, expenses: 0 });
      totals.balance = totals.income - totals.expenses;
      const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      add(
        `week:${weekStartDate}:finance-summary`,
        'Resumo financeiro semanal',
        `Receitas: ${currency.format(totals.income)}; despesas: ${currency.format(totals.expenses)}; saldo: ${currency.format(totals.balance)}.`,
        totals.balance < 0 ? 'warning' : 'info',
        'workspace',
        null,
        totals,
      );
      break;
    }
    case 'crm.follow_up_due': {
      const nowTimestamp = now.getTime();
      for (const lead of data.crmLeads || []) {
        if (lead.stage === 'enrolled' || !lead.next_follow_up_at) continue;
        const followUpTimestamp = Date.parse(lead.next_follow_up_at);
        if (!Number.isFinite(followUpTimestamp) || followUpTimestamp > nowTimestamp) continue;
        const followUpDate = getLocalDateParts(new Date(followUpTimestamp), timeZone).date;
        add(
          `lead:${lead.id}:follow-up:${new Date(followUpTimestamp).toISOString()}`,
          'Follow-up pendente',
          `Retome o contato com ${lead.full_name || 'interessado'}; o retorno estava previsto para ${followUpDate}.`,
          'warning',
          'crm_lead',
          lead.id,
          { next_follow_up_at: lead.next_follow_up_at, stage: lead.stage },
        );
      }
      break;
    }
    default:
      return { candidates, skippedReason: 'Regra não reconhecida pelo motor de automações.' };
  }

  const scheduledWeeklyRule = [
    'finance.weekly_pending_summary',
    'studio.teacher_activity_summary',
    'studio.admin_pending',
    'studio.weekly_finance_summary',
  ].includes(rule.rule_key);

  if (scheduledWeeklyRule && !weeklyWindow(rule, now, timeZone)) {
    return { candidates, skippedReason: 'Fora do dia e horário semanal configurados.' };
  }

  const skippedReason = candidates.length > 0
    ? null
    : `Nenhum registro atende aos critérios configurados para ${current.date}.`;
  return { candidates, skippedReason };
};
