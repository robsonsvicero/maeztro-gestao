import { getLocalDateString, parseLocalDate } from './dateUtils.js';
import { getNextLessonDate } from './lessonUtils.js';

/**
 * Cria o calendar de parcelas mensais ausentes, com formato idempotente
 * para o aluno mensal. A rotina devolve entradas pendentes que faltam
 * no histórico de pagamentos e mantém o histórico inteiro preservado.
 */
export const buildMissingMonthlyPaymentHistoryEntries = (student, referenceDate = new Date(), monthsAhead = 12) => {
  const paymentHistory = Array.isArray(student.payment_history) ? student.payment_history : [];
  const paymentDay = Number(student.payment_day || 1);
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const entries = [];
  for (let index = 0; index < monthsAhead; index += 1) {
    const targetMonth = month + index + 1;
    const targetYear = Math.floor(targetMonth / 12) + year;
    const normalizedMonth = ((targetMonth - 1) % 12) + 1;

    const existing = paymentHistory.some((entry) => {
      return Number(entry.month) === normalizedMonth && Number(entry.year) === targetYear;
    });

    if (!existing) {
      entries.push({
        month: String(normalizedMonth),
        year: String(targetYear),
        status: 'pending',
        amount: Number(student.monthly_payment || 0),
        paid_at: '',
        payment_day: paymentDay,
        payment_method: 'pix',
        period: 'month',
      });
    }
  }

  return entries;
};

export const getWeekStartKey = (value) => {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return '';

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const weekday = normalized.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  normalized.setDate(normalized.getDate() + mondayOffset);

  return getLocalDateString(normalized);
};

export const buildWeeklyPaymentWeeks = (createdDate, referenceDate = new Date(), count = 12, lessonDay = '') => {
  const reference = new Date(referenceDate);
  const enrollmentDate = createdDate ? parseLocalDate(createdDate) : new Date(referenceDate);
  if (Number.isNaN(reference.getTime())) {
    throw new Error('Data de referência inválida para gerar as semanas de pagamento.');
  }
  if (Number.isNaN(enrollmentDate.getTime())) {
    throw new Error('Data de matrícula inválida para gerar as semanas de pagamento.');
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('A quantidade de semanas deve ser um inteiro não negativo.');
  }

  const currentWeek = parseLocalDate(getWeekStartKey(reference));
  const firstBillableDate = lessonDay ? getNextLessonDate(lessonDay, enrollmentDate) : enrollmentDate;
  const firstWeek = parseLocalDate(getWeekStartKey(firstBillableDate));
  const start = firstWeek > currentWeek ? firstWeek : currentWeek;

  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      weekStart: getLocalDateString(weekStart),
      weekEnd: getLocalDateString(weekEnd),
      weekStartDate: weekStart,
    };
  });
};

const getPaymentAmount = (entry, fallbackAmount) => {
  if (entry?.amount !== null && entry?.amount !== undefined && entry.amount !== '') {
    const amount = Number(entry.amount);
    if (Number.isFinite(amount)) return amount;
  }
  return Number(fallbackAmount || 0);
};

export const getMonthlyPaymentAmount = (student, month, year = new Date().getFullYear()) => {
  const paymentHistory = Array.isArray(student?.payment_history) ? student.payment_history : [];
  const paymentEntry = paymentHistory.find((entry) => (
    Number(entry?.month) === Number(month)
    && Number(entry?.year) === Number(year)
    && entry?.status === 'paid'
  ));
  return getPaymentAmount(paymentEntry, student?.monthly_payment);
};

export const getWeeklyPaymentAmount = (student, weekStart) => {
  const paymentHistory = Array.isArray(student?.payment_history) ? student.payment_history : [];
  const paymentEntry = paymentHistory.find((entry) => (
    entry?.period === 'week'
    && entry?.week_start === weekStart
    && entry?.status === 'paid'
  ));
  return getPaymentAmount(paymentEntry, student?.weekly_payment);
};

