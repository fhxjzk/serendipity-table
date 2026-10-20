-- 모임 안내 나머지 (기능 명세서 F-43, F-44): the day-before reminder and the conversation
-- topics posted at the event start, each sent once per table through dedupe keys.

-- System messages written in one transaction share now(); stamp each row with its own insert
-- time so the room shows them in the order they were written.
alter table public.chat_messages alter column created_at set default clock_timestamp();

-- Conversation content pool: two topics per interest, common topics, and ice-breakers.
alter table public.content_items add constraint content_items_kind_text_key unique (kind, text);

insert into public.content_items (kind, interest_code, text) values
  ('TOPIC', 'EXERCISE', '요즘 꾸준히 하고 있는 운동이 있다면, 처음 시작하게 된 계기는 뭐였나요?'),
  ('TOPIC', 'EXERCISE', '운동하고 나서 꼭 챙겨 먹는 나만의 메뉴가 있나요?'),
  ('TOPIC', 'FOOD_CAFE', '최근에 다녀온 곳 중 남에게 꼭 알려 주고 싶은 맛집이나 카페는 어디인가요?'),
  ('TOPIC', 'FOOD_CAFE', '하루를 한 끼로만 보내야 한다면 어떤 메뉴를 고르실 건가요?'),
  ('TOPIC', 'TRAVEL', '지금까지 다녀온 여행지 중 다시 가고 싶은 곳과 그 이유를 나눠 볼까요?'),
  ('TOPIC', 'TRAVEL', '여행 가면 꼭 하는 나만의 루틴이 있나요?'),
  ('TOPIC', 'MOVIE_DRAMA', '인생 영화나 드라마 한 편을 꼽는다면 무엇인가요?'),
  ('TOPIC', 'MOVIE_DRAMA', '요즘 정주행 중이거나 추천하고 싶은 작품이 있나요?'),
  ('TOPIC', 'MUSIC', '요즘 가장 많이 듣는 노래 한 곡을 소개해 주세요.'),
  ('TOPIC', 'MUSIC', '가 보고 싶은 공연이나 페스티벌이 있나요?'),
  ('TOPIC', 'READING', '최근에 읽은 책이나 글 중 기억에 남는 문장이 있나요?'),
  ('TOPIC', 'READING', '책 한 권을 선물한다면 어떤 책을 고르실 건가요?'),
  ('TOPIC', 'SELF_DEV', '올해 새로 배우기 시작한 것이 있다면 무엇인가요?'),
  ('TOPIC', 'SELF_DEV', '하루 중 나를 위해 꼭 비워 두는 시간이 있나요?'),
  ('TOPIC', 'ART', '최근에 본 전시나 공연 중 인상 깊었던 것이 있나요?'),
  ('TOPIC', 'ART', '집에 작품 하나를 걸 수 있다면 어떤 작품을 걸고 싶나요?'),
  ('TOPIC', 'FASHION_BEAUTY', '나를 가장 잘 표현하는 아이템이나 스타일은 무엇인가요?'),
  ('TOPIC', 'FASHION_BEAUTY', '요즘 빠져 있는 브랜드나 제품이 있나요?'),
  ('TOPIC', 'PHOTO_VIDEO', '휴대폰 사진첩에서 가장 아끼는 사진 한 장을 소개해 줄 수 있나요?'),
  ('TOPIC', 'PHOTO_VIDEO', '요즘 즐겨 보는 유튜브 채널이나 영상이 있나요?'),
  ('TOPIC', null, '이번 주에 있었던 작은 행운 하나를 나눠 볼까요?'),
  ('TOPIC', null, '퇴근 후나 주말에 나만의 회복 방법은 무엇인가요?'),
  ('TOPIC', null, '1년 뒤의 나에게 꼭 해 주고 싶은 말이 있나요?'),
  ('TOPIC', null, '요즘 가장 설레는 계획은 무엇인가요?'),
  ('ICEBREAKER', null, '돌아가며 이름과 함께 오늘 이 자리에 오기 전에 한 일을 한 가지씩 이야기해 봐요.'),
  ('ICEBREAKER', null, '두 가지 진실과 한 가지 거짓말: 나에 대한 문장 세 개 중 거짓을 맞혀 보세요.'),
  ('ICEBREAKER', null, '오늘 메뉴 중 각자 가장 기대되는 음식 하나를 골라 이유를 말해 봐요.'),
  ('ICEBREAKER', null, '나를 세 단어로 소개한다면? 돌아가며 말하고 서로 공통점을 찾아봐요.'),
  ('ICEBREAKER', null, '최근 휴대폰으로 찍은 사진 한 장을 보여 주며 그 순간을 이야기해 봐요.'),
  ('ICEBREAKER', null, '밸런스 게임: 평생 한 가지 음식만 먹기 vs 평생 한 가지 음료만 마시기, 선택하고 이유를 나눠 봐요.')
on conflict (kind, text) do nothing;

-- Spec: the reminder goes out the evening before (18:00 KST).
update public.rounds
set reminder_at = ((event_date - 1)::timestamp + time '18:00') at time zone 'Asia/Seoul'
where status in ('DRAFT', 'OPEN', 'CLOSED', 'MATCHED');

