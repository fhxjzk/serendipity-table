-- 취소·당일 불참 알림·확정 후 인원 감소 (기능 명세서 F-15, F-16, F-33, F-34, 취소 규칙 4.2~4.4).
-- Phase by event date (KST):
--   EARLY    before event day -2 00:00  → CANCELED_EARLY, automatic (mock) refund
--   LATE     event day -2 00:00 ~ day before → CANCELED_LATE, no refund, no penalty
--   SAME_DAY event day before the start → absence notice only (CANCELED_LATE, no refund, penalty from the 2nd in 3 months)
--   TOO_LATE from the start on → nothing

create or replace function public.cancel_phase(p_round uuid) returns text
language sql stable set search_path = public as $$
  select case
    when r.status in ('DONE', 'CANCELED') or now() >= r.start_at then 'TOO_LATE'
    when coalesce((r.setting_overrides->>'event_started')::boolean, false)
      or now() >= (r.event_date::timestamp at time zone 'Asia/Seoul') then 'SAME_DAY'
    when now() >= (r.event_date::timestamp at time zone 'Asia/Seoul') - interval '2 days' then 'LATE'
    else 'EARLY' end
  from rounds r where r.id = p_round;
$$;

-- Members who still plan to come (an absence notice or cancellation no longer counts).
create or replace function public.table_headcount(p_table uuid) returns int
language sql stable set search_path = public as $$
  select count(*)::int from table_members m join applications a on a.id = m.application_id
  where m.table_id = p_table and m.left_at is null and a.attendance_status not in ('CANCELED_EARLY', 'CANCELED_LATE');
$$;

-- Mock refund of one application: money back for 1회권, one use back for a subscription (F-11, F-21).
create or replace function public.refund_application(p_app uuid, p_reason text, p_exception boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_payment payments;
begin
  select * into v_app from applications where id = p_app;
  if v_app.payment_status not in ('PAID', 'REFUND_AVAILABLE') then return 'NONE'; end if;
  if coalesce(v_app.ticket_product_code, 'SINGLE') <> 'SINGLE' then
    update user_tickets set remaining_uses = least(total_uses, remaining_uses + 1), status = 'ACTIVE' where id = v_app.user_ticket_id;
    insert into ticket_ledger (user_ticket_id, application_id, delta, reason) values (v_app.user_ticket_id, p_app, 1, 'RESTORE')
    on conflict do nothing;
    return 'TICKET_RESTORED';
  end if;
  select * into v_payment from payments where application_id = p_app and status = 'PAID' order by paid_at desc limit 1;
  if not found then return 'NONE'; end if;
  insert into refunds (payment_id, application_id, amount, reason, policy_exception, status, completed_at)
  values (v_payment.id, p_app, v_payment.amount, p_reason, p_exception, 'REFUNDED', now())
  on conflict (application_id) do nothing;
  return 'REFUNDED';
end;
$$;

-- F-15: cancel until the day before. The phase decides whether money comes back.
create or replace function public.cancel_application(p_profile uuid, p_app uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_round uuid;
  v_phase text;
  v_attendance text;
  v_refund text := 'NONE';
  v_table uuid;
  v_shrink jsonb := jsonb_build_object('action', 'NONE');
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if v_app.application_status = 'CANCELED' or not v_app.is_active then return jsonb_build_object('already', true); end if;
  if v_app.match_status in ('ALTERNATIVE_OFFERED', 'EXCEPTION') then raise exception 'USE_RESOLVE'; end if;
  if v_app.attendance_status <> 'SCHEDULED' then raise exception 'NOT_CANCELABLE'; end if;

  v_table := v_app.table_id;
  if v_table is not null then
    select round_id into v_round from dining_tables where id = v_table;
  else
    select ac.round_id into v_round from application_choices ac join rounds r on r.id = ac.round_id
    where ac.application_id = p_app and r.status in ('OPEN', 'CLOSED', 'MATCHED') order by r.event_date limit 1;
  end if;
  if v_round is null then raise exception 'NOT_CANCELABLE'; end if;

  v_phase := cancel_phase(v_round);
  if v_phase = 'SAME_DAY' then raise exception 'USE_ABSENCE'; end if;
  if v_phase = 'TOO_LATE' then raise exception 'TOO_LATE'; end if;
  v_attendance := case when v_phase = 'EARLY' then 'CANCELED_EARLY' else 'CANCELED_LATE' end;
  if v_phase = 'EARLY' then v_refund := refund_application(p_app, 'EARLY_CANCEL', false); end if;

  update applications set application_status = 'CANCELED', match_status = 'NO_MATCH', attendance_status = v_attendance,
         payment_status = case when v_refund <> 'NONE' then 'REFUNDED' else payment_status end,
         is_active = false, canceled_at = now(), table_id = null, reason_code = v_attendance, updated_at = now()
  where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason) values
    (p_app, 'APPLICATION', 'SUBMITTED', 'CANCELED', 'PARTICIPANT', p_profile, v_attendance),
    (p_app, 'ATTENDANCE', 'SCHEDULED', v_attendance, 'PARTICIPANT', p_profile, 'CANCEL');
  if v_refund <> 'NONE' then
    insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason)
    values (p_app, 'PAYMENT', v_app.payment_status, 'REFUNDED', 'SYSTEM', null, case when v_refund = 'TICKET_RESTORED' then 'TICKET_RESTORED' else 'MOCK_REFUND' end);
  end if;

  if v_table is not null then
    update table_members set left_at = now(), left_reason = 'CANCELED' where application_id = p_app and left_at is null;
    v_shrink := after_headcount_drop(v_table);
  end if;

  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (p_profile, 'CANCELED', '신청을 취소했어요',
          case v_refund when 'REFUNDED' then '결제하신 금액이 전액 환불돼요.' when 'TICKET_RESTORED' then '이용권 1회가 다시 돌아왔어요.'
                        else case when v_phase = 'EARLY' then '결제 전이라 환불할 금액은 없어요.' else '행사 2일 전부터는 환불되지 않아요.' end end,
          '/home', 'cancel:' || p_app)
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('already', false, 'phase', v_phase, 'refund', v_refund, 'table_id', v_table, 'shrink', v_shrink);
end;
$$;