export const removeWeeklyPaymentEntry = (paymentHistory, weekStart) => (
  (Array.isArray(paymentHistory) ? paymentHistory : []).filter((entry) => (
    !(entry?.period === 'week' && entry?.week_start === weekStart)
  ))
);

export const getLessonPaymentStatus = (student, lesson, referenceDate = new Date()) => {
  if (!student) return 'pending';

  if (student.payment_type === 'weekly') {
    const weekStart = getWeekStartKey(lesson?.date || lesson?.lesson_date);
    if (!weekStart) return 'pending';

    const history = Array.isArray(student.payment_history) ? student.payment_history : [];
    if (history.some((entry) => entry?.period === 'week' && entry?.week_start === weekStart && entry?.status === 'paid')) {
      return 'paid';
    }
    if (history.some((entry) => entry?.period === 'week' && entry?.week_start === weekStart && entry?.status === 'canceled')) {
      return 'canceled';
    }

    const weekEnd = parseLocalDate(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);
    return weekEnd < today ? 'overdue' : 'pending';
  }

  return getPaymentStatus(student.next_payment_date, student.payment_history, referenceDate);
};

/**
 * Calcula a próxima data de vencimento baseada no dia de pagamento
 * e no histórico de pagamentos do aluno.
 * Varre os meses do histórico para encontrar o próximo não pago.
 */
export const getNextPaymentDate = (paymentDay, paymentStatus = 'pending', paymentHistory = [], referenceDate = new Date()) => {
  const day = Number(paymentDay);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return '';
  }

  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);
  const history = Array.isArray(paymentHistory) ? paymentHistory : [];
  
  const isMonthSettled = (month, year) => {
    return history.some((entry) => {
      const entryMonth = Number(entry.month);
      const entryYear = Number(entry.year);
      return entryMonth === month && entryYear === year && ['paid', 'canceled'].includes(entry.status);
    });
  };

  // Começar a varrer a partir do mês atual
  let currentYear = baseDate.getFullYear();
  let currentMonth = baseDate.getMonth() + 1; // 1-12

  // Limitar a busca a 24 meses à frente para evitar loops infinitos
  for (let i = 0; i < 24; i++) {
    // Verificar se este mês já foi pago ou cancelado
    const isSettled = isMonthSettled(currentMonth, currentYear);

    if (!isSettled) {
      const targetDate = new Date(currentYear, currentMonth - 1, 1);
      const lastDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
      const effectiveDay = Math.min(day, lastDayOfMonth);
      const dueDate = new Date(currentYear, currentMonth - 1, effectiveDay);

      return getLocalDateString(dueDate);
    }

    // Avançar para o próximo mês
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // Fallback: retornar o próximo mês se todos os meses anteriores estão pagos
  let fallbackYear = currentYear;
  let fallbackMonth = currentMonth;
  const lastDayOfMonth = new Date(fallbackYear, fallbackMonth - 1 + 1, 0).getDate();
  const effectiveDay = Math.min(day, lastDayOfMonth);
  return getLocalDateString(new Date(fallbackYear, fallbackMonth - 1, effectiveDay));
};

/**
 * Calcula o status da cobrança sem confundir vencimento futuro com pagamento.
 */
export const getPaymentStatus = (nextPaymentDate, paymentHistory = [], referenceDate = new Date()) => {
  const history = Array.isArray(paymentHistory) ? paymentHistory : [];
  const currentMonthEntries = history.filter((entry) => (
    Number(entry?.month) === referenceDate.getMonth() + 1
      && Number(entry?.year) === referenceDate.getFullYear()
  ));

  if (currentMonthEntries.some((entry) => entry.status === 'paid')) return 'paid';
  if (currentMonthEntries.some((entry) => entry.status === 'canceled')) return 'canceled';

  if (!nextPaymentDate) {
    return 'pending';
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const dueDate = parseLocalDate(nextPaymentDate);
  if (Number.isNaN(dueDate.getTime())) return 'pending';
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today ? 'overdue' : 'pending';
};
