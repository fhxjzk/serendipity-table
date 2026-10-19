-- Scheduler (기능 명세서 F-22, ADR-001 pg_cron): every minute the database calls the
-- app's job endpoint, which runs whatever is due (matching at the round's match_run_at).
-- The endpoint URL and its secret live in a private table that the API cannot read.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.job_config (
  id boolean primary key default true check (id),
  tick_url text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);

-- Set by the seed script / deploy step with the service role.
create or replace function public.set_job_config(p_url text, p_secret text) returns void
language sql security definer set search_path = public, private as $$
  insert into private.job_config (id, tick_url, secret) values (true, p_url, p_secret)
  on conflict (id) do update set tick_url = excluded.tick_url, secret = excluded.secret, updated_at = now();
$$;
revoke all on function public.set_job_config(text, text) from public, anon, authenticated;

create or replace function private.call_job_tick() returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v private.job_config;
begin
  select * into v from private.job_config where id;
  if not found then return; end if;
  perform net.http_post(
    url := v.tick_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'job-tick';
select cron.schedule('job-tick', '* * * * *', 'select private.call_job_tick()');

-- A round reset for a demo stops automatic matching for that round, otherwise the
-- next tick would match it again at once. The operator's instant run still works.
create or replace function public.reset_round_matching(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := (select min(started_at) from match_runs where round_id = p_round_id);
  v_apps uuid[] := (select array_agg(distinct application_id) from application_choices where round_id = p_round_id);
begin
  update rounds set setting_overrides = setting_overrides || '{"auto_match": false}'::jsonb where id = p_round_id;
  if v_since is null then return; end if;
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where round_id = p_round_id and type = 'MATCH_FAILED_ALL';
  delete from status_history where actor_type = 'SYSTEM' and field in ('MATCH', 'PAYMENT')
    and application_id = any(v_apps) and created_at >= v_since;
  update applications set match_status = 'WAITING', payment_status = 'PAID', table_id = null, reason_code = null, updated_at = now()
  where id = any(v_apps) and is_active;
  delete from table_members where round_id = p_round_id;
  delete from chat_messages where room_id in (select r.id from chat_rooms r join dining_tables t on t.id = r.table_id where t.round_id = p_round_id);
  delete from chat_rooms where table_id in (select id from dining_tables where round_id = p_round_id);
  delete from dining_tables where round_id = p_round_id;
  delete from match_runs where round_id = p_round_id;
  delete from job_runs where job_key = 'match:' || p_round_id;
  update rounds set status = 'OPEN' where id = p_round_id and status = 'MATCHED';
end;
$$;
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
