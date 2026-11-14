export const AUTOMATION_CATEGORIES = [
  { key: 'finance', label: 'Financeiro inteligente' },
  { key: 'agenda', label: 'Agenda inteligente' },
  { key: 'students', label: 'Gestão de alunos' },
  { key: 'studio', label: 'Gestão do estúdio' },
  { key: 'crm', label: 'CRM' },
];

export const AUTOMATION_RULES = [
  { key: 'finance.payment_due_soon', category: 'finance', label: 'Aviso de vencimento próximo', description: 'Avise a equipe sobre mensalidades que vencem em breve.', fields: [{ key: 'days_before', label: 'Dias antes do vencimento', min: 0, max: 30 }] },
  { key: 'finance.payment_overdue', category: 'finance', label: 'Cobrança em atraso', description: 'Gere um alerta interno para pagamentos vencidos ainda pendentes.' },
  { key: 'finance.payment_received', category: 'finance', label: 'Confirmação de recebimento', description: 'Registre pagamentos lançados hoje no histórico de automações.' },
  { key: 'finance.weekly_pending_summary', category: 'finance', label: 'Resumo semanal de pendências', description: 'Resuma pagamentos pendentes e em atraso para a equipe.', fields: [{ key: 'weekday', label: 'Dia da semana', min: 0, max: 6 }, { key: 'hour', label: 'Hora (0–23)', min: 0, max: 23 }] },
  { key: 'agenda.lesson_reminder', category: 'agenda', label: 'Lembrete de aula', description: 'Lembre a equipe das aulas próximas.', fields: [{ key: 'hours_before', label: 'Horas de antecedência', min: 1, max: 168 }] },
  { key: 'agenda.attendance_confirmation', category: 'agenda', label: 'Confirmação de presença', description: 'Peça à equipe para confirmar a presença depois do término da aula.', fields: [{ key: 'minutes_after', label: 'Minutos após a aula', min: 0, max: 1440 }] },
  { key: 'agenda.cancellation_alert', category: 'agenda', label: 'Aviso de cancelamento', description: 'Avise a equipe sobre aulas canceladas nos próximos sete dias.' },
  { key: 'agenda.reschedule_suggestion', category: 'agenda', label: 'Sugestão de reposição', description: 'Sugira à equipe que avalie uma reposição após remarcações.' },
  { key: 'students.no_upcoming_lesson', category: 'students', label: 'Aluno sem aula futura', description: 'Avise quando um aluno ativo não tiver aula agendada dentro do período.', fields: [{ key: 'days_without_future', label: 'Janela sem aula futura (dias)', min: 1, max: 90 }] },
  { key: 'students.incomplete_enrollment', category: 'students', label: 'Cadastro incompleto', description: 'Aponte dados básicos ausentes no cadastro de alunos ativos.' },
  { key: 'students.recurring_absence', category: 'students', label: 'Faltas recorrentes', description: 'Identifique alunos com várias faltas no período.', fields: [{ key: 'absence_threshold', label: 'Número de faltas', min: 2, max: 20 }, { key: 'window_days', label: 'Período (dias)', min: 1, max: 180 }] },
  { key: 'students.churn_risk', category: 'students', label: 'Possível evasão', description: 'Sinalize alunos sem aula concluída recente e sem aula futura.', fields: [{ key: 'days_without_completed_lesson', label: 'Dias sem aula concluída', min: 7, max: 365 }] },
  { key: 'studio.teacher_activity_summary', category: 'studio', label: 'Atividade dos professores', description: 'Resuma aulas realizadas por professor na semana anterior.', fields: [{ key: 'weekday', label: 'Dia da semana', min: 0, max: 6 }, { key: 'hour', label: 'Hora (0–23)', min: 0, max: 23 }] },
  { key: 'studio.schedule_occupancy', category: 'studio', label: 'Ocupação da agenda', description: 'Avise quando as aulas ocuparem o limite da disponibilidade cadastrada.', fields: [{ key: 'threshold_percent', label: 'Limite de ocupação (%)', min: 1, max: 100 }] },
  { key: 'studio.admin_pending', category: 'studio', label: 'Pendências administrativas', description: 'Resuma convites, orçamentos e ordens de serviço pendentes.', fields: [{ key: 'weekday', label: 'Dia da semana', min: 0, max: 6 }, { key: 'hour', label: 'Hora (0–23)', min: 0, max: 23 }] },
  { key: 'studio.weekly_finance_summary', category: 'studio', label: 'Resumo financeiro consolidado', description: 'Resuma receitas, despesas e saldo da semana anterior.', fields: [{ key: 'weekday', label: 'Dia da semana', min: 0, max: 6 }, { key: 'hour', label: 'Hora (0–23)', min: 0, max: 23 }] },
  { key: 'crm.follow_up_due', category: 'crm', label: 'Follow-up de interessado', description: 'Avise o proprietário quando chegar a hora de retomar o contato com um interessado.' },
];

export const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];
