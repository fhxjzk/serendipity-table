-- Outside delivery of notifications (기능 명세서 F-40, F-41, F-45, F-70, F-71).
--   * Message templates: the operator edits the text, {변수} is replaced when sent.
--   * Every new notification queues a web push and/or an email per the participant's settings;
--     every system chat message is recorded as a CHAT delivery.
--   * The scheduler sends what is due, retries failures with a growing wait, and passes a delivery
--     that keeps failing to the exception inbox. Venue assignment is retried the same way.

-- Deleting a notification or a chat message (demo reset) removes its delivery rows too.
alter table public.deliveries drop constraint deliveries_notification_id_fkey,
  add constraint deliveries_notification_id_fkey foreign key (notification_id) references public.notifications (id) on delete cascade;
alter table public.deliveries drop constraint deliveries_chat_message_id_fkey,
  add constraint deliveries_chat_message_id_fkey foreign key (chat_message_id) references public.chat_messages (id) on delete cascade;
create index if not exists deliveries_due on public.deliveries (next_retry_at) where status = 'PENDING';
create index if not exists deliveries_created on public.deliveries (created_at desc);

insert into public.app_settings (key, value, description) values
  ('delivery_max_attempts', '3', '웹 푸시·이메일 자동 재시도 횟수(넘으면 예외 처리함)')
on conflict (key) do nothing;

-- F-70 templates. IN_APP codes are also the notification type; CHAT ones are system messages in the table room.
insert into public.message_templates (code, channel, title, body) values
  ('MATCH_CONFIRMED', 'IN_APP', '식탁이 확정됐어요', '{일시} · {식당명}. 함께할 사람과 단체방을 확인해 보세요.'),
  ('MATCH_FAILED', 'IN_APP', '이번에는 식탁을 찾지 못했어요', '다른 일정으로 옮기거나 이용권 보관·환불 중에서 고를 수 있어요. 보상 쿠폰도 함께 드렸어요.'),
  ('REMINDER', 'IN_APP', '내일 식탁에서 만나요', '{일시} · {식당명}. 장소와 예약명을 다시 확인해 주세요.'),
  ('PAYMENT_DONE', 'IN_APP', '결제가 끝났어요', '{결제} 결제로 신청이 접수됐어요. 매칭 결과가 나오면 바로 알려 드릴게요.'),
  ('REFUND_DONE', 'IN_APP', '환불이 끝났어요', '{환불} 환불을 마쳤어요. 결제 수단에 따라 반영까지 며칠 걸릴 수 있어요.'),
  ('VENUE_ASSIGNED', 'IN_APP', '식당이 정해졌어요', '{일시} · {식당명}({주소})에서 만나요. 예약명은 "{예약명}"이에요.'),
  ('CHAT_CONFIRM_NOTICE', 'CHAT', null, '식탁이 확정됐어요. {일시}, {식당명}({주소})에서 만나요. 예약명은 "{예약명}"이에요. 10분 전까지 도착해 주세요.'),
  ('CHAT_CURATION', 'CHAT', null, '{큐레이션} 첫 만남이니 가볍게 인사부터 나눠 보세요.'),
  ('CHAT_REMINDER', 'CHAT', null, E'내일 만나요! {일시}, {식당명}({주소})에서 만나요. 예약명은 "{예약명}"이에요.\n도착하면 테이블 화면에서 체크인해 주세요. 못 오게 되면 미리 알려 주세요.')
on conflict (code) do nothing;

