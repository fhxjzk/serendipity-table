-- FAQ·1:1 문의 자동 답변 (기능 명세서 F-85, 추가 기능). The auto answer is rule-based and reads the
-- person's own latest application. "해결됐어요" closes the inquiry as AUTO_RESOLVED; "운영자에게 보내기"
-- escalates it to the exception inbox, where the operator answers and the person is notified.

insert into public.faq_items (category, question, answer, sort_order)
select * from (values
  ('PAYMENT_REFUND', '환불은 언제까지 되나요?', '행사 2일 전 00:00 전에 취소하면 전액 자동 환불돼요(구독 이용권은 1회가 돌아와요). 행사 2일 전부터는 환불되지 않아요. 단, 인원이 줄어 테이블이 취소되거나 자리를 옮기지 못했을 때는 기간과 관계없이 전액 환불돼요.', 1),
  ('PAYMENT_REFUND', '결제는 언제까지 해야 하나요?', '신청한 뒤 안내된 기한까지 결제해야 매칭 대상이 돼요. 기한이 지나면 신청이 만료되고, 같은 일정에 다시 신청할 수 있어요.', 2),
  ('PAYMENT_REFUND', '이용권과 쿠폰은 어떻게 쓰나요?', '결제 화면에서 1회권이나 구독 이용권을 고르면 돼요. 보상 쿠폰은 가지고 있으면 다음 결제에 자동으로 적용돼요.', 3),
  ('MATCHING', '매칭은 언제 결과가 나오나요?', '행사 3일 전 18:00에 자동으로 매칭돼요. 결과는 홈과 알림함에서 바로 확인할 수 있어요.', 4),
  ('MATCHING', '매칭이 안 되면 어떻게 되나요?', '이유를 알려 드리고, 다른 일정으로 옮기기·이용권 보관·환불 중에서 고를 수 있어요. 사과의 뜻으로 할인 쿠폰도 드려요.', 5),
  ('MATCHING', '어떤 기준으로 사람을 묶나요?', '결제를 마친 분 중에서 같은 날짜·지역이고 나이 차이가 8살 이내인 4~6명을 묶어요. 차단·신고·만나고 싶지 않다고 한 사람은 같은 테이블에 앉지 않아요. 그 안에서 성비, MBTI, 관심사, 만나고 싶은 사람의 성향을 보고 점수가 높은 조합을 골라요.', 6),
  ('SCHEDULE', '모임은 몇 시에, 어디서 하나요?', '목요일 저녁에 열리고, 확정되면 식당 이름·주소·지도·예약명을 알려 드려요. 도착은 시작 10분 전까지 부탁드려요.', 7),
  ('SCHEDULE', '체크인은 언제 하나요?', '행사 시작 30분 전부터 확정된 식탁 화면에서 체크인할 수 있어요. 체크인하지 않으면 노쇼 후보로 표시돼요.', 8),
  ('CANCEL', '못 가게 되면 어떻게 하나요?', '행사 전날까지는 신청 취소를, 행사 당일에는 불참 알림을 보내 주세요. 당일 불참 알림은 환불은 되지 않지만 노쇼로 기록되지 않고, 같은 테이블 단체방에 바로 알려요.', 9),
  ('CANCEL', '노쇼하면 어떻게 되나요?', '체크인 없이 불참하면 노쇼 후보가 되고, 24시간 안에 이의를 제기할 수 있어요. 확정되면 1회는 경고, 2회부터는 참가 제한이 검토돼요.', 10),
  ('ETC', '식사 조건(알레르기·못 먹는 음식)은 누구에게 보이나요?', '이름 없이 테이블 단위로만 요약해서 알려요. 예를 들어 "갑각류 알레르기 1명"처럼 보여요.', 11)
) as v(category, question, answer, sort_order)
where not exists (select 1 from public.faq_items);

