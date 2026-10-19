-- After confirmation (기능 명세서 F-35~F-38): venue, chat room, system messages and
-- in-app notifications for one confirmed table, in one transaction and only once.

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
begin
  select * into v_table from dining_tables where id = p_table and status = 'CONFIRMED' for update;
  if not found then raise exception 'TABLE_NOT_CONFIRMED'; end if;
  select * into v_round from rounds where id = v_table.round_id;
  select count(*) into v_members from table_members where table_id = p_table and left_at is null;

  -- Venue: same region, a free slot that seats everyone; spread bookings across venues.
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
              jsonb_build_object('region', v_table.region_code, 'members', v_members), 'venue:' || p_table)
      on conflict (dedupe_key) do nothing;
    end if;
    select * into v_table from dining_tables where id = p_table;
  end if;
  select * into v_venue from venues where id = v_table.venue_id;

  -- One chat room per table (F-37).
  insert into chat_rooms (table_id) values (p_table) on conflict (table_id) do nothing;
  select id into v_room from chat_rooms where table_id = p_table;

  v_when := to_char(v_round.start_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" ') ||
            '(' || (array['일','월','화','수','목','금','토'])[extract(isodow from v_round.start_at at time zone 'Asia/Seoul')::int % 7 + 1] || ') ' ||
            to_char(v_round.start_at at time zone 'Asia/Seoul', 'HH24:MI');

  insert into chat_messages (room_id, sender_id, kind, body, dedupe_key) values
    (v_room, null, 'NOTICE',
     '식탁이 확정됐어요. ' || v_when || ', ' ||
     coalesce(v_venue.name || '(' || v_venue.address || ')에서 만나요. 예약명은 "' || v_table.reservation_name || '"이에요.',
              '식당은 운영자가 곧 안내해 드릴게요.') ||
     ' 10분 전까지 도착해 주세요.',
     'notice:' || p_table),
    (v_room, null, 'CURATION', p_curation, 'curation:' || p_table),
    (v_room, null, 'SYSTEM', p_food_summary, 'food:' || p_table),
    (v_room, null, 'SYSTEM', p_policy, 'policy:' || p_table)
  on conflict (dedupe_key) do nothing;

  -- In-app notification for each member (F-36, F-39).
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  select m.profile_id, 'MATCH_CONFIRMED', '식탁이 확정됐어요',
         v_when || coalesce(' · ' || v_venue.name, '') || '. 함께할 사람과 단체방을 확인해 보세요.',
         '/applications/' || m.application_id || '/table', 'confirm:' || m.application_id
  from table_members m where m.table_id = p_table and m.left_at is null
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('room_id', v_room, 'venue', v_venue.name, 'reservation', v_table.reservation_name);
end;
$$;
revoke all on function public.finalize_confirmed_table(uuid, text, text, text) from public, anon, authenticated;

-- Demo reset now also frees venue slots and removes matching notifications.
create or replace function public.reset_round_matching(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := (select min(started_at) from match_runs where round_id = p_round_id);
  v_apps uuid[] := (select array_agg(distinct application_id) from application_choices where round_id = p_round_id);
begin
  update rounds set setting_overrides = setting_overrides || '{"auto_match": false}'::jsonb where id = p_round_id;
  if v_since is null then return; end if;
  update venue_availability va set booked_slots = greatest(0, booked_slots - x.n)
  from (select venue_id, count(*) n from dining_tables where round_id = p_round_id and venue_id is not null group by venue_id) x
  where va.venue_id = x.venue_id and va.round_id = p_round_id;
  delete from notifications where dedupe_key in (
    select 'confirm:' || a from unnest(v_apps) a union all select 'matchfail:' || a from unnest(v_apps) a);
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where round_id = p_round_id and type in ('MATCH_FAILED_ALL', 'VENUE_SHORTAGE');
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
