-- 핵심 지표 13종 (기능 명세서 F-72, 4.7). Every ratio is returned as {num, den}; the page prints "-" when den is 0.
-- Definitions that the spec leaves open:
--   자동 확정률      tables whose matching run was started by the scheduler, over confirmed (and finished) tables
--   운영자 개입률    tables that have an exception record, over confirmed (and finished) tables
--   확정 참가자      people seated at a finished table (attendance figures only make sense once an event is over)
create or replace function public.dashboard_metrics() returns jsonb
language sql stable security definer set search_path = public as $$
  with
  apps as (select * from applications),
  paid as (select distinct application_id from payments where status = 'PAID'),
  runs as (select * from match_runs where status = 'DONE'),
  tables_ok as (select t.id, t.match_run_id from dining_tables t where t.status in ('CONFIRMED', 'DONE')),
  seated as (
    select distinct m.application_id from table_members m join dining_tables t on t.id = m.table_id
    where t.status = 'DONE' and m.left_at is null
  ),
  attended as (select a.id, a.profile_id from apps a join seated s on s.application_id = a.id where a.attendance_status = 'ATTENDED'),
  released as (select distinct e.application_id, e.match_run_id from match_events e where e.event_type = 'RELEASED'),
  exc as (
    select e.created_at, e.resolved_at, coalesce(e.round_id, t.round_id) round_id
    from exceptions e left join dining_tables t on t.id = e.table_id where e.status = 'RESOLVED' and e.resolved_at is not null
  ),
  -- Exceptions without a round (such as inquiries) are averaged together as one group.
  per_round as (select coalesce(round_id::text, 'none') round_key, avg(extract(epoch from (resolved_at - created_at))) secs from exc group by 1),
  per_profile as (select profile_id, count(*) n from attended group by profile_id)
  select jsonb_build_object(
    'apply_complete',   jsonb_build_object('num', (select count(*) from apps where submitted_at is not null or application_status in ('SUBMITTED', 'CANCELED')), 'den', (select count(*) from apps)),
    'pay_conversion',   jsonb_build_object('num', (select count(*) from paid), 'den', (select count(*) from apps where application_status in ('SUBMITTED', 'CANCELED'))),
    'match_success',    jsonb_build_object('num', (select coalesce(sum((stats->>'seated')::int), 0) from runs), 'den', (select coalesce(sum((stats->>'candidates')::int), 0) from runs)),
    'auto_confirm',     jsonb_build_object('num', (select count(*) from tables_ok t join runs r on r.id = t.match_run_id where r.trigger = 'SCHEDULER'), 'den', (select count(*) from tables_ok)),
    'realloc_success',  jsonb_build_object(
      'num', (select count(*) from released r where exists (select 1 from match_events c where c.match_run_id = r.match_run_id and c.application_id = r.application_id and c.event_type = 'CONFIRMED'))
             + (select count(*) from status_history where reason = 'SHRINK_REALLOCATED'),
      'den', (select count(*) from released)
             + (select count(*) from status_history where reason in ('SHRINK_REALLOCATED', 'SHRINK_REALLOC_FAILED'))),
    'alt_conversion',   jsonb_build_object(
      'num', (select count(*) from match_resolutions where choice = 'MOVE'),
      'den', (select count(*) from (select application_id from match_resolutions union select id from apps where match_status = 'ALTERNATIVE_OFFERED') x)),
    'refund_done',      jsonb_build_object('num', (select count(*) from refunds where status = 'REFUNDED'), 'den', (select count(*) from refunds)),
    'attend_rate',      jsonb_build_object('num', (select count(*) from attended), 'den', (select count(*) from seated)),
    'noshow_rate',      jsonb_build_object('num', (select count(*) from apps a join seated s on s.application_id = a.id where a.attendance_status = 'NO_SHOW'), 'den', (select count(*) from seated)),
    'revisit_rate',     jsonb_build_object('num', (select count(*) from per_profile where n >= 2), 'den', (select count(*) from per_profile)),
    'feedback_rate',    jsonb_build_object('num', (select count(*) from feedbacks f join attended a on a.id = f.application_id), 'den', (select count(*) from attended)),
    'operator_touch',   jsonb_build_object('num', (select count(distinct t.id) from tables_ok t join exceptions e on e.table_id = t.id), 'den', (select count(*) from tables_ok)),
    'exception_secs',   jsonb_build_object('num', (select round(avg(secs)) from per_round), 'den', (select count(*) from per_round)),
    'inquiry_auto',     jsonb_build_object('num', (select count(*) from inquiries where status = 'AUTO_RESOLVED'), 'den', (select count(*) from inquiries))
  );
$$;
revoke all on function public.dashboard_metrics() from public, anon, authenticated;