-- "10월 22일 (목) 19:00" in Korean time.
create or replace function public.kst_when(p_at timestamptz) returns text
language sql stable set search_path = public as $$
  select to_char(p_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" ') ||
         '(' || (array['일','월','화','수','목','금','토'])[extract(isodow from p_at at time zone 'Asia/Seoul')::int % 7 + 1] || ') ' ||
         to_char(p_at at time zone 'Asia/Seoul', 'HH24:MI');
$$;

create or replace function public.render_template(p_code text, p_vars jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t message_templates;
  v_title text;
  v_body text;
  kv record;
begin
  select * into t from message_templates where code = p_code;
  if not found then raise exception 'TEMPLATE_NOT_FOUND: %', p_code; end if;
  v_title := t.title;
  v_body := t.body;
  for kv in select key, value from jsonb_each_text(coalesce(p_vars, '{}')) loop
    v_title := replace(v_title, '{' || kv.key || '}', coalesce(kv.value, ''));
    v_body := replace(v_body, '{' || kv.key || '}', coalesce(kv.value, ''));
  end loop;
  return jsonb_build_object('title', v_title, 'body', v_body);
end;
$$;

-- In-app notification from a template (its code is the notification type). Returns null when it already exists.
create or replace function public.notify_template(p_profile uuid, p_code text, p_vars jsonb, p_link text, p_dedupe text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := render_template(p_code, p_vars);
  v_id uuid;
begin
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (p_profile, p_code, v->>'title', v->>'body', p_link, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Which of the five email kinds a notification is (F-06, F-41); null means it is never emailed.
create or replace function public.email_kind(p_type text, p_dedupe text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_type = 'PAYMENT_DONE' then 'email_payment_done'
    when p_type = 'MATCH_CONFIRMED' then 'email_match_confirmed'
    when p_type = 'MATCH_FAILED' then 'email_match_failed'
    when p_type = 'REMINDER' then 'email_reminder'
    when p_type in ('REFUND_DONE', 'TABLE_CANCELED') then 'email_refund_done'
    -- A cancellation is a refund email only when money or a ticket actually came back.
    when p_type = 'CANCELED' and p_dedupe like 'cancel:%' and exists (
      select 1 from applications a where a.id::text = substr(p_dedupe, 8) and a.payment_status = 'REFUNDED') then 'email_refund_done'
  end;
$$;

create or replace function public.queue_notification_deliveries() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  s notification_settings;
  v_kind text := email_kind(new.type, new.dedupe_key);
begin
  select * into p from profiles where id = new.profile_id;
  select * into s from notification_settings where profile_id = new.profile_id;
  -- Web push: switched on and at least one live subscription.
  if coalesce(s.push_enabled, false) and exists (select 1 from push_subscriptions where profile_id = new.profile_id and revoked_at is null) then
    insert into deliveries (notification_id, channel, next_retry_at) values (new.id, 'PUSH', now()) on conflict do nothing;
  end if;
  -- Email: one of the five kinds, an address, that kind switched on (default on), and never to bulk test people.
  if v_kind is not null and p.notify_email is not null and p.origin <> 'BULK'
     and coalesce((to_jsonb(s) ->> v_kind)::boolean, true) then
    insert into deliveries (notification_id, channel, next_retry_at) values (new.id, 'EMAIL', now()) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_queue_deliveries on public.notifications;
create trigger notifications_queue_deliveries after insert on public.notifications
  for each row execute function public.queue_notification_deliveries();

-- A system message is delivered by being stored in the room (everyone sees it there and in realtime).
create or replace function public.record_chat_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_id is null then
    insert into deliveries (chat_message_id, channel, status, attempts, sent_at) values (new.id, 'CHAT', 'SENT', 1, now());
  end if;
  return new;
end;
$$;
drop trigger if exists chat_messages_record_delivery on public.chat_messages;
create trigger chat_messages_record_delivery after insert on public.chat_messages
  for each row execute function public.record_chat_delivery();

-- The sender takes due rows; pushing next_retry_at forward means a parallel tick does not take them too.
create or replace function public.claim_deliveries(p_limit int default 50) returns setof deliveries
language sql security definer set search_path = public as $$
  update deliveries d set next_retry_at = now() + interval '5 minutes'
  where d.id in (
    select id from deliveries
    where status = 'PENDING' and channel in ('PUSH', 'EMAIL') and coalesce(next_retry_at, created_at) <= now()
    order by created_at limit p_limit
    for update skip locked)
  returning d.*;
$$;

-- p_result: SENT, SKIPPED (nothing to send to, not an error) or FAILED (retried until the limit, then an exception).
create or replace function public.finish_delivery(p_id uuid, p_result text, p_error text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  d deliveries;
  v_max int := coalesce((select value::text::int from app_settings where key = 'delivery_max_attempts'), 3);
  n notifications;
begin
  select * into d from deliveries where id = p_id for update;
  if not found then return 'GONE'; end if;
  if p_result = 'SENT' then
    update deliveries set status = 'SENT', attempts = least(attempts + 1, 10), sent_at = now(), next_retry_at = null, last_error = null where id = p_id;
    update exceptions set status = 'RESOLVED', resolved_at = now(), resolution_note = '재시도로 발송됨'
    where dedupe_key = 'delivery:' || p_id and status <> 'RESOLVED';
    return 'SENT';
  elsif p_result = 'SKIPPED' then
    update deliveries set status = 'SKIPPED', next_retry_at = null, last_error = p_error where id = p_id;
    return 'SKIPPED';
  end if;
  if d.attempts + 1 >= v_max then
    update deliveries set status = 'FAILED', attempts = least(attempts + 1, 10), next_retry_at = null, last_error = p_error where id = p_id;
    select * into n from notifications where id = d.notification_id;
    insert into exceptions (type, application_id, reason, detail, dedupe_key)
    values ('DELIVERY_FAILED',
            case when n.link ~ '^/applications/[0-9a-f-]{36}' then substr(n.link, 15, 36)::uuid end,
            case d.channel when 'PUSH' then '웹 푸시' else '이메일' end || ' 발송 ' || (d.attempts + 1) || '회 실패',
            jsonb_build_object('delivery_id', p_id, 'channel', d.channel, 'notification', n.title, 'profile_id', n.profile_id, 'error', p_error),
            'delivery:' || p_id)
    on conflict (dedupe_key) do update set status = 'OPEN', resolved_at = null, reason = excluded.reason, detail = excluded.detail;
    return 'FAILED';
  end if;
  -- 1, 2, 4 ... minutes between tries.
  update deliveries set attempts = attempts + 1, last_error = p_error,
         next_retry_at = now() + interval '1 minute' * power(2, d.attempts)
  where id = p_id;
  return 'RETRY';
end;
$$;

-- Operator: try a failed or skipped delivery once more (S-28).
create or replace function public.retry_delivery(p_actor uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d deliveries;
begin
  select * into d from deliveries where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if d.channel = 'CHAT' or d.status not in ('FAILED', 'SKIPPED') then raise exception 'NOT_RETRYABLE'; end if;
  if d.attempts >= 10 then raise exception 'TOO_MANY_ATTEMPTS'; end if;
  update deliveries set status = 'PENDING', next_retry_at = now() where id = p_id;
  insert into audit_logs (actor_id, action, target_table, target_id, before, after)
  values (p_actor, 'DELIVERY_RETRY', 'deliveries', p_id, jsonb_build_object('status', d.status, 'attempts', d.attempts), jsonb_build_object('status', 'PENDING'));
end;
$$;

create or replace function public.update_message_template(p_actor uuid, p_code text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t message_templates;
begin
  select * into t from message_templates where code = p_code for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'EMPTY_BODY'; end if;
  if t.channel = 'IN_APP' and coalesce(trim(p_title), '') = '' then raise exception 'EMPTY_TITLE'; end if;
  update message_templates set title = case when t.channel = 'IN_APP' then trim(p_title) end, body = trim(p_body),
         updated_by = p_actor, updated_at = now() where code = p_code;
  insert into audit_logs (actor_id, action, target_table, target_id, before, after)
  values (p_actor, 'TEMPLATE_UPDATE', 'message_templates', p_code,
          jsonb_build_object('title', t.title, 'body', t.body), jsonb_build_object('title', p_title, 'body', p_body));
end;
$$;

-- Templates now drive the confirmation notice, curation and in-app notice (same flow as 000600).
create or replace function public.finalize_confirmed_table(
  p_table uuid, p_curation text, p_food_summary text, p_policy text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table dining_tables;
  v_round rounds;
  v_members int;
  v_avail venue_availability;
  v_venue venues;
  v_room uuid;
  v_reservation text;
  v_when text;
  v_vars jsonb;
  m record;
begin
  select * into v_table from dining_tables where id = p_table and status = 'CONFIRMED' for update;
  if not found then raise exception 'TABLE_NOT_CONFIRMED'; end if;
  select * into v_round from rounds where id = v_table.round_id;
  select count(*) into v_members from table_members where table_id = p_table and left_at is null;

  if v_table.venue_id is null then
    select va.* into v_avail
    from venue_availability va join venues v on v.id = va.venue_id
    where va.round_id = v_table.round_id and v.region_code = v_table.region_code and v.active
      and va.booked_slots < va.table_slots and va.max_seats >= v_members
    order by va.booked_slots, v.name
    limit 1
    for update of va;

    if found then
      update venue_availability set booked_slots = booked_slots + 1 where id = v_avail.id;
      v_reservation := '우연한식탁 ' || upper(substr(replace(p_table::text, '-', ''), 1, 4));
      update dining_tables set venue_id = v_avail.venue_id, reservation_name = v_reservation,
             curation = p_curation, food_summary = p_food_summary where id = p_table;
    else
      update dining_tables set curation = p_curation, food_summary = p_food_summary where id = p_table;
      insert into exceptions (type, round_id, table_id, reason, detail, dedupe_key)
      values ('VENUE_SHORTAGE', v_table.round_id, p_table, '지역 식당 재고 부족',
              jsonb_build_object('region', v_table.region_code, 'members', v_members, 'attempts', 1), 'venue:' || p_table)
      on conflict (dedupe_key) do nothing;
    end if;
    select * into v_table from dining_tables where id = p_table;
  end if;
  select * into v_venue from venues where id = v_table.venue_id;

  insert into chat_rooms (table_id) values (p_table) on conflict (table_id) do nothing;
  select id into v_room from chat_rooms where table_id = p_table;

  v_when := kst_when(v_round.start_at);
  v_vars := jsonb_build_object('일시', v_when, '식당명', v_venue.name, '주소', v_venue.address, '예약명', v_table.reservation_name, '큐레이션', p_curation);

  insert into chat_messages (room_id, sender_id, kind, body, dedupe_key) values
    (v_room, null, 'NOTICE',
     case when v_venue.id is null then '식탁이 확정됐어요. ' || v_when || ', 식당은 운영자가 곧 안내해 드릴게요. 10분 전까지 도착해 주세요.'
          else render_template('CHAT_CONFIRM_NOTICE', v_vars)->>'body' end,
     'notice:' || p_table),
    (v_room, null, 'CURATION', render_template('CHAT_CURATION', v_vars)->>'body', 'curation:' || p_table),
    (v_room, null, 'SYSTEM', p_food_summary, 'food:' || p_table),
    (v_room, null, 'SYSTEM', p_policy, 'policy:' || p_table)
  on conflict (dedupe_key) do nothing;

  for m in select profile_id, application_id from table_members where table_id = p_table and left_at is null loop
    perform notify_template(m.profile_id, 'MATCH_CONFIRMED',
      v_vars || jsonb_build_object('식당명', coalesce(v_venue.name, '식당은 곧 안내돼요')),
      '/applications/' || m.application_id || '/table', 'confirm:' || m.application_id);
  end loop;

  return jsonb_build_object('room_id', v_room, 'venue', v_venue.name, 'reservation', v_table.reservation_name);
end;
$$;
revoke all on function public.finalize_confirmed_table(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.post_round_reminder(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_t record;
  v_count int := 0;
  v_vars jsonb;
  m record;
begin
  select * into v_round from rounds where id = p_round;
  if not found or v_round.status <> 'MATCHED' then return 0; end if;

  for v_t in
    select t.id, t.reservation_name, r.id room_id, v.name venue_name, v.address
    from dining_tables t join chat_rooms r on r.table_id = t.id left join venues v on v.id = t.venue_id
    where t.round_id = p_round and t.status = 'CONFIRMED'
  loop
    v_vars := jsonb_build_object('일시', kst_when(v_round.start_at), '식당명', coalesce(v_t.venue_name, '안내된 식당'),
                                 '주소', coalesce(v_t.address, '앱에서 확인'), '예약명', coalesce(v_t.reservation_name, '우연한식탁'));
    insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
    values (v_t.room_id, null, 'REMINDER', render_template('CHAT_REMINDER', v_vars)->>'body', 'reminder:' || v_t.id)
    on conflict (dedupe_key) do nothing;

    for m in select profile_id, application_id from table_members where table_id = v_t.id and left_at is null loop
      perform notify_template(m.profile_id, 'REMINDER', v_vars, '/applications/' || m.application_id || '/table', 'reminder:' || m.application_id);
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- R-24 / F-45: tables still without a venue get another try every tick until the event starts.
-- Success tells the room and the members and closes the shortage exception; each miss is counted on it.
create or replace function public.retry_venue_assignment() returns int
language plpgsql security definer set search_path = public as $$
declare
  t record;
  v_avail venue_availability;
  v_venue venues;
  v_reservation text;
  v_vars jsonb;
  v_done int := 0;
  m record;
begin
  for t in
    select dt.id, dt.round_id, dt.region_code, r.start_at,
           (select count(*) from table_members tm where tm.table_id = dt.id and tm.left_at is null) members
    from dining_tables dt join rounds r on r.id = dt.round_id
    where dt.status = 'CONFIRMED' and dt.venue_id is null and r.status = 'MATCHED' and r.start_at > now()
    for update of dt skip locked
  loop
    select va.* into v_avail
    from venue_availability va join venues v on v.id = va.venue_id
    where va.round_id = t.round_id and v.region_code = t.region_code and v.active
      and va.booked_slots < va.table_slots and va.max_seats >= t.members
    order by va.booked_slots, v.name
    limit 1
    for update of va;

    if not found then
      update exceptions set detail = detail || jsonb_build_object('attempts', coalesce((detail->>'attempts')::int, 1) + 1, 'last_try', now())
      where dedupe_key = 'venue:' || t.id and status <> 'RESOLVED';
      continue;
    end if;

    update venue_availability set booked_slots = booked_slots + 1 where id = v_avail.id;
    v_reservation := '우연한식탁 ' || upper(substr(replace(t.id::text, '-', ''), 1, 4));
    update dining_tables set venue_id = v_avail.venue_id, reservation_name = v_reservation where id = t.id;
    select * into v_venue from venues where id = v_avail.venue_id;
    v_vars := jsonb_build_object('일시', kst_when(t.start_at), '식당명', v_venue.name, '주소', v_venue.address, '예약명', v_reservation);

    insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
    select r.id, null, 'NOTICE', render_template('CHAT_CONFIRM_NOTICE', v_vars)->>'body', 'venue-notice:' || t.id
    from chat_rooms r where r.table_id = t.id
    on conflict (dedupe_key) do nothing;
    for m in select profile_id, application_id from table_members where table_id = t.id and left_at is null loop
      perform notify_template(m.profile_id, 'VENUE_ASSIGNED', v_vars, '/applications/' || m.application_id || '/table', 'venue:' || m.application_id);
    end loop;
    update exceptions set status = 'RESOLVED', resolved_at = now(), resolution_note = '자동 재시도로 ' || v_venue.name || ' 배정'
    where dedupe_key = 'venue:' || t.id and status <> 'RESOLVED';
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.kst_when(timestamptz) from public, anon, authenticated;
revoke all on function public.render_template(text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_template(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.email_kind(text, text) from public, anon, authenticated;
revoke all on function public.queue_notification_deliveries() from public, anon, authenticated;
revoke all on function public.record_chat_delivery() from public, anon, authenticated;
revoke all on function public.claim_deliveries(int) from public, anon, authenticated;
revoke all on function public.finish_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.retry_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_message_template(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.post_round_reminder(uuid) from public, anon, authenticated;
revoke all on function public.retry_venue_assignment() from public, anon, authenticated;

-- Demo reset (as in 001400) also removes the refund and late-venue notices added here.
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
      unnest(array['confirm:', 'matchfail:', 'feedback:', 'feedback-remind:', 'noshow:', 'noshow-confirmed:', 'reminder:', 'start:', 'cancel:', 'shrink:', 'moved:', 'refund:', 'venue:']) k);
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
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
