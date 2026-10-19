-- Event day and after (기능 명세서 F-46~F-49, F-53~F-56, 패널티 4.3).
-- check_in → end_round_event → submit_feedback / object_noshow → confirm_noshows.

-- F-46: from 30 minutes before the start (or once the operator opens it for a demo) until the end.
create or replace function public.check_in(p_profile uuid, p_app uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_round rounds;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found or v_app.match_status <> 'CONFIRMED' then raise exception 'NOT_CONFIRMED'; end if;
  if v_app.attendance_status = 'ATTENDED' then return jsonb_build_object('already', true); end if;
  select r.* into v_round from rounds r join dining_tables t on t.round_id = r.id where t.id = v_app.table_id;
  if v_round.status = 'DONE' then raise exception 'EVENT_ENDED'; end if;
  if now() < v_round.start_at - interval '30 minutes' and coalesce((v_round.setting_overrides->>'event_started')::boolean, false) = false then
    raise exception 'TOO_EARLY';
  end if;
  update applications set attendance_status = 'ATTENDED', checked_in_at = now(), updated_at = now() where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason)
  values (p_app, 'ATTENDANCE', v_app.attendance_status, 'ATTENDED', 'PARTICIPANT', p_profile, 'CHECK_IN');
  return jsonb_build_object('already', false);
end;
$$;