-- Rule-based answer for a category, based on the person's latest application.
create or replace function public.inquiry_auto_answer(p_profile uuid, p_category text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a applications;
  v_found boolean;
  v_round uuid;
  v_start timestamptz;
  v_amount int;
  v_open text;
  v_phase text;
begin
  select * into a from applications where profile_id = p_profile order by is_active desc, created_at desc limit 1;
  v_found := found;
  if v_found then
    select round_id into v_round from dining_tables where id = a.table_id;
    if v_round is null then
      select ac.round_id into v_round from application_choices ac join rounds r on r.id = ac.round_id
      where ac.application_id = a.id order by r.event_date desc limit 1;
    end if;
    select start_at into v_start from rounds where id = v_round;
  end if;

  if p_category = 'PAYMENT_REFUND' then
    if not v_found then
      return jsonb_build_object('code', 'REFUND_NO_APP', 'text', '아직 신청 내역이 없어요. 신청 후 취소하면 행사 2일 전 00:00 전까지는 전액 환불돼요.');
    end if;
    if a.payment_status = 'REFUNDED' then
      select amount into v_amount from refunds where application_id = a.id;
      return jsonb_build_object('code', 'REFUND_DONE', 'text', case when v_amount is null then '이용권 1회가 다시 돌아왔어요. 신청 화면에서 보유 이용권을 확인해 주세요.' else '환불이 완료됐어요(' || v_amount || '원, 모의 결제). 결제 수단에 따라 반영 시점이 다를 수 있어요.' end);
    elsif a.payment_status = 'REFUND_AVAILABLE' then
      return jsonb_build_object('code', 'REFUND_AVAILABLE', 'text', '환불할 수 있는 상태예요. 홈의 매칭 결과 화면에서 "환불"을 고르면 바로 처리돼요.');
    elsif a.payment_status = 'PENDING' then
      return jsonb_build_object('code', 'PAY_PENDING', 'text', '아직 결제 전이에요' || coalesce(' (' || to_char(a.payment_due_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI') || '까지)', '') || '. 결제하지 않으면 환불할 금액도 없어요.');
    end if;
    return jsonb_build_object('code', 'REFUND_POLICY', 'text', '행사 2일 전 00:00 전에 취소하면 전액 자동 환불돼요. 그 뒤에는 환불되지 않고, 인원 부족으로 테이블이 취소된 경우만 예외로 전액 환불돼요.');

  elsif p_category = 'MATCHING' then
    if not v_found then return jsonb_build_object('code', 'MATCH_NO_APP', 'text', '신청 내역이 없어요. 먼저 날짜와 지역을 골라 신청해 주세요.'); end if;
    if a.match_status = 'CONFIRMED' then
      return jsonb_build_object('code', 'MATCH_CONFIRMED', 'text', '식탁이 확정됐어요. 홈의 "식탁 정보와 단체방 보기"에서 식당과 함께할 분들을 확인해 주세요.');
    elsif a.match_status in ('ALTERNATIVE_OFFERED', 'EXCEPTION') then
      return jsonb_build_object('code', 'MATCH_FAILED', 'text', '이번에는 식탁을 만들지 못했어요. 홈의 매칭 결과 화면에서 이유를 확인하고 일정 이동·이용권 보관·환불 중에서 골라 주세요.');
    elsif a.match_status = 'NO_MATCH' then
      return jsonb_build_object('code', 'MATCH_CANCELED', 'text', '이미 취소되었거나 종료된 신청이에요.');
    end if;
    return jsonb_build_object('code', 'MATCH_WAITING', 'text', '아직 매칭 전이에요. 행사 3일 전 18:00에 자동으로 매칭되고, 결과는 홈과 알림함에 알려 드려요.');

  elsif p_category = 'SCHEDULE' then
    select string_agg(to_char(event_date, 'FMMM"/"FMDD'), ', ' order by event_date) into v_open from rounds where status = 'OPEN' and apply_deadline_at > now();
    return jsonb_build_object('code', 'SCHEDULE_OPEN', 'text', coalesce('지금 신청할 수 있는 일정은 ' || v_open || '이에요.', '지금 모집 중인 일정이 없어요.') ||
      case when v_start is not null and a.is_active then ' 신청하신 모임은 ' || to_char(v_start at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일" HH24:MI') || '에 시작해요.' else '' end);

  elsif p_category = 'CANCEL' then
    if not v_found or not a.is_active then return jsonb_build_object('code', 'CANCEL_NO_APP', 'text', '취소할 수 있는 진행 중인 신청이 없어요.'); end if;
    v_phase := cancel_phase(v_round);
    return jsonb_build_object('code', 'CANCEL_' || v_phase, 'text', case v_phase
      when 'EARLY' then '지금 취소하면 전액 환불돼요. 홈의 "신청 취소"에서 진행할 수 있어요.'
      when 'LATE' then '지금 취소하면 환불은 되지 않지만 패널티는 없어요. 홈의 "신청 취소"에서 진행할 수 있어요.'
      when 'SAME_DAY' then '행사 당일에는 취소 대신 불참 알림만 보낼 수 있어요. 노쇼로 기록되지 않지만 환불은 되지 않아요.'
      else '행사가 이미 시작되었거나 끝나서 취소할 수 없어요.' end);
  end if;
  return jsonb_build_object('code', 'NONE', 'text', '자동으로 답하기 어려운 문의예요. 아래 "운영자에게 보내기"를 눌러 주시면 직접 확인해서 답변드릴게요.');
end;
$$;

create or replace function public.submit_inquiry(p_profile uuid, p_category text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_auto jsonb;
  v_id uuid;
begin
  if length(trim(coalesce(p_body, ''))) < 2 then raise exception 'BODY_REQUIRED'; end if;
  v_auto := inquiry_auto_answer(p_profile, p_category);
  insert into inquiries (profile_id, category, body, auto_answer_code, answer)
  values (p_profile, p_category, left(trim(p_body), 1000), v_auto->>'code', v_auto->>'text') returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_auto->>'code', 'text', v_auto->>'text');
end;
$$;

-- The person answers the auto answer: solved, or send it on to the operator.
create or replace function public.close_inquiry(p_profile uuid, p_inquiry uuid, p_resolved boolean) returns text
language plpgsql security definer set search_path = public as $$
declare i inquiries;
begin
  select * into i from inquiries where id = p_inquiry and profile_id = p_profile for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if i.status <> 'OPEN' then return i.status; end if;
  if p_resolved then
    update inquiries set status = 'AUTO_RESOLVED' where id = p_inquiry;
    return 'AUTO_RESOLVED';
  end if;
  update inquiries set status = 'ESCALATED', answer = null where id = p_inquiry;
  insert into exceptions (type, inquiry_id, application_id, reason, detail, dedupe_key)
  values ('INQUIRY', p_inquiry, (select id from applications where profile_id = p_profile order by is_active desc, created_at desc limit 1),
          '1:1 문의 (' || case i.category when 'PAYMENT_REFUND' then '결제·환불' when 'MATCHING' then '매칭' when 'SCHEDULE' then '일정' when 'CANCEL' then '취소' else '기타' end || ')',
          jsonb_build_object('text', i.body, 'category', i.category), 'inquiry:' || p_inquiry)
  on conflict (dedupe_key) do nothing;
  return 'ESCALATED';
end;
$$;

-- The operator answers an escalated inquiry; the exception is closed and the person is told.
create or replace function public.answer_inquiry(p_actor uuid, p_inquiry uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare i inquiries;
begin
  if length(trim(coalesce(p_text, ''))) < 2 then raise exception 'ANSWER_REQUIRED'; end if;
  select * into i from inquiries where id = p_inquiry for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if i.status = 'ANSWERED' then raise exception 'ALREADY_RESOLVED'; end if;
  update inquiries set status = 'ANSWERED', answer = left(trim(p_text), 1000), answered_by = p_actor, answered_at = now() where id = p_inquiry;
  update exceptions set status = 'RESOLVED', resolved_by = p_actor, resolved_at = now(), resolution_note = left(trim(p_text), 500)
  where inquiry_id = p_inquiry and status <> 'RESOLVED';
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  values (i.profile_id, 'INQUIRY_ANSWERED', '문의에 답변이 도착했어요', '운영자가 남긴 답변을 확인해 주세요.', '/support', 'inquiry:' || p_inquiry)
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.inquiry_auto_answer(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_inquiry(uuid, text, text) from public, anon, authenticated;
revoke all on function public.close_inquiry(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.answer_inquiry(uuid, uuid, text) from public, anon, authenticated;