-- F-16: on the event day there is no cancel, only an absence notice. No refund; told to the table at once.
create or replace function public.notify_absence(p_profile uuid, p_app uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_table dining_tables;
  v_phase text;
  v_inserted int;
  v_count int;
  v_sanction uuid;
  v_room uuid;
  v_shrink jsonb;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if v_app.attendance_status = 'CANCELED_LATE' then return jsonb_build_object('already', true); end if;
  if v_app.match_status <> 'CONFIRMED' or v_app.table_id is null or v_app.attendance_status <> 'SCHEDULED' then raise exception 'NOT_CANCELABLE'; end if;
  select * into v_table from dining_tables where id = v_app.table_id;
  v_phase := cancel_phase(v_table.round_id);
  if v_phase in ('EARLY', 'LATE') then raise exception 'USE_CANCEL'; end if;
  if v_phase = 'TOO_LATE' then raise exception 'TOO_LATE'; end if;

  update applications set attendance_status = 'CANCELED_LATE', reason_code = 'CANCELED_LATE', updated_at = now() where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason)
  values (p_app, 'ATTENDANCE', 'SCHEDULED', 'CANCELED_LATE', 'PARTICIPANT', p_profile, 'ABSENCE_NOTICE');

  -- Lighter than a no-show: a warning only from the 2nd notice within 3 months (4.3).
  insert into penalty_records (profile_id, application_id, kind) values (p_profile, p_app, 'SAME_DAY_CANCEL') on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select count(*) into v_count from penalty_records where profile_id = p_profile and kind = 'SAME_DAY_CANCEL' and created_at >= now() - interval '3 months';
  if v_inserted > 0 and v_count >= 2 then
    insert into sanctions (profile_id, level, status, source, reason, decided_at)
    values (p_profile, 'WARNING', 'CONFIRMED', 'PENALTY', '당일 불참 알림 ' || v_count || '회', now()) returning id into v_sanction;
    perform apply_sanction(v_sanction);
  end if;

  -- Whoever causes the drop gets no apology coupon (F-34), even if one was issued a moment ago.
  delete from coupons where profile_id = p_profile and source_table_id = v_app.table_id and status = 'ISSUED';

  select id into v_room from chat_rooms where table_id = v_app.table_id;
  insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
  values (v_room, null, 'ABSENCE', '한 분이 오늘 불참을 미리 알려 왔어요.', 'absence:' || p_app)
  on conflict (dedupe_key) do nothing;

  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (p_profile, 'CANCELED', '불참 알림을 보냈어요',
          '미리 알려 주셔서 노쇼로 기록되지 않아요. 당일에는 환불되지 않아요.', '/home', 'cancel:' || p_app)
  on conflict (dedupe_key) do nothing;

  v_shrink := after_headcount_drop(v_app.table_id);
  return jsonb_build_object('already', false, 'phase', v_phase, 'table_id', v_app.table_id, 'shrink', v_shrink, 'warning', v_sanction is not null);
