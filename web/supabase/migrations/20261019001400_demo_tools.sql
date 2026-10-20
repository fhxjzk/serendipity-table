-- 시연 도구 (R-34): fill in the virtual applicants' side of an event, and a reset that can run the
-- failure demo again. Virtual applicants are the seeded and generated people who have never signed in;
-- the demo accounts (who have signed in) are never touched.

-- At the event: the virtual people at the round's tables check in, so only real no-shows remain.
create or replace function public.demo_fill_attendance(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
  v_count int;
begin
  select * into r from rounds where id = p_round;
  if not found or r.status <> 'MATCHED' then raise exception 'ROUND_NOT_MATCHED'; end if;
  if not coalesce((r.setting_overrides->>'event_started')::boolean, false) and now() < r.start_at - interval '30 minutes' then
    raise exception 'NOT_STARTED';
  end if;
  with filled as (
    update applications a set attendance_status = 'ATTENDED', checked_in_at = now(), updated_at = now()
    from table_members m join dining_tables t on t.id = m.table_id
    where m.application_id = a.id and t.round_id = p_round and t.status = 'CONFIRMED' and m.left_at is null
      and a.attendance_status = 'SCHEDULED'
      and not exists (select 1 from auth.users u where u.id = a.profile_id and u.last_sign_in_at is not null)
    returning a.id
  )
  insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
  select id, 'ATTENDANCE', 'SCHEDULED', 'ATTENDED', 'SYSTEM', 'DEMO_CHECKIN' from filled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- After the event: the virtual people who came leave feedback, and some say who they would meet again,
-- so the next matching has something to learn from.
create or replace function public.demo_fill_feedback(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
  m record;
  v_mate uuid;
  v_count int := 0;
begin
  select * into r from rounds where id = p_round;
  if not found or r.status <> 'DONE' then raise exception 'ROUND_NOT_DONE'; end if;
  for m in
    select a.id app, a.profile_id, a.table_id from applications a join dining_tables t on t.id = a.table_id
    where t.round_id = p_round and t.status = 'DONE' and a.attendance_status = 'ATTENDED'
      and not exists (select 1 from feedbacks f where f.application_id = a.id)
      and not exists (select 1 from auth.users u where u.id = a.profile_id and u.last_sign_in_at is not null)
  loop
    insert into feedbacks (application_id, table_id, profile_id, mood_score, talk_score, venue_score, rejoin_intent, recommend_intent)
    values (m.app, m.table_id, m.profile_id, 3 + floor(random() * 3)::int, 3 + floor(random() * 3)::int, 3 + floor(random() * 3)::int,
            3 + floor(random() * 3)::int, 3 + floor(random() * 3)::int)
    on conflict do nothing;
    if random() < 0.4 then
      select b.profile_id into v_mate from applications b
      where b.table_id = m.table_id and b.id <> m.app and b.attendance_status = 'ATTENDED' order by random() limit 1;
      if v_mate is not null then
        insert into relations (from_profile_id, to_profile_id, type, source_table_id) values (m.profile_id, v_mate, 'LIKE', m.table_id)
        on conflict do nothing;
      end if;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Demo reset also undoes the failed applicants' choice (move, keep or refund), so the failure demo can run again.
create or replace function public.reset_round_matching(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := (select min(started_at) from match_runs where round_id = p_round_id);
  v_apps uuid[] := (select array_agg(distinct application_id) from application_choices where round_id = p_round_id);
  v_tables uuid[] := (select array_agg(id) from dining_tables where round_id = p_round_id);
  v_refunds uuid[];
  res record;
begin
  update rounds set setting_overrides = (setting_overrides - 'event_started') || '{"auto_match": false}'::jsonb where id = p_round_id;
  if v_since is null then return; end if;

  for res in
    select mr.application_id, mr.choice, mr.new_application_id, a.user_ticket_id
    from match_resolutions mr join applications a on a.id = mr.application_id where mr.application_id = any(v_apps)
  loop
    if res.choice = 'MOVE' and res.new_application_id is not null
       and exists (select 1 from applications n where n.id = res.new_application_id and n.match_status = 'WAITING') then
      update match_resolutions set new_application_id = null where application_id = res.application_id;
      update applications set transferred_from = null where id = res.new_application_id;
      delete from application_choices where application_id = res.new_application_id;
      delete from status_history where application_id = res.new_application_id;
      delete from applications where id = res.new_application_id;
    end if;
    if exists (select 1 from ticket_ledger l where l.application_id = res.application_id and l.reason in ('KEEP', 'RESTORE')) then
      update user_tickets set remaining_uses = greatest(0, remaining_uses - 1) where id = res.user_ticket_id;
      delete from ticket_ledger where application_id = res.application_id and reason in ('KEEP', 'RESTORE');
    end if;
  end loop;
  v_refunds := (select array_agg(refund_id) from match_resolutions where application_id = any(v_apps) and refund_id is not null);
  update applications set application_status = 'SUBMITTED', payment_status = 'PAID', is_active = true, canceled_at = null, updated_at = now()
  where id in (select application_id from match_resolutions where application_id = any(v_apps));
  delete from match_resolutions where application_id = any(v_apps);
  delete from refunds where id = any(v_refunds);

  delete from feedbacks where table_id = any(v_tables);
  delete from relations where source_table_id = any(v_tables);
  delete from reports where table_id = any(v_tables);
  delete from noshow_cases where table_id = any(v_tables);
  delete from penalty_records where application_id = any(v_apps);
  delete from sanctions where source = 'PENALTY' and created_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  update venue_availability va set booked_slots = greatest(0, booked_slots - x.n)
  from (select venue_id, count(*) n from dining_tables where round_id = p_round_id and venue_id is not null and status <> 'CANCELED' group by venue_id) x
  where va.venue_id = x.venue_id and va.round_id = p_round_id;
  delete from notifications where dedupe_key in (
    select k || a from unnest(v_apps) a,
      unnest(array['confirm:', 'matchfail:', 'feedback:', 'feedback-remind:', 'noshow:', 'noshow-confirmed:', 'reminder:', 'start:', 'cancel:', 'shrink:', 'moved:']) k);
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where (reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
      and profile_id in (select profile_id from applications where id = any(v_apps)))
    or source_table_id = any(v_tables);
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where (round_id = p_round_id and type in ('MATCH_FAILED_ALL', 'VENUE_SHORTAGE'))
    or (type = 'NOSHOW_OBJECTION' and application_id = any(v_apps));
  delete from refunds where application_id = any(v_apps) and reason in ('EARLY_CANCEL', 'TABLE_CANCELED');
  update user_tickets ut set remaining_uses = greatest(0, ut.remaining_uses - x.n)
  from (select l.user_ticket_id, count(*) n from ticket_ledger l join applications a on a.id = l.application_id
        where l.reason = 'RESTORE' and l.application_id = any(v_apps) and a.reason_code in ('CANCELED_EARLY', 'TABLE_CANCELED') group by l.user_ticket_id) x
  where ut.id = x.user_ticket_id;
  delete from ticket_ledger where reason = 'RESTORE' and application_id in (select id from applications where id = any(v_apps) and reason_code in ('CANCELED_EARLY', 'TABLE_CANCELED'));
  update applications set application_status = 'SUBMITTED', payment_status = 'PAID', canceled_at = null, is_active = true, updated_at = now()
  where id = any(v_apps) and reason_code in ('CANCELED_EARLY', 'CANCELED_LATE', 'TABLE_CANCELED') and application_status = 'CANCELED';
  delete from status_history where field in ('MATCH', 'PAYMENT', 'ATTENDANCE') and actor_type in ('SYSTEM', 'PARTICIPANT')
    and application_id = any(v_apps) and created_at >= v_since;
  update applications set match_status = 'WAITING', payment_status = 'PAID', table_id = null, reason_code = null,
         attendance_status = 'SCHEDULED', checked_in_at = null, is_active = true, updated_at = now()
  where id = any(v_apps) and application_status = 'SUBMITTED'
    and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION', 'WAITING', 'NO_MATCH', 'TRANSFERRED');
  delete from table_members where round_id = p_round_id;
  delete from table_contents where table_id = any(v_tables);
  delete from chat_messages where room_id in (select r.id from chat_rooms r where r.table_id = any(v_tables));
  delete from chat_rooms where table_id = any(v_tables);
  delete from dining_tables where round_id = p_round_id;
  delete from match_runs where round_id = p_round_id;
  delete from job_runs where job_key in ('match:' || p_round_id, 'end:' || p_round_id, 'reminder:' || p_round_id, 'start:' || p_round_id);
  update rounds set status = 'OPEN' where id = p_round_id and status in ('MATCHED', 'DONE');
end;
$$;

revoke all on function public.demo_fill_attendance(uuid) from public, anon, authenticated;
revoke all on function public.demo_fill_feedback(uuid) from public, anon, authenticated;
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
