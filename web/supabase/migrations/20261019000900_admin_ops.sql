-- 운영자 어드민 (기능 명세서 F-58, F-66, F-68): round creation, exception handling and
-- sanction decisions. Each is one transaction, called from server actions after requireProfile.

-- F-58: create an OPEN round for a date. Deadline and auto-match run follow the standing rule
-- (3 days before at 18:00 KST), the reminder goes the evening before, and every active venue in the
-- chosen regions gets table slots for it.
create or replace function public.create_round(p_actor uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_date date := (p->>'event_date')::date;
  v_start time := coalesce(nullif(p->>'start_time', '')::time, time '19:00');
  v_end time := coalesce(nullif(p->>'end_time', '')::time, time '21:00');
  v_deadline timestamptz := ((v_date - 3)::timestamp + time '18:00') at time zone 'Asia/Seoul';
  v_id uuid;
  v_regions jsonb := coalesce(p->'regions', '[]');
  v_slots int := coalesce(nullif(p->>'table_slots', '')::int, 4);
begin
  if v_date is null then raise exception 'DATE_REQUIRED'; end if;
  if v_end <= v_start then raise exception 'TIME_ORDER'; end if;
  if v_deadline <= now() then raise exception 'DEADLINE_PASSED'; end if;
  if exists (select 1 from rounds where event_date = v_date and status <> 'CANCELED') then raise exception 'DUPLICATE_DATE'; end if;
  if jsonb_array_length(v_regions) = 0 then raise exception 'REGION_REQUIRED'; end if;

  insert into rounds (title, event_date, start_at, end_at, apply_deadline_at, match_run_at, reminder_at, status, created_by)
  values (
    coalesce(nullif(p->>'title', ''), extract(month from v_date)::int || '/' || extract(day from v_date)::int ||
      '(' || (array['일','월','화','수','목','금','토'])[extract(dow from v_date)::int + 1] || ') 우연한 식탁'),
    v_date,
    (v_date::timestamp + v_start) at time zone 'Asia/Seoul',
    (v_date::timestamp + v_end) at time zone 'Asia/Seoul',
    v_deadline, v_deadline,
    ((v_date - 1)::timestamp + time '18:00') at time zone 'Asia/Seoul',
    'OPEN', p_actor)
  returning id into v_id;

  insert into round_regions (round_id, region_code, capacity)
  select v_id, x->>'code', coalesce(nullif(x->>'capacity', '')::int, 60) from jsonb_array_elements(v_regions) x;

  insert into venue_availability (venue_id, round_id, table_slots, max_seats)
  select v.id, v_id, v_slots, 6 from venues v
  where v.active and v.region_code in (select x->>'code' from jsonb_array_elements(v_regions) x);

  return v_id;
end;
$$;

-- F-66: move an exception to in-progress or resolved. A no-show objection also needs a verdict:
-- ACCEPT clears the no-show, REJECT lets it stand and applies the penalty.
create or replace function public.resolve_exception(p_actor uuid, p_exception uuid, p_status text, p_note text, p_verdict text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  e exceptions;
begin
  if p_status not in ('IN_PROGRESS', 'RESOLVED') then raise exception 'BAD_STATUS'; end if;
  select * into e from exceptions where id = p_exception for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status = 'RESOLVED' then raise exception 'ALREADY_RESOLVED'; end if;

  if p_status = 'RESOLVED' and e.type = 'NOSHOW_OBJECTION' and e.application_id is not null then
    if p_verdict = 'ACCEPT' then
      update noshow_cases set result = 'ATTENDED', decided_at = now() where application_id = e.application_id;
      update applications set attendance_status = 'ATTENDED', updated_at = now() where id = e.application_id;
      insert into notifications (profile_id, type, title, body, link, dedupe_key)
      select profile_id, 'NOSHOW_RESOLVED', '이의가 받아들여졌어요', '참석으로 확인돼 노쇼 기록이 지워졌어요.', '/home', 'noshow-resolved:' || e.application_id
      from applications where id = e.application_id on conflict (dedupe_key) do nothing;
    elsif p_verdict = 'REJECT' then
      update noshow_cases set result = 'PENDING', objection_deadline_at = now() - interval '1 second' where application_id = e.application_id;
      perform confirm_noshows(null, false);
    else
      raise exception 'VERDICT_REQUIRED';
    end if;
  end if;

  update exceptions set status = p_status, resolution_note = nullif(left(p_note, 500), ''),
         resolved_by = case when p_status = 'RESOLVED' then p_actor end,
         resolved_at = case when p_status = 'RESOLVED' then now() end
  where id = p_exception;
end;
$$;

-- Apply a decided sanction to the person's profile and tell them (the reporter is never named).
create or replace function public.apply_sanction(p_sanction uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sanctions;
begin
  select * into s from sanctions where id = p_sanction;
  if s.level = 'RESTRICTION' then
    update profiles set restriction = 'RESTRICTED', restricted_until = s.until_date where id = s.profile_id;
  elsif s.level = 'BAN' then
    update profiles set restriction = 'BANNED', restricted_until = null where id = s.profile_id;
  end if;
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (s.profile_id, 'SANCTION',
          case s.level when 'WARNING' then '운영 정책 경고를 받았어요' when 'RESTRICTION' then '참가가 일시 제한됐어요' else '이용이 제한됐어요' end,
          s.reason || coalesce(' · ' || to_char(s.until_date, 'YYYY"년" FMMM"월" FMDD"일"') || '까지', ''),
          '/home', 'sanction:' || s.id)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- F-68: confirm or reject a proposed sanction (for example the second no-show).
create or replace function public.decide_sanction(p_actor uuid, p_sanction uuid, p_decision text, p_until date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare s sanctions;
begin
  select * into s from sanctions where id = p_sanction for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if s.status <> 'PROPOSED' then raise exception 'ALREADY_DECIDED'; end if;
  if p_decision = 'CONFIRM' then
    update sanctions set status = 'CONFIRMED', decided_by = p_actor, decided_at = now(),
           until_date = case when level = 'RESTRICTION' then coalesce(p_until, current_date + 30) else null end
    where id = p_sanction;
    perform apply_sanction(p_sanction);
  elsif p_decision = 'REJECT' then
    update sanctions set status = 'REJECTED', decided_by = p_actor, decided_at = now() where id = p_sanction;
  else
    raise exception 'BAD_DECISION';
  end if;
end;
$$;

-- F-68: review a report. REVIEWING just marks it taken; the others close it with an action.
create or replace function public.review_report(p_actor uuid, p_report uuid, p_action text, p_until date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r reports;
  v_level text;
  v_sanction uuid;
begin
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status = 'RESOLVED' then raise exception 'ALREADY_RESOLVED'; end if;

  if p_action = 'REVIEWING' then
    update reports set status = 'REVIEWING', handled_by = p_actor where id = p_report;
    return;
  end if;
  if p_action not in ('NONE', 'WARNING', 'RESTRICTED', 'BANNED') then raise exception 'BAD_ACTION'; end if;

  update reports set status = 'RESOLVED', action = p_action, handled_by = p_actor, handled_at = now() where id = p_report;
  if p_action <> 'NONE' then
    v_level := case p_action when 'WARNING' then 'WARNING' when 'RESTRICTED' then 'RESTRICTION' else 'BAN' end;
    insert into sanctions (profile_id, level, status, source, report_id, reason, until_date, decided_by, decided_at)
    values (r.reported_id, v_level, 'CONFIRMED', 'REPORT', p_report, '신고 검토 결과 운영 정책 위반이 확인됐어요.',
            case when v_level = 'RESTRICTION' then coalesce(p_until, current_date + 30) end, p_actor, now())
    returning id into v_sanction;
    perform apply_sanction(v_sanction);
  end if;
end;
$$;

revoke all on function public.create_round(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_exception(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_sanction(uuid) from public, anon, authenticated;
revoke all on function public.decide_sanction(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.review_report(uuid, uuid, text, date) from public, anon, authenticated;
