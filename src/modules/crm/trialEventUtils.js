import { getLocalDateString } from '../../utils/dateUtils.js';

export const getTrialScheduleEventsForDate = (trialEvents = [], date) => {
  const dateKey = getLocalDateString(date);

  return trialEvents
    .filter((event) => event.date === dateKey)
    .map(({ id, date: eventDate, start_time, end_time, teacher_name }) => ({
      id: `trial-${id}`,
      date: eventDate,
      start_time: start_time?.slice(0, 5) || '',
      end_time: end_time?.slice(0, 5) || '',
      teacher_name: teacher_name || 'Professor não identificado',
      status: 'scheduled',
      isTrial: true,
    }));
};
