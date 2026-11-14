export const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export const WEEKDAY_BY_NAME = {
  domingo: 0,
  sunday: 0,
  'segunda-feira': 1,
  monday: 1,
  'terça-feira': 2,
  tuesday: 2,
  'quarta-feira': 3,
  wednesday: 3,
  'quinta-feira': 4,
  thursday: 4,
  'sexta-feira': 5,
  friday: 5,
  sábado: 6,
  saturday: 6,
};

const timeToMinutes = (value) => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const addMinutesToTime = (time, duration) => {
  const start = timeToMinutes(time);
  const total = start === null ? null : start + Number(duration);
  if (!Number.isFinite(total) || total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const validateAvailabilityRows = (rows) => {
  if (!Array.isArray(rows)) return 'Informe uma lista de horários válida.';

  const intervalsByDay = new Map();
  for (const row of rows) {
    const weekday = Number(row.weekday);
    const start = timeToMinutes(row.start_time);
    const end = timeToMinutes(row.end_time);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || start === null || end === null || end <= start) {
      return 'Confira o dia e os horários de início e término.';
    }

    const intervals = intervalsByDay.get(weekday) || [];
    intervals.push({ start, end });
    intervalsByDay.set(weekday, intervals);
  }

  for (const intervals of intervalsByDay.values()) {
    intervals.sort((left, right) => left.start - right.start);
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end) {
        return 'Os horários do mesmo dia não podem se sobrepor.';
      }
    }
  }

  return null;
};

export const intersectAvailability = (studioRows = [], teacherRows = []) => {
  const studioByDay = new Map();
  for (const row of studioRows) {
    if (row.is_available === false) continue;
    const weekday = Number(row.weekday);
    const intervals = studioByDay.get(weekday) || [];
    intervals.push(row);
    studioByDay.set(weekday, intervals);
  }

  const intersections = [];
  for (const teacherRow of teacherRows) {
    const weekday = Number(teacherRow.weekday);
    if (teacherRow.is_available === false) continue;
    for (const studioRow of studioByDay.get(weekday) || []) {
      const studioStart = timeToMinutes(studioRow.start_time);
      const studioEnd = timeToMinutes(studioRow.end_time);
      const teacherStart = timeToMinutes(teacherRow.start_time);
      const teacherEnd = timeToMinutes(teacherRow.end_time);
      if ([studioStart, studioEnd, teacherStart, teacherEnd].some((time) => time === null)) continue;
      const start = Math.max(studioStart, teacherStart);
      const end = Math.min(studioEnd, teacherEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        intersections.push({
          weekday,
          start_time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
          end_time: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
        });
      }
    }
  }

  return intersections.sort((left, right) => (
    left.weekday - right.weekday || left.start_time.localeCompare(right.start_time)
  ));
};

export const slotFitsAvailability = ({ weekday, start_time, end_time }, rows = []) => {
  const start = timeToMinutes(start_time);
  const end = timeToMinutes(end_time);
  if (start === null || end === null || end <= start) return false;
  return rows.some((row) => {
    const rowStart = timeToMinutes(row.start_time);
    const rowEnd = timeToMinutes(row.end_time);
    return row.is_available !== false
      && Number(row.weekday) === Number(weekday)
      && rowStart !== null
      && rowEnd !== null
      && rowStart <= start
      && rowEnd >= end;
  });
};

export const generateTimeSlots = ({
  availabilityRows = [],
  weekday,
  durationMinutes,
  appointments = [],
  teacherUserId = null,
  accountType = 'individual',
} = {}) => {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const dayAppointments = appointments.filter((appointment) => {
    if (appointment.status === 'cancelled' || appointment.status === 'canceled') return false;
    return accountType !== 'studio'
      || !appointment.teacher_user_id
      || appointment.teacher_user_id === teacherUserId;
  }).map((appointment) => {
    const start = timeToMinutes(appointment.start_time);
    const end = timeToMinutes(appointment.end_time)
      ?? (start === null ? null : start + (Number(appointment.duration) || 60));
    return { start, end };
  }).filter((appointment) => (
    appointment.start !== null && appointment.end !== null && appointment.end > appointment.start
  ));

  const slots = [];
  for (const window of availabilityRows) {
    if (Number(window.weekday) !== Number(weekday)) continue;
    const windowStart = timeToMinutes(window.start_time);
    const windowEnd = timeToMinutes(window.end_time);
    if (windowStart === null || windowEnd === null || windowEnd <= windowStart) continue;

    for (let start = windowStart; start + duration <= windowEnd; start += duration) {
      const end = start + duration;
      if (dayAppointments.some((appointment) => start < appointment.end && appointment.start < end)) continue;
      slots.push({
        start_time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
        end_time: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      });
    }
  }
  return slots;
};
