-- Auditoria de objetos esperados (CRM -> Agenda -> Renovacao)

with expected_tables(name) as (
  values
    ('leads'),
    ('lead_interactions'),
    ('lead_stage_history'),
    ('appointments'),
    ('appointment_waitlist'),
    ('waitlist_notifications'),
    ('waitlist_agent_logs'),
    ('appointment_reminders'),
    ('appointment_blocks'),
    ('professional_availability'),
    ('renewal_rules'),
    ('renewal_tasks'),
    ('renewal_contacts'),
    ('renewal_automation_logs'),
    ('agenda_job_executions'),
    ('whatsapp_command_logs')
)
select e.name as table_name,
       case when to_regclass('public.'||e.name) is null then 'MISSING' else 'OK' end as status
from expected_tables e
order by 2 desc, 1;

-- Colunas criticas
select 'leads.priority_level' as column_check,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='leads' and column_name='priority_level'
       ) then 'OK' else 'MISSING' end as status
union all
select 'appointments.appointment_type',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='appointments' and column_name='appointment_type'
       ) then 'OK' else 'MISSING' end
union all
select 'appointments.credit_check_status',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='appointments' and column_name='credit_check_status'
       ) then 'OK' else 'MISSING' end
union all
select 'appointments.rescheduled_to',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='appointments' and column_name='rescheduled_to'
       ) then 'OK' else 'MISSING' end
union all
select 'appointments.rescheduled_from',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='appointments' and column_name='rescheduled_from'
       ) then 'OK' else 'MISSING' end
union all
select 'renewal_tasks.status',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='renewal_tasks' and column_name='status'
       ) then 'OK' else 'MISSING' end
union all
select 'view v_renewal_tasks_active',
       case when to_regclass('public.v_renewal_tasks_active') is null then 'MISSING' else 'OK' end
;

-- Enums criticos
with expected_enums(name) as (
  values
    ('waitlist_priority'),
    ('waitlist_status'),
    ('waitlist_contact_preference'),
    ('waitlist_window_type')
)
select e.name as enum_name,
       case when t.typname is null then 'MISSING' else 'OK' end as status
from expected_enums e
left join pg_type t on t.typname=e.name
order by 2 desc,1;