end;
$$;

-- Close a table (4.4): free the venue slot, say why in the chat room, empty the member list.
create or replace function public.close_table(p_table uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare t dining_tables;
begin
  select * into t from dining_tables where id = p_table for update;
  if not found or t.status <> 'CONFIRMED' then return; end if;
  update dining_tables set status = 'CANCELED', canceled_at = now(), cancel_reason = p_note where id = p_table;
  if t.venue_id is not null then
    update venue_availability set booked_slots = greatest(0, booked_slots - 1) where venue_id = t.venue_id and round_id = t.round_id;
  end if;
  insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
  select r.id, null, 'SYSTEM', p_note, 'closed:' || p_table from chat_rooms r where r.table_id = p_table
  on conflict (dedupe_key) do nothing;
  update table_members set left_at = now(), left_reason = coalesce(left_reason, 'TABLE_CANCELED') where table_id = p_table and left_at is null;
end;
$$;

-- F-33: the table lost someone. 4+ left: carry on. Fewer: before the event day try other tables
-- (returns NEEDS_REALLOC for the app to run), on the day 3 people still dine and 2 or fewer cancel the table.
create or replace function public.after_headcount_drop(p_table uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t dining_tables;
  v_min int := (select (value->>'min')::int from app_settings where key = 'table_size');
  v_coupon jsonb := (select value from app_settings where key = 'coupon');
  v_left int;
  v_app uuid;
begin
  select * into t from dining_tables where id = p_table for update;
  if not found or t.status <> 'CONFIRMED' then return jsonb_build_object('action', 'NONE'); end if;
  v_left := table_headcount(p_table);

  if v_left >= v_min then
    insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
    select r.id, null, 'SYSTEM', '참석 인원이 ' || v_left || '명으로 바뀌었어요.', 'headcount:' || p_table || ':' || v_left from chat_rooms r where r.table_id = p_table
    on conflict (dedupe_key) do nothing;
    return jsonb_build_object('action', 'OK', 'headcount', v_left);
  end if;

  if cancel_phase(t.round_id) <> 'SAME_DAY' then
    return jsonb_build_object('action', 'NEEDS_REALLOC', 'headcount', v_left);
  end if;

  if v_left = v_min - 1 then
    -- Three people: the dinner goes on, everyone left gets a coupon and an apology.
    insert into coupons (profile_id, reason, source_table_id, discount_rate, valid_until)
    select m.profile_id, 'RUN_WITH_THREE', p_table, (v_coupon->>'discount_rate')::int, current_date + (v_coupon->>'valid_days')::int
    from table_members m join applications a on a.id = m.application_id
    where m.table_id = p_table and m.left_at is null and a.attendance_status not in ('CANCELED_EARLY', 'CANCELED_LATE')
    on conflict do nothing;
    insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
    select r.id, null, 'SYSTEM', '참석 인원이 ' || v_left || '명이 됐어요. 오늘은 이 인원으로 그대로 진행해요.', 'headcount:' || p_table || ':' || v_left from chat_rooms r where r.table_id = p_table
    on conflict (dedupe_key) do nothing;
    insert into notifications (profile_id, type, title, body, link, dedupe_key)
    select m.profile_id, 'TABLE_SHRUNK', '오늘은 ' || v_left || '명이 함께해요',
           '일행 한 분이 빠져 인원이 줄었어요. 불편을 드려 죄송해요. 다음 신청에 쓸 수 있는 할인 쿠폰을 드렸어요.',
           '/applications/' || m.application_id || '/table', 'shrink:' || m.application_id
    from table_members m join applications a on a.id = m.application_id
    where m.table_id = p_table and m.left_at is null and a.attendance_status not in ('CANCELED_EARLY', 'CANCELED_LATE')
    on conflict (dedupe_key) do nothing;
    return jsonb_build_object('action', 'RUN_WITH_THREE', 'headcount', v_left);
  end if;

  -- Two or fewer: the table is canceled and the rest are refunded in full, even inside the refund limit.
  for v_app in
    select m.application_id from table_members m join applications a on a.id = m.application_id
    where m.table_id = p_table and m.left_at is null and a.attendance_status not in ('CANCELED_EARLY', 'CANCELED_LATE')
  loop
    perform refund_application(v_app, 'TABLE_CANCELED', true);
    update applications set application_status = 'CANCELED', match_status = 'NO_MATCH',
           payment_status = case when payment_status in ('PAID', 'REFUND_AVAILABLE') then 'REFUNDED' else payment_status end,
           is_active = false, canceled_at = now(), table_id = null, reason_code = 'TABLE_CANCELED', updated_at = now()
    where id = v_app;
    insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
    values (v_app, 'MATCH', 'CONFIRMED', 'NO_MATCH', 'SYSTEM', 'TABLE_CANCELED');
    insert into coupons (profile_id, reason, source_table_id, discount_rate, valid_until)
    select profile_id, 'TABLE_CANCELED', p_table, (v_coupon->>'discount_rate')::int, current_date + (v_coupon->>'valid_days')::int
    from applications where id = v_app on conflict do nothing;
    insert into notifications (profile_id, type, title, body, link, dedupe_key)
    select profile_id, 'TABLE_CANCELED', '오늘 식탁이 취소됐어요',
           '일행이 빠져 인원이 부족해 취소됐어요. 결제하신 금액은 전액 환불되고, 사과의 뜻으로 할인 쿠폰을 드렸어요.', '/home', 'shrink:' || v_app
    from applications where id = v_app on conflict (dedupe_key) do nothing;
  end loop;
  perform close_table(p_table, '참석 인원이 부족해 오늘 식탁이 취소됐어요. 결제하신 금액은 전액 환불돼요.');
  return jsonb_build_object('action', 'TABLE_CANCELED', 'headcount', v_left);
end;
$$;

-- Reallocation, step 1: put one member at another confirmed table (the app checked the hard rules).
create or replace function public.move_member_to_table(p_app uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_to dining_tables;
  v_max int := (select (value->>'max')::int from app_settings where key = 'table_size');
  v_seats int;
  v_venue venues;
  v_when text;
  v_count int;
begin
  select * into v_app from applications where id = p_app for update;
  if v_app.match_status <> 'CONFIRMED' or v_app.table_id is null or v_app.table_id = p_to then return; end if;
  select * into v_to from dining_tables where id = p_to and status = 'CONFIRMED' for update;
  if not found then raise exception 'TARGET_NOT_AVAILABLE'; end if;
  select least(v_max, coalesce(va.max_seats, v_max)) into v_seats from venue_availability va where va.venue_id = v_to.venue_id and va.round_id = v_to.round_id;
  if table_headcount(p_to) >= coalesce(v_seats, v_max) then raise exception 'TABLE_FULL'; end if;

  update table_members set left_at = now(), left_reason = 'REALLOCATED' where application_id = p_app and left_at is null;
  insert into table_members (table_id, round_id, application_id, profile_id) values (p_to, v_to.round_id, p_app, v_app.profile_id);
  update applications set table_id = p_to, updated_at = now() where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
  values (p_app, 'MATCH', 'CONFIRMED', 'CONFIRMED', 'SYSTEM', 'SHRINK_REALLOCATED');

  select * into v_venue from venues where id = v_to.venue_id;
  select to_char(start_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI') into v_when from rounds where id = v_to.round_id;
  v_count := table_headcount(p_to);
  insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
  select r.id, null, 'SYSTEM', '인원 조정으로 새로운 분이 합류해 ' || v_count || '명이 됐어요.', 'moved:' || p_app from chat_rooms r where r.table_id = p_to
  on conflict (dedupe_key) do nothing;
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (v_app.profile_id, 'TABLE_CHANGED', '식탁이 바뀌었어요',
          '함께하기로 한 분이 빠져 같은 날 다른 식탁으로 옮겼어요. ' || v_when || coalesce(' · ' || v_venue.name, '') || '에서 만나요.',
          '/applications/' || p_app || '/table', 'moved:' || p_app)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Reallocation, step 2: nobody can take this member in. Full refund allowed, coupon, other dates offered (F-30).
create or replace function public.fail_shrunk_member(p_app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_coupon jsonb := (select value from app_settings where key = 'coupon');
  v_offers int;
begin
  select * into v_app from applications where id = p_app for update;
  if v_app.match_status <> 'CONFIRMED' or v_app.table_id is null then return; end if;

  insert into alternative_offers (application_id, round_id, region_code, rank)
  select p_app, x.round_id, x.region_code, row_number() over (order by x.event_date, x.region_code)
  from (
    select r.id round_id, rr.region_code, r.event_date
    from rounds r join round_regions rr on rr.round_id = r.id
    where r.status = 'OPEN' and r.apply_deadline_at > now()
      and rr.region_code in (select region_code from application_choices where application_id = p_app and region_code <> 'ETC')
      and not exists (select 1 from application_choices c where c.application_id = p_app and c.round_id = r.id)
    order by r.event_date, rr.region_code limit 6
  ) x
  on conflict do nothing;
  get diagnostics v_offers = row_count;

  insert into coupons (profile_id, reason, source_table_id, discount_rate, valid_until)
  values (v_app.profile_id, 'REALLOC_FAILED', v_app.table_id, (v_coupon->>'discount_rate')::int, current_date + (v_coupon->>'valid_days')::int)
  on conflict do nothing;
  update table_members set left_at = now(), left_reason = 'TABLE_CANCELED' where application_id = p_app and left_at is null;
  update applications set match_status = case when v_offers > 0 then 'ALTERNATIVE_OFFERED' else 'EXCEPTION' end,
         payment_status = case when payment_status = 'PAID' then 'REFUND_AVAILABLE' else payment_status end,
         table_id = null, reason_code = 'REALLOC_FAILED', updated_at = now()
  where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, reason) values
    (p_app, 'MATCH', 'CONFIRMED', case when v_offers > 0 then 'ALTERNATIVE_OFFERED' else 'EXCEPTION' end, 'SYSTEM', 'SHRINK_REALLOC_FAILED'),
    (p_app, 'PAYMENT', v_app.payment_status, 'REFUND_AVAILABLE', 'SYSTEM', 'SHRINK_REALLOC_FAILED');
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (v_app.profile_id, 'MATCH_FAILED', '식탁 인원이 줄어 자리를 옮기지 못했어요',
          '일행이 빠져 인원이 부족해졌고, 옮길 다른 식탁도 없었어요. 다른 일정으로 옮기거나 이용권 보관·환불을 고를 수 있어요. 사과의 뜻으로 쿠폰도 드렸어요.',
          '/applications/' || p_app || '/resolve', 'shrink:' || p_app)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Tables that fell under the minimum before the event day and still wait for reallocation (safety net for the scheduler).
create or replace function public.shrunk_tables() returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from dining_tables t join rounds r on r.id = t.round_id
  where t.status = 'CONFIRMED' and r.status = 'MATCHED' and cancel_phase(r.id) in ('EARLY', 'LATE')
    and table_headcount(t.id) < (select (value->>'min')::int from app_settings where key = 'table_size');
$$;

-- Someone who gave notice must not check in, and is neither a feedback target nor a "met" person.
create or replace function public.check_in(p_profile uuid, p_app uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_round rounds;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found or v_app.match_status <> 'CONFIRMED' then raise exception 'NOT_CONFIRMED'; end if;
  if v_app.attendance_status in ('CANCELED_EARLY', 'CANCELED_LATE') then raise exception 'ABSENCE_NOTED'; end if;
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

  insert into relations (from_profile_id, to_profile_id, type, source_table_id)
  select a.profile_id, b.profile_id, 'MET', a.table_id
  from table_members a join table_members b on a.table_id = b.table_id and a.profile_id <> b.profile_id
  join applications aa on aa.id = a.application_id join applications ab on ab.id = b.application_id
  join dining_tables t on t.id = a.table_id
  where t.round_id = p_round and t.status = 'CONFIRMED' and a.left_at is null and b.left_at is null
    and aa.attendance_status <> 'CANCELED_LATE' and ab.attendance_status <> 'CANCELED_LATE'
  on conflict do nothing;

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
  where t.round_id = p_round and t.status = 'CONFIRMED' and a.match_status = 'CONFIRMED' and a.attendance_status <> 'CANCELED_LATE'
  on conflict (dedupe_key) do nothing;

  update dining_tables set status = 'DONE' where round_id = p_round and status = 'CONFIRMED';
  update applications set is_active = false, updated_at = now()
  where id in (select application_id from application_choices where round_id = p_round) and is_active
    and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION');
  update rounds set status = 'DONE' where id = p_round;
  return jsonb_build_object('already', false, 'noshow_candidates', v_candidates);
end;
$$;

-- Demo reset also brings back cancellations, absence notices and reallocation results of the round.
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
  from (select venue_id, count(*) n from dining_tables where round_id = p_round_id and venue_id is not null and status <> 'CANCELED' group by venue_id) x
  where va.venue_id = x.venue_id and va.round_id = p_round_id;
  delete from notifications where dedupe_key in (
    select k || a from unnest(v_apps) a,
      unnest(array['confirm:', 'matchfail:', 'feedback:', 'noshow:', 'noshow-confirmed:', 'reminder:', 'start:', 'cancel:', 'shrink:', 'moved:']) k);
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where (reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
      and profile_id in (select profile_id from applications where id = any(v_apps)))
    or source_table_id = any(v_tables);
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where (round_id = p_round_id and type in ('MATCH_FAILED_ALL', 'VENUE_SHORTAGE'))
    or (type = 'NOSHOW_OBJECTION' and application_id = any(v_apps));
  -- Cancellations and refunds made through the cancel and shrink flows.
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
  where id = any(v_apps) and application_status = 'SUBMITTED' and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION', 'WAITING', 'NO_MATCH')
    and not exists (select 1 from match_resolutions mr where mr.application_id = applications.id);
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

revoke all on function public.cancel_phase(uuid) from public, anon, authenticated;
revoke all on function public.table_headcount(uuid) from public, anon, authenticated;
revoke all on function public.refund_application(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_application(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_absence(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_table(uuid, text) from public, anon, authenticated;
revoke all on function public.after_headcount_drop(uuid) from public, anon, authenticated;
revoke all on function public.move_member_to_table(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_shrunk_member(uuid) from public, anon, authenticated;
revoke all on function public.shrunk_tables() from public, anon, authenticated;
revoke all on function public.check_in(uuid, uuid) from public, anon, authenticated;
revoke all on function public.end_round_event(uuid) from public, anon, authenticated;
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
