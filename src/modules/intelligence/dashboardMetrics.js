import { getLocalDateString, parseLocalDate } from '../../utils/dateUtils.js';
import { getWeekStartKey } from '../../utils/paymentUtils.js';

const CLOSED_LEAD_STAGES = new Set(['enrolled', 'not_converted']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const dateKey = (value) => {
  if (!value) return null;
  const date = parseLocalDate(value);
  return Number.isNaN(date.getTime()) ? null : getLocalDateString(date);
};

const isActiveStudent = (student) => (
  student.student_status !== 'inactive' && student.student_state !== 'archived'
);

const isClosedLead = (lead) => CLOSED_LEAD_STAGES.has(lead.stage);

const amountOf = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const timeToMinutes = (value) => {
  if (typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const eventInterval = (event) => {
  const start = timeToMinutes(event.start_time);
  if (start === null) return null;
  const endFromField = timeToMinutes(event.end_time);
  const duration = Number(event.duration);
  const end = endFromField !== null ? endFromField : start + duration;
  return end > start ? { start, end } : null;
};

const occupiedIntervals = (events, startLimit, endLimit) => {
  const intervals = events
    .map(eventInterval)
    .filter(Boolean)
    .map(({ start, end }) => ({
      start: Math.max(start, startLimit),
      end: Math.min(end, endLimit),
    }))
    .filter(({ start, end }) => end > start)
    .sort((left, right) => left.start - right.start);

  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
};

const buildFreeIntervals = (events, startLimit, endLimit) => {
  const booked = occupiedIntervals(events, startLimit, endLimit);
  const free = [];
  let cursor = startLimit;
  for (const interval of booked) {
    if (interval.start > cursor) free.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < endLimit) free.push({ start: cursor, end: endLimit });
  return free;
};

const formatTime = (minutes) => (
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
);

const minutesUntilEndOfToday = (now) => now.getHours() * 60 + now.getMinutes();

const WEEKDAY_BY_KEY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const normalizePersonalAvailability = (availableHours = {}) => (
  Object.entries(availableHours || {}).flatMap(([day, slots]) => {
    const weekday = WEEKDAY_BY_KEY[day];
    if (weekday === undefined || !Array.isArray(slots)) return [];
    return slots.map((slot) => ({
      weekday,
      is_available: Boolean(slot?.start && slot?.end),
      start_time: slot?.start || null,
      end_time: slot?.end || null,
    }));
  })
);

const createMonthlyCharges = (students, todayKey, endExclusiveKey) => {
  const charges = [];
  for (const student of students) {
    if (!isActiveStudent(student) || student.payment_type === 'weekly') continue;
    const dueDate = dateKey(student.next_payment_date);
    if (!dueDate || dueDate >= endExclusiveKey) continue;

    const due = parseLocalDate(dueDate);
    const dueMonth = due.getMonth() + 1;
    const dueYear = due.getFullYear();
    const monthEntries = (Array.isArray(student.payment_history) ? student.payment_history : []).filter((entry) => (
      entry?.period !== 'week'
      && Number(entry?.month) === dueMonth
      && Number(entry?.year) === dueYear
    ));
    if (monthEntries.some((entry) => ['paid', 'canceled'].includes(entry?.status))) continue;
    const paymentEntry = monthEntries.find((entry) => entry?.status === 'pending');

    charges.push({
      key: `monthly:${student.id}:${dueDate}`,
      studentId: student.id,
      studentName: student.full_name || 'Aluno',
      date: dueDate,
      amount: amountOf(paymentEntry?.amount ?? student.monthly_payment),
      label: 'Mensalidade',
      status: dueDate < todayKey ? 'overdue' : 'pending',
      forecast: dueDate >= todayKey,
    });
  }
  return charges;
};

const createWeeklyCharges = (students, lessons, todayKey, endExclusiveKey) => {
  const studentsById = new Map(
    students
      .filter((student) => isActiveStudent(student) && student.payment_type === 'weekly')
      .map((student) => [student.id, student]),
  );
  const weeks = new Map();

  for (const lesson of lessons) {
    const student = studentsById.get(lesson.student_id);
    const lessonDate = dateKey(lesson.date || lesson.lesson_date);
    if (!student || !lessonDate || lessonDate >= endExclusiveKey || CANCELED_STATUSES.has(lesson.status)) continue;

    const weekStart = getWeekStartKey(lessonDate);
    if (!weekStart) continue;
    const key = `${student.id}:${weekStart}`;
    const week = weeks.get(key) || { student, weekStart, lessons: [] };
    week.lessons.push({ ...lesson, lessonDate });
    weeks.set(key, week);
  }

  const charges = [];
  for (const { student, weekStart, lessons: weekLessons } of weeks.values()) {
    const paymentHistory = Array.isArray(student.payment_history) ? student.payment_history : [];
    const historyEntries = paymentHistory.filter((entry) => (
      entry?.period === 'week' && entry?.week_start === weekStart
    ));
    if (historyEntries.some((entry) => ['paid', 'canceled'].includes(entry?.status))) continue;
    if (weekLessons.some((lesson) => lesson.payment_status === 'paid')) continue;
    if (weekLessons.every((lesson) => lesson.payment_status === 'canceled')) continue;

    const weekEnd = addDays(parseLocalDate(weekStart), 6);
    const weekEndKey = getLocalDateString(weekEnd);
    const hasUpcomingLesson = weekLessons.some((lesson) => lesson.lessonDate >= todayKey);
    const isInForecast = weekEndKey >= todayKey && hasUpcomingLesson;
    charges.push({
      key: `weekly:${student.id}:${weekStart}`,
      studentId: student.id,
      studentName: student.full_name || 'Aluno',
      date: weekStart,
      weekStart,
      weekEnd: weekEndKey,
      amount: amountOf(student.weekly_payment),
      label: 'Aulas da semana',
      status: weekEndKey < todayKey ? 'overdue' : 'pending',
      forecast: isInForecast,
    });
  }
  return charges;
};

const getAppointments = (lessons, trials, startKey, endExclusiveKey) => {
  const lessonEvents = lessons
    .filter((lesson) => {
      const date = dateKey(lesson.date || lesson.lesson_date);
      return date && date >= startKey && date < endExclusiveKey && !CANCELED_STATUSES.has(lesson.status);
    })
    .map((lesson) => ({
      ...lesson,
      date: dateKey(lesson.date || lesson.lesson_date),
      teacherId: lesson.teacher_user_id,
      type: 'lesson',
    }));
  const trialEvents = trials
    .filter((trial) => {
      const date = dateKey(trial.trial_date || trial.date);
      return date && date >= startKey && date < endExclusiveKey && !CANCELED_STATUSES.has(trial.status);
    })
    .map((trial) => ({
      ...trial,
      date: dateKey(trial.trial_date || trial.date),
      teacherId: trial.teacher_user_id,
      type: 'trial',
    }));
  return [...lessonEvents, ...trialEvents];
};

const createTeacherAvailability = (teachers, availability, appointments, today, horizonDays) => {
  const availableDays = new Map();
  for (const row of availability) {
    if (!row.is_available) continue;
    const weekday = Number(row.weekday);
    const dayRows = availableDays.get(weekday) || [];
    dayRows.push(row);
    availableDays.set(weekday, dayRows);
  }
  const appointmentsByTeacherDay = new Map();
  for (const appointment of appointments) {
    if (!appointment.teacherId) continue;
    const key = `${appointment.teacherId}:${appointment.date}`;
    const dayAppointments = appointmentsByTeacherDay.get(key) || [];
    dayAppointments.push(appointment);
    appointmentsByTeacherDay.set(key, dayAppointments);
  }
  const startKey = getLocalDateString(today);
  const endExclusiveKey = getLocalDateString(addDays(today, horizonDays));

  const availableTeachers = teachers.map((teacher) => {
    let availableMinutes = 0;
    let nextSlot = null;
    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = addDays(today, offset);
      const dateString = getLocalDateString(date);
      const dayAvailability = availableDays.get(date.getDay()) || [];
      if (dayAvailability.length === 0) continue;
      const dayAppointments = appointmentsByTeacherDay.get(`${teacher.user_id}:${dateString}`) || [];
      const openingIntervals = occupiedIntervals(dayAvailability, 0, 24 * 60);
      for (const opening of openingIntervals) {
        const effectiveStart = offset === 0
          ? Math.max(opening.start, minutesUntilEndOfToday(today))
          : opening.start;
        if (effectiveStart >= opening.end) continue;

        const freeIntervals = buildFreeIntervals(dayAppointments, effectiveStart, opening.end);
        for (const interval of freeIntervals) {
          const duration = interval.end - interval.start;
          if (duration <= 0) continue;
          availableMinutes += duration;
          if (!nextSlot) {
            nextSlot = {
              date: dateString,
              startTime: formatTime(interval.start),
              endTime: formatTime(interval.end),
            };
          }
        }
      }
    }
    return {
      userId: teacher.user_id,
      name: teacher.full_name || 'Professor',
      availableHours: Math.round((availableMinutes / 60) * 10) / 10,
      nextSlot,
    };
  }).filter((teacher) => teacher.availableHours > 0)
    .sort((left, right) => right.availableHours - left.availableHours);

  return {
    configured: availability.some((row) => row.is_available),
    availableTeachers,
    startDate: startKey,
    endDateExclusive: endExclusiveKey,
  };
};

export const getDashboardIntelligence = ({
  students = [],
  lessons = [],
  trials = [],
  leads = [],
  contactLeadIds = [],
  availability = [],
  teachers = [],
  accountType = 'studio',
  now = new Date(),
  horizonDays = 15,
} = {}) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = getLocalDateString(today);
  const endExclusive = addDays(today, horizonDays);
  const endExclusiveKey = getLocalDateString(endExclusive);
  const activeStudents = students.filter(isActiveStudent);

  const endingStudents = activeStudents
    .filter((student) => {
      const endDate = dateKey(student.expected_end_date);
      return endDate && endDate >= todayKey && endDate < endExclusiveKey;
    })
    .map((student) => ({
      id: student.id,
      name: student.full_name || 'Aluno',
      date: dateKey(student.expected_end_date),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const forecastCharges = [
    ...createMonthlyCharges(activeStudents, todayKey, endExclusiveKey),
    ...createWeeklyCharges(activeStudents, lessons, todayKey, endExclusiveKey),
  ].sort((left, right) => left.date.localeCompare(right.date));
  const pendingCharges = forecastCharges;
  const upcomingForecastCharges = forecastCharges.filter((charge) => charge.forecast);

  const contactedLeadIds = new Set(contactLeadIds.map((entry) => (
    typeof entry === 'string' ? entry : entry.lead_id
  )));
  const openLeads = leads.filter((lead) => !isClosedLead(lead));
  const leadsWithoutContact = openLeads
    .filter((lead) => !contactedLeadIds.has(lead.id))
    .sort((left, right) => (left.full_name || '').localeCompare(right.full_name || ''));
  const endOfToday = addDays(today, 1);
  const followUpsDue = openLeads
    .filter((lead) => {
      if (!lead.next_follow_up_at) return false;
      const followUpAt = new Date(lead.next_follow_up_at);
      return !Number.isNaN(followUpAt.getTime()) && followUpAt < endOfToday;
    })
    .sort((left, right) => new Date(left.next_follow_up_at) - new Date(right.next_follow_up_at));

  let appointments = getAppointments(lessons, trials, todayKey, endExclusiveKey);
  if (accountType === 'individual' && teachers.length === 1) {
    const teacherId = teachers[0].user_id;
    appointments = appointments.map((appointment) => (
      appointment.teacherId
        ? appointment
        : { ...appointment, teacherId }
    ));
  }
  const occupiedMinutes = appointments.reduce((total, appointment) => {
    const interval = eventInterval(appointment);
    return total + (interval ? interval.end - interval.start : 0);
  }, 0);
  const teacherAvailability = createTeacherAvailability(
    teachers,
    availability,
    appointments,
    now,
    horizonDays,
  );

  return {
    startDate: todayKey,
    endDateExclusive: endExclusiveKey,
    activeStudentCount: activeStudents.length,
    endingStudents,
    pendingCharges,
    pendingChargeCount: pendingCharges.length,
    pendingChargeAmount: pendingCharges.reduce((total, charge) => total + charge.amount, 0),
    forecastCharges: upcomingForecastCharges,
    forecastAmount: upcomingForecastCharges.reduce((total, charge) => total + charge.amount, 0),
    leadsWithoutContact,
    followUpsDue,
    occupiedHours: Math.round((occupiedMinutes / 60) * 10) / 10,
    occupiedAppointmentCount: appointments.length,
    teacherAvailability,
  };
};
