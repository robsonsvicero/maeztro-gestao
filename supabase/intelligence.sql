-- Data needed by the deterministic management intelligence dashboard.
begin;

do $$
begin
  if to_regclass('public.student') is null
    or to_regclass('public.crm_contacts') is null then
    raise exception 'Tabelas public.student ou public.crm_contacts não encontradas. Execute as migrations anteriores antes de intelligence.sql.';
  end if;
end;
$$;

alter table public.student
  add column if not exists expected_end_date date;

comment on column public.student.expected_end_date is
  'Data prevista para encerramento das aulas, usada nos indicadores operacionais.';

create index if not exists student_workspace_expected_end_date_idx
  on public.student (workspace_id, expected_end_date)
  where expected_end_date is not null;

create or replace view public.crm_contacted_lead_ids
with (security_invoker = true)
as
select distinct workspace_id, lead_id
from public.crm_contacts;

revoke all on public.crm_contacted_lead_ids from public, anon;
grant select on public.crm_contacted_lead_ids to authenticated;

commit;