-- F-43: the day-before reminder in every confirmed table's chat room, plus an in-app notification.
create or replace function public.post_round_reminder(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_t record;
  v_count int := 0;
  v_when text;
begin
  select * into v_round from rounds where id = p_round;
  if not found or v_round.status <> 'MATCHED' then return 0; end if;
  v_when := to_char(v_round.start_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI');

  for v_t in
    select t.id, t.reservation_name, r.id room_id, v.name venue_name, v.address
    from dining_tables t join chat_rooms r on r.table_id = t.id left join venues v on v.id = t.venue_id
    where t.round_id = p_round and t.status = 'CONFIRMED'
  loop
    insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
    values (v_t.room_id, null, 'REMINDER',
            '내일 만나요! ' || v_when || ', ' || coalesce(v_t.venue_name || '(' || v_t.address || ')', '안내된 식당') || '에서 만나요.' ||
            coalesce(' 예약명은 "' || v_t.reservation_name || '"이에요.', '') ||
            E'\n도착하면 테이블 화면에서 체크인해 주세요. 못 오게 되면 미리 알려 주세요.',
            'reminder:' || v_t.id)
    on conflict (dedupe_key) do nothing;

    insert into notifications (profile_id, type, title, body, link, dedupe_key)
    select m.profile_id, 'REMINDER', '내일 식탁에서 만나요',
           v_when || coalesce(' · ' || v_t.venue_name, '') || '. 장소와 예약명을 다시 확인해 주세요.',
           '/applications/' || m.application_id || '/table', 'reminder:' || m.application_id
    from table_members m where m.table_id = v_t.id and m.left_at is null
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- F-44: at the start time, three topics (leaning on the table's shared interests) and one
-- ice-breaker go to each confirmed table's room. A table that already has them is skipped.
create or replace function public.post_table_contents(p_round uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_t record;
  v_item record;
  v_msg uuid;
  v_n int;
  v_count int := 0;
begin
  select * into v_round from rounds where id = p_round;
  if not found or v_round.status <> 'MATCHED' then return 0; end if;

  for v_t in
    select t.id, r.id room_id
    from dining_tables t join chat_rooms r on r.table_id = t.id
    where t.round_id = p_round and t.status = 'CONFIRMED'
      and not exists (select 1 from table_contents tc where tc.table_id = t.id)
    order by t.id
    for update of t
  loop
    v_n := 0;
    for v_item in
      with shared as (
        select i interest_code, count(*) n
        from table_members m join profiles p on p.id = m.profile_id, unnest(p.interests) i
        where m.table_id = v_t.id and m.left_at is null
        group by i
      ), pool as (
        -- One topic per interest, so the three topics cover three different things.
        select ci.id, ci.text, coalesce(s.n, 0) n,
               row_number() over (partition by coalesce(ci.interest_code, ci.id::text) order by random()) rn
        from content_items ci left join shared s on s.interest_code = ci.interest_code
        where ci.kind = 'TOPIC' and ci.active and (ci.interest_code is null or s.n is not null)
      )
      select id, text from pool where rn = 1 order by n desc, random() limit 3
    loop
      v_n := v_n + 1;
      insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
      values (v_t.room_id, null, 'TOPIC', 'Q' || v_n || '. ' || v_item.text, 'topic:' || v_t.id || ':' || v_item.id)
      on conflict (dedupe_key) do nothing
      returning id into v_msg;
      insert into table_contents (table_id, content_item_id, posted_message_id) values (v_t.id, v_item.id, v_msg)
      on conflict do nothing;
    end loop;

    select id, text into v_item from content_items where kind = 'ICEBREAKER' and active order by random() limit 1;
    if found then
      insert into chat_messages (room_id, sender_id, kind, body, dedupe_key)
      values (v_t.room_id, null, 'ICEBREAKER', v_item.text, 'topic:' || v_t.id || ':' || v_item.id)
      on conflict (dedupe_key) do nothing
      returning id into v_msg;
      insert into table_contents (table_id, content_item_id, posted_message_id) values (v_t.id, v_item.id, v_msg)
      on conflict do nothing;
    end if;

    insert into notifications (profile_id, type, title, body, link, dedupe_key)
    select m.profile_id, 'EVENT_START', '오늘의 대화 주제가 올라왔어요',
           '단체방에서 대화 주제와 아이스브레이킹을 확인하고, 도착하면 체크인해 주세요.',
           '/chat/' || v_t.room_id, 'start:' || m.application_id
    from table_members m where m.table_id = v_t.id and m.left_at is null
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.post_round_reminder(uuid) from public, anon, authenticated;
revoke all on function public.post_table_contents(uuid) from public, anon, authenticated;

-- Members can see what was posted to their table.
create policy member_read on public.table_contents for select to authenticated
  using (exists (select 1 from public.table_members m where m.table_id = table_contents.table_id and m.profile_id = auth.uid()));

-- Demo reset also clears reminders, posted topics and their notifications.
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
    select k || a from unnest(v_apps) a,
      unnest(array['confirm:', 'matchfail:', 'feedback:', 'noshow:', 'noshow-confirmed:', 'reminder:', 'start:']) k);
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where (round_id = p_round_id and type in ('MATCH_FAILED_ALL', 'VENUE_SHORTAGE'))
    or (type = 'NOSHOW_OBJECTION' and application_id = any(v_apps));
  delete from status_history where field in ('MATCH', 'PAYMENT', 'ATTENDANCE') and actor_type in ('SYSTEM', 'PARTICIPANT')
    and application_id = any(v_apps) and created_at >= v_since;
  update applications set match_status = 'WAITING', payment_status = 'PAID', table_id = null, reason_code = null,
         attendance_status = 'SCHEDULED', checked_in_at = null, is_active = true, updated_at = now()
  where id = any(v_apps) and application_status = 'SUBMITTED' and match_status in ('CONFIRMED', 'ALTERNATIVE_OFFERED', 'EXCEPTION', 'WAITING')
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
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