-- End of the event: tables done, MET relations, no-show candidates, feedback requests (F-53).
create or replace function public.end_round_event(p_round uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_hours int := coalesce((select value::text::int from app_settings where key = 'noshow_objection_hours'), 24);
  v_candidates int;
begin
  select * into v_round from rounds where id = p_round for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status = 'DONE' then return jsonb_build_object('already', true); end if;
  if v_round.status <> 'MATCHED' then raise exception 'ROUND_NOT_MATCHED'; end if;

  -- Everyone at the same table has now met (used by the "new people" score).
  insert into relations (from_profile_id, to_profile_id, type, source_table_id)
  select a.profile_id, b.profile_id, 'MET', a.table_id
  from table_members a join table_members b on a.table_id = b.table_id and a.profile_id <> b.profile_id
  join dining_tables t on t.id = a.table_id
  where t.round_id = p_round and t.status = 'CONFIRMED' and a.left_at is null and b.left_at is null
  on conflict do nothing;

  -- Not checked in by the end: no-show candidate with an objection window.
  insert into noshow_cases (application_id, table_id, objection_deadline_at, notice_sent_at)
  select a.id, a.table_id, now() + make_interval(hours => v_hours), now()
  from applications a join dining_tables t on t.id = a.table_id
  where t.round_id = p_round and t.status = 'CONFIRMED' and a.match_status = 'CONFIRMED' and a.attendance_status = 'SCHEDULED'
  on conflict (application_id) do nothing;
  get diagnostics v_candidates = row_count;

  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  select a.profile_id, 'NOSHOW_CHECK', '어제 식탁에 참석하셨나요?',
         '체크인 기록이 없어 노쇼 후보로 표시됐어요. 참석하셨다면 ' || v_hours || '시간 안에 알려 주세요.',
         '/applications/' || a.id || '/noshow', 'noshow:' || a.id
  from noshow_cases n join applications a on a.id = n.application_id
  join dining_tables t on t.id = n.table_id where t.round_id = p_round
  on conflict (dedupe_key) do nothing;

  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  select a.profile_id, 'FEEDBACK_REQUEST', '오늘 저녁은 어떠셨나요?',
         '만족도와 다시 만나고 싶은 사람을 알려 주시면 다음 식탁에 반영돼요.',
         '/applications/' || a.id || '/feedback', 'feedback:' || a.id
  from applications a join dining_tables t on t.id = a.table_id
  where t.round_id = p_round and t.status = 'CONFIRMED' and a.match_status = 'CONFIRMED'
  on conflict (dedupe_key) do nothing;

  update dining_tables set status = 'DONE' where round_id = p_round and status = 'CONFIRMED';
  -- The application is finished, so the person can apply for another date.
  update applications set is_active = false, updated_at = now()
  where id in (select application_id from application_choices where round_id = p_round) and is_active
    and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION');
  update rounds set status = 'DONE' where id = p_round;
  return jsonb_build_object('already', false, 'noshow_candidates', v_candidates);
end;
$$;

-- F-47~F-49, F-54. p: {mood, talk, venue, rejoin, recommend, review_rating, review_text, review_public,
--   likes: [profile], dislikes: [profile], attended: [profile], report: {profile, reason, detail}}
create or replace function public.submit_feedback(p_profile uuid, p_app uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_table dining_tables;
  v_mates uuid[];
  v_report uuid;
  v_adjusted int := 0;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile;
  if not found or v_app.match_status <> 'CONFIRMED' then raise exception 'NOT_CONFIRMED'; end if;
  select * into v_table from dining_tables where id = v_app.table_id;
  if v_table.status <> 'DONE' then raise exception 'EVENT_NOT_ENDED'; end if;
  if exists (select 1 from feedbacks where application_id = p_app) then return jsonb_build_object('already', true); end if;
  select array_agg(profile_id) into v_mates from table_members where table_id = v_table.id and profile_id <> p_profile and left_at is null;

  insert into feedbacks (application_id, table_id, profile_id, mood_score, talk_score, venue_score, rejoin_intent, recommend_intent,
                         review_rating, review_text, review_public)
  values (p_app, v_table.id, p_profile, (p->>'mood')::int, (p->>'talk')::int, (p->>'venue')::int, (p->>'rejoin')::int, (p->>'recommend')::int,
          nullif(p->>'review_rating', '')::int, nullif(p->>'review_text', ''), coalesce((p->>'review_public')::boolean, false));

  -- Private per-person preferences; only table mates count (F-48).
  insert into relations (from_profile_id, to_profile_id, type, source_table_id)
  select p_profile, x::uuid, 'LIKE', v_table.id from jsonb_array_elements_text(coalesce(p->'likes', '[]')) x where x::uuid = any(v_mates)
  union all
  select p_profile, x::uuid, 'DISLIKE', v_table.id from jsonb_array_elements_text(coalesce(p->'dislikes', '[]')) x where x::uuid = any(v_mates)
  on conflict do nothing;

  -- Report + block (F-49): the two are kept apart from now on.
  if p ? 'report' and (p->'report'->>'profile')::uuid = any(v_mates) then
    insert into reports (reporter_id, reported_id, table_id, reason_code, detail)
    values (p_profile, (p->'report'->>'profile')::uuid, v_table.id, coalesce(p->'report'->>'reason', 'ETC'), nullif(p->'report'->>'detail', ''))
    returning id into v_report;
    insert into relations (from_profile_id, to_profile_id, type, source_table_id) values
      (p_profile, (p->'report'->>'profile')::uuid, 'REPORT', v_table.id),
      (p_profile, (p->'report'->>'profile')::uuid, 'BLOCK', v_table.id)
    on conflict do nothing;
  end if;

  -- A mate who says they ate together clears that person's no-show candidacy (F-54).
  with cleared as (
    update noshow_cases n set result = 'ATTENDED', adjusted_at = now(), decided_at = now()
    from applications a
    where n.application_id = a.id and n.table_id = v_table.id and n.result = 'PENDING'
      and a.profile_id in (select x::uuid from jsonb_array_elements_text(coalesce(p->'attended', '[]')) x where x::uuid = any(v_mates))
    returning n.application_id
  )
  update applications set attendance_status = 'ATTENDED', updated_at = now() where id in (select application_id from cleared);
  get diagnostics v_adjusted = row_count;

  return jsonb_build_object('already', false, 'report_id', v_report, 'attendance_adjusted', v_adjusted);
end;
$$;

-- F-55: the candidate says they were there; the operator decides in the exception inbox.
create or replace function public.object_noshow(p_profile uuid, p_app uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v_case noshow_cases;
begin
  select n.* into v_case from noshow_cases n join applications a on a.id = n.application_id
  where n.application_id = p_app and a.profile_id = p_profile for update of n;
  if not found then raise exception 'NO_CASE'; end if;
  if v_case.result <> 'PENDING' then raise exception 'ALREADY_DECIDED'; end if;
  if v_case.objection_deadline_at < now() then raise exception 'DEADLINE_PASSED'; end if;
  update noshow_cases set objection_at = now(), objection_text = left(p_text, 500), result = 'ESCALATED' where application_id = p_app;
  insert into exceptions (type, table_id, application_id, reason, detail, dedupe_key)
  values ('NOSHOW_OBJECTION', v_case.table_id, p_app, '노쇼 이의 제기', jsonb_build_object('text', left(p_text, 500)), 'noshow-objection:' || p_app)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- F-55·F-56: candidates past the objection window become NO_SHOW with a penalty.
-- 1st no-show: warning (recorded automatically). 2nd and later: restriction proposed to the operator.
create or replace function public.confirm_noshows(p_round uuid default null, p_force boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int := 0;
  v_total int;
begin
  for r in
    select n.application_id, a.profile_id from noshow_cases n
    join applications a on a.id = n.application_id join dining_tables t on t.id = n.table_id
    where n.result = 'PENDING' and (p_force or n.objection_deadline_at < now()) and (p_round is null or t.round_id = p_round)
    for update of n
  loop
    update noshow_cases set result = 'NO_SHOW', decided_at = now() where application_id = r.application_id;
    update applications set attendance_status = 'NO_SHOW', updated_at = now() where id = r.application_id;
    insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
    values (r.application_id, 'ATTENDANCE', 'SCHEDULED', 'NO_SHOW', 'SYSTEM', 'NO_OBJECTION');
    insert into penalty_records (profile_id, application_id, kind) values (r.profile_id, r.application_id, 'NO_SHOW') on conflict do nothing;
    select count(*) into v_total from penalty_records where profile_id = r.profile_id and kind = 'NO_SHOW';
    if v_total >= 2 then
      insert into sanctions (profile_id, level, status, source, reason) values (r.profile_id, 'RESTRICTION', 'PROPOSED', 'PENALTY', '노쇼 ' || v_total || '회');
    else
      insert into sanctions (profile_id, level, status, source, reason, decided_at) values (r.profile_id, 'WARNING', 'CONFIRMED', 'PENALTY', '노쇼 1회', now());
    end if;
    insert into notifications (profile_id, type, title, body, link, dedupe_key)
    values (r.profile_id, 'NOSHOW_CONFIRMED', '노쇼로 기록됐어요',
            case when v_total >= 2 then '노쇼가 ' || v_total || '회라 참가 제한이 검토돼요.' else '첫 노쇼라 경고로 기록됐어요. 다음엔 불참 알림으로 미리 알려 주세요.' end,
            '/home', 'noshow-confirmed:' || r.application_id)
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Demo reset also clears what happened on and after the event day.
create or replace function public.reset_round_matching(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := (select min(started_at) from match_runs where round_id = p_round_id);
  v_apps uuid[] := (select array_agg(distinct application_id) from application_choices where round_id = p_round_id);
  v_tables uuid[] := (select array_agg(id) from dining_tables where round_id = p_round_id);
begin
  update rounds set setting_overrides = (setting_overrides - 'event_started') || '{"auto_match": false}'::jsonb where id = p_round_id;
  if v_since is null then return; end if;
  delete from feedbacks where table_id = any(v_tables);
  delete from relations where source_table_id = any(v_tables);
  delete from reports where table_id = any(v_tables);
  delete from noshow_cases where table_id = any(v_tables);
  delete from penalty_records where application_id = any(v_apps);
  delete from sanctions where source = 'PENALTY' and created_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  update venue_availability va set booked_slots = greatest(0, booked_slots - x.n)
  from (select venue_id, count(*) n from dining_tables where round_id = p_round_id and venue_id is not null group by venue_id) x
  where va.venue_id = x.venue_id and va.round_id = p_round_id;
  delete from notifications where dedupe_key in (
    select k || a from unnest(v_apps) a, unnest(array['confirm:', 'matchfail:', 'feedback:', 'noshow:', 'noshow-confirmed:']) k);
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where (round_id = p_round_id and type in ('MATCH_FAILED_ALL', 'VENUE_SHORTAGE'))
    or (type = 'NOSHOW_OBJECTION' and application_id = any(v_apps));
  delete from status_history where field in ('MATCH', 'PAYMENT', 'ATTENDANCE') and actor_type in ('SYSTEM', 'PARTICIPANT')
    and application_id = any(v_apps) and created_at >= v_since;
  -- Applications the round finished (or matched) go back to waiting; ones moved or refunded stay as they are.
  update applications set match_status = 'WAITING', payment_status = 'PAID', table_id = null, reason_code = null,
         attendance_status = 'SCHEDULED', checked_in_at = null, is_active = true, updated_at = now()
  where id = any(v_apps) and application_status = 'SUBMITTED' and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION', 'WAITING')
    and not exists (select 1 from match_resolutions mr where mr.application_id = applications.id);
  delete from table_members where round_id = p_round_id;
  delete from chat_messages where room_id in (select r.id from chat_rooms r where r.table_id = any(v_tables));
  delete from chat_rooms where table_id = any(v_tables);
  delete from dining_tables where round_id = p_round_id;
  delete from match_runs where round_id = p_round_id;
  delete from job_runs where job_key in ('match:' || p_round_id, 'end:' || p_round_id);
  update rounds set status = 'OPEN' where id = p_round_id and status in ('MATCHED', 'DONE');
end;
$$;

revoke all on function public.check_in(uuid, uuid) from public, anon, authenticated;
revoke all on function public.end_round_event(uuid) from public, anon, authenticated;
revoke all on function public.submit_feedback(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.object_noshow(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_noshows(uuid, boolean) from public, anon, authenticated;
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;

-- Participants read their own feedback, no-show case and penalty records.
create policy own_read on public.noshow_cases for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.profile_id = auth.uid()));
create policy own_read on public.penalty_records for select to authenticated using (profile_id = auth.uid());
