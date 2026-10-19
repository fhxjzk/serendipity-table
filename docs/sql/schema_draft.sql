-- 우연한 식탁 MVP — schema draft generated from 03.데이터 정의서 (2026-10-16)
-- Run in a fresh Supabase project, then verify. RLS policies are written in A2.

-- T-01 프로필
create table public.profiles (
  id uuid primary key,
  role text not null default 'PARTICIPANT' check (role in ('PARTICIPANT', 'OPERATOR')),
  name text not null check (char_length(name) <= 20),
  display_name text not null check (char_length(display_name) <= 20),
  phone text not null check (phone ~ '^010-[0-9]{3,4}-[0-9]{4}$'),
  birth_year int not null check (birth_year between 1940 and 2010),
  gender text not null check (gender in ('M', 'F')),
  job text not null check (char_length(job) <= 30),
  mbti text not null default 'UNKNOWN' check (mbti ~ '^([EI][NS][TF][JP]|UNKNOWN)$'),
  interests text[] not null default '{}',
  self_traits text[] not null default '{}',
  wanted_traits text[] not null default '{}',
  price_ranges text[] not null default '{}',
  food_avoid text[] not null default '{}',
  allergies text[] not null default '{}',
  one_liner text check (char_length(one_liner) <= 30),
  drink_pref text check (drink_pref in ('NONE', 'LIGHT', 'LIKE')),
  privacy_agreed_at timestamptz,
  policy_agreed_at timestamptz,
  notify_email text,
  restriction text not null default 'NONE' check (restriction in ('NONE', 'RESTRICTED', 'BANNED')),
  restricted_until date,
  origin text not null default 'APP' check (origin in ('SEED', 'APP', 'BULK')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- T-02 알림 설정
create table public.notification_settings (
  profile_id uuid primary key,
  email_payment_done boolean not null default true,
  email_match_confirmed boolean not null default true,
  email_match_failed boolean not null default true,
  email_reminder boolean not null default true,
  email_refund_done boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- T-03 웹 푸시 구독
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- T-04 코드값
create table public.code_values (
  code_group text not null,
  code text not null,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  primary key (code_group, code)
);

-- T-05 설정값
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- T-06 회차
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  apply_deadline_at timestamptz not null,
  match_run_at timestamptz not null,
  reminder_at timestamptz not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'OPEN', 'CLOSED', 'MATCHED', 'DONE', 'CANCELED')),
  setting_overrides jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  check (match_run_at <= start_at)
);

-- T-07 회차별 지역
create table public.round_regions (
  round_id uuid not null,
  region_code text not null,
  capacity int not null check (capacity between 0 and 1000),
  primary key (round_id, region_code)
);

-- T-08 파트너 식당
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_code text not null,
  address text not null,
  map_url text,
  price_range text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- T-09 식당 재고
create table public.venue_availability (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null,
  round_id uuid not null,
  table_slots int not null check (table_slots between 0 and 50),
  max_seats int not null default 6 check (max_seats between 4 and 12),
  booked_slots int not null default 0,
  unique (venue_id, round_id),
  check (booked_slots <= table_slots)
);

-- T-10 신청
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  application_status text not null default 'DRAFT' check (application_status in ('DRAFT', 'SUBMITTED', 'CANCELED')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'REFUND_AVAILABLE', 'REFUND_REQUESTED', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_FAILED')),
  match_status text not null default 'WAITING' check (match_status in ('WAITING', 'MATCHING', 'REALLOCATING', 'CONFIRMED', 'ALTERNATIVE_OFFERED', 'TRANSFERRED', 'NO_MATCH', 'EXCEPTION')),
  attendance_status text not null default 'SCHEDULED' check (attendance_status in ('SCHEDULED', 'ATTENDED', 'CANCELED_EARLY', 'CANCELED_LATE', 'NO_SHOW')),
  ticket_product_code text,
  user_ticket_id uuid,
  payment_due_at timestamptz,
  table_id uuid,
  transferred_from uuid,
  reason_code text,
  submitted_at timestamptz,
  canceled_at timestamptz,
  checked_in_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- T-11 신청 선택지
create table public.application_choices (
  application_id uuid not null,
  round_id uuid not null,
  region_code text not null,
  primary key (application_id, round_id, region_code)
);

-- T-12 이용권 상품
create table public.ticket_products (
  code text primary key,
  name text not null,
  kind text not null check (kind in ('SINGLE', 'SUBSCRIPTION')),
  price int not null check (price between 0 and 1000000),
  uses int not null check (uses between 1 and 20),
  valid_days int,
  active boolean not null default true
);

-- T-13 보유 이용권
create table public.user_tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  product_code text not null,
  source text not null check (source in ('PURCHASE', 'KEPT')),
  total_uses int not null,
  remaining_uses int not null,
  valid_until date,
  payment_id uuid,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'USED_UP', 'EXPIRED')),
  created_at timestamptz not null default now(),
  check (remaining_uses between 0 and total_uses)
);

-- T-14 이용권 증감 이력
create table public.ticket_ledger (
  id uuid primary key default gen_random_uuid(),
  user_ticket_id uuid not null,
  application_id uuid,
  delta int not null,
  reason text not null check (reason in ('PURCHASE', 'USE', 'RESTORE', 'KEEP', 'EXPIRE')),
  created_at timestamptz not null default now(),
  unique (user_ticket_id, application_id, reason),
  check (delta <> 0)
);

-- T-15 결제(모의)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  application_id uuid,
  product_code text not null,
  amount int not null check (amount between 0 and 1000000),
  discount_amount int not null default 0,
  coupon_id uuid unique,
  method text not null default 'MOCK' check (method in ('MOCK')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FAILED')),
  idempotency_key text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- T-16 환불(모의)
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  application_id uuid not null unique,
  amount int not null check (amount between 0 and 1000000),
  reason text not null check (reason in ('EARLY_CANCEL', 'MATCH_FAILED', 'REALLOC_FAILED', 'TABLE_CANCELED')),
  policy_exception boolean not null default false,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'PROCESSING', 'REFUNDED', 'FAILED')),
  failure_reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- T-17 보상 쿠폰
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  reason text not null check (reason in ('REALLOC_FAILED', 'RUN_WITH_THREE', 'TABLE_CANCELED')),
  source_table_id uuid,
  discount_rate int check (discount_rate between 1 and 100),
  valid_until date,
  status text not null default 'ISSUED' check (status in ('ISSUED', 'USED', 'EXPIRED')),
  issued_at timestamptz not null default now(),
  unique (profile_id, source_table_id)
);

-- T-18 매칭 실행
create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  run_key text not null unique,
  trigger text not null check (trigger in ('SCHEDULER', 'DEMO')),
  algorithm_version text not null,
  settings_snapshot jsonb not null,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  stats jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- T-19 식사 테이블
create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  region_code text not null,
  match_run_id uuid,
  status text not null default 'FORMING' check (status in ('FORMING', 'CONFIRMED', 'CANCELED', 'DONE')),
  score numeric(5,1),
  score_detail jsonb,
  venue_id uuid,
  reservation_name text,
  curation text,
  food_summary text,
  confirmed_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now()
);

-- T-20 테이블 구성원
create table public.table_members (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null,
  round_id uuid not null,
  application_id uuid not null,
  profile_id uuid not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text check (left_reason in ('CANCELED', 'REALLOCATED', 'TABLE_CANCELED'))
);

-- T-21 매칭 처리 이력
create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid,
  application_id uuid not null,
  event_type text not null check (event_type in ('PLACED', 'RELEASED', 'REALLOCATED', 'SPLIT', 'MERGED', 'CONFIRMED', 'FAILED', 'SHRINK')),
  from_table_id uuid,
  to_table_id uuid,
  reason_code text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- T-22 대체 일정 추천
create table public.alternative_offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  round_id uuid not null,
  region_code text not null,
  rank int not null,
  created_at timestamptz not null default now(),
  unique (application_id, round_id, region_code)
);

-- T-23 미매칭 해결
create table public.match_resolutions (
  application_id uuid primary key,
  choice text not null check (choice in ('MOVE', 'KEEP', 'REFUND')),
  target_round_id uuid,
  target_region_code text,
  new_application_id uuid,
  user_ticket_id uuid,
  refund_id uuid,
  resolved_at timestamptz not null default now()
);

-- T-24 단체방
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null unique,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- T-25 단체방 메시지
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  sender_id uuid,
  kind text not null check (kind in ('USER', 'SYSTEM', 'NOTICE', 'CURATION', 'REMINDER', 'TOPIC', 'ICEBREAKER', 'ABSENCE')),
  body text not null check (char_length(body) <= 1000),
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

-- T-26 앱 내 알림
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  type text not null,
  title text not null,
  body text not null,
  link text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- T-27 발송 이력
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid,
  chat_message_id uuid,
  channel text not null check (channel in ('PUSH', 'EMAIL', 'CHAT')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts int not null default 0 check (attempts between 0 and 10),
  last_error text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

-- T-28 메시지 템플릿
create table public.message_templates (
  code text primary key,
  channel text not null check (channel in ('IN_APP', 'EMAIL', 'CHAT')),
  title text,
  body text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- T-29 대화 콘텐츠
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('TOPIC', 'ICEBREAKER')),
  text text not null,
  interest_code text,
  trait_code text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- T-30 테이블 게시 콘텐츠
create table public.table_contents (
  table_id uuid not null,
  content_item_id uuid not null,
  posted_message_id uuid,
  primary key (table_id, content_item_id)
);

-- T-31 피드백
create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique,
  table_id uuid not null,
  profile_id uuid not null,
  mood_score int not null check (mood_score between 1 and 5),
  talk_score int not null check (talk_score between 1 and 5),
  venue_score int not null check (venue_score between 1 and 5),
  rejoin_intent int not null check (rejoin_intent between 1 and 5),
  recommend_intent int not null check (recommend_intent between 1 and 5),
  review_rating int check (review_rating between 1 and 5),
  review_text text check (char_length(review_text) <= 100),
  review_public boolean not null default false,
  review_hidden boolean not null default false,
  submitted_at timestamptz not null default now()
);

-- T-32 사람 간 관계
create table public.relations (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null,
  to_profile_id uuid not null,
  type text not null check (type in ('MET', 'LIKE', 'DISLIKE', 'BLOCK', 'REPORT')),
  source_table_id uuid,
  created_at timestamptz not null default now(),
  unique nulls not distinct (from_profile_id, to_profile_id, type, source_table_id),
  check (from_profile_id <> to_profile_id)
);

-- T-33 신고
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  reported_id uuid not null,
  table_id uuid,
  reason_code text not null,
  detail text check (char_length(detail) <= 1000),
  status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWING', 'RESOLVED')),
  action text check (action in ('NONE', 'WARNING', 'RESTRICTED', 'BANNED')),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- T-34 노쇼 처리
create table public.noshow_cases (
  application_id uuid primary key,
  table_id uuid not null,
  candidate_at timestamptz not null default now(),
  adjusted_at timestamptz,
  notice_sent_at timestamptz,
  objection_deadline_at timestamptz,
  objection_at timestamptz,
  objection_text text check (char_length(objection_text) <= 500),
  result text not null default 'PENDING' check (result in ('PENDING', 'ATTENDED', 'NO_SHOW', 'ESCALATED')),
  decided_at timestamptz
);

-- T-35 패널티 기록
create table public.penalty_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  application_id uuid not null,
  kind text not null check (kind in ('LATE_CANCEL', 'SAME_DAY_CANCEL', 'NO_SHOW')),
  created_at timestamptz not null default now(),
  unique (application_id, kind)
);

-- T-36 경고·제한
create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  level text not null check (level in ('WARNING', 'RESTRICTION', 'BAN')),
  status text not null default 'PROPOSED' check (status in ('PROPOSED', 'CONFIRMED', 'REJECTED')),
  source text not null check (source in ('PENALTY', 'REPORT')),
  report_id uuid,
  reason text not null,
  until_date date,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- T-37 예외
create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('PAYMENT_ERROR', 'DATA_MISSING', 'VENUE_SHORTAGE', 'CONDITION_CONFLICT', 'MATCH_FAILED_ALL', 'DELIVERY_FAILED', 'REFUND_FAILED', 'NOSHOW_OBJECTION', 'INQUIRY')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  round_id uuid,
  table_id uuid,
  application_id uuid,
  inquiry_id uuid,
  reason text not null,
  detail jsonb not null default '{}',
  dedupe_key text not null unique,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

-- T-38 상태 변경 이력
create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  field text not null check (field in ('APPLICATION', 'PAYMENT', 'MATCH', 'ATTENDANCE')),
  from_value text,
  to_value text not null,
  actor_type text not null check (actor_type in ('PARTICIPANT', 'OPERATOR', 'SYSTEM')),
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

-- T-39 운영자 변경 이력
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_table text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- T-40 자동 작업 실행
create table public.job_runs (
  job_key text primary key,
  job_type text not null check (job_type in ('MATCH', 'REMINDER', 'EVENT_START', 'EVENT_END', 'NOSHOW_CONFIRM', 'FEEDBACK_REMIND', 'RETRY')),
  round_id uuid,
  trigger text not null check (trigger in ('SCHEDULER', 'DEMO')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  result jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- T-41 대기자 참가 제안
create table public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null,
  application_id uuid not null,
  offered_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  response text not null default 'PENDING' check (response in ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  responded_at timestamptz,
  unique (table_id, application_id)
);

-- T-42 FAQ
create table public.faq_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('PAYMENT_REFUND', 'MATCHING', 'SCHEDULE', 'CANCEL', 'ETC')),
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

-- T-43 1:1 문의
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  category text not null check (category in ('PAYMENT_REFUND', 'MATCHING', 'SCHEDULE', 'CANCEL', 'ETC')),
  body text not null check (char_length(body) <= 1000),
  auto_answer_code text,
  status text not null default 'OPEN' check (status in ('OPEN', 'AUTO_RESOLVED', 'ESCALATED', 'ANSWERED')),
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- T-44 밸런스 질문 답
create table public.balance_answers (
  profile_id uuid not null,
  question_code text not null,
  answer text not null check (answer in ('A', 'B')),
  primary key (profile_id, question_code)
);

-- Foreign keys (added after all tables because of circular references)
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
alter table public.notification_settings add constraint notification_settings_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.push_subscriptions add constraint push_subscriptions_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.app_settings add constraint app_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id);
alter table public.rounds add constraint rounds_created_by_fkey foreign key (created_by) references public.profiles (id);
alter table public.round_regions add constraint round_regions_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.venue_availability add constraint venue_availability_venue_id_fkey foreign key (venue_id) references public.venues (id);
alter table public.venue_availability add constraint venue_availability_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.applications add constraint applications_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.applications add constraint applications_ticket_product_code_fkey foreign key (ticket_product_code) references public.ticket_products (code);
alter table public.applications add constraint applications_user_ticket_id_fkey foreign key (user_ticket_id) references public.user_tickets (id);
alter table public.applications add constraint applications_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.applications add constraint applications_transferred_from_fkey foreign key (transferred_from) references public.applications (id);
alter table public.application_choices add constraint application_choices_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.application_choices add constraint application_choices_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.user_tickets add constraint user_tickets_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.user_tickets add constraint user_tickets_product_code_fkey foreign key (product_code) references public.ticket_products (code);
alter table public.user_tickets add constraint user_tickets_payment_id_fkey foreign key (payment_id) references public.payments (id);
alter table public.ticket_ledger add constraint ticket_ledger_user_ticket_id_fkey foreign key (user_ticket_id) references public.user_tickets (id);
alter table public.ticket_ledger add constraint ticket_ledger_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.payments add constraint payments_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.payments add constraint payments_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.payments add constraint payments_product_code_fkey foreign key (product_code) references public.ticket_products (code);
alter table public.payments add constraint payments_coupon_id_fkey foreign key (coupon_id) references public.coupons (id);
alter table public.refunds add constraint refunds_payment_id_fkey foreign key (payment_id) references public.payments (id);
alter table public.refunds add constraint refunds_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.coupons add constraint coupons_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.coupons add constraint coupons_source_table_id_fkey foreign key (source_table_id) references public.dining_tables (id);
alter table public.match_runs add constraint match_runs_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.dining_tables add constraint dining_tables_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.dining_tables add constraint dining_tables_match_run_id_fkey foreign key (match_run_id) references public.match_runs (id);
alter table public.dining_tables add constraint dining_tables_venue_id_fkey foreign key (venue_id) references public.venues (id);
alter table public.table_members add constraint table_members_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.table_members add constraint table_members_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.table_members add constraint table_members_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.table_members add constraint table_members_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.match_events add constraint match_events_match_run_id_fkey foreign key (match_run_id) references public.match_runs (id);
alter table public.match_events add constraint match_events_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.match_events add constraint match_events_from_table_id_fkey foreign key (from_table_id) references public.dining_tables (id);
alter table public.match_events add constraint match_events_to_table_id_fkey foreign key (to_table_id) references public.dining_tables (id);
alter table public.alternative_offers add constraint alternative_offers_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.alternative_offers add constraint alternative_offers_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.match_resolutions add constraint match_resolutions_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.match_resolutions add constraint match_resolutions_target_round_id_fkey foreign key (target_round_id) references public.rounds (id);
alter table public.match_resolutions add constraint match_resolutions_new_application_id_fkey foreign key (new_application_id) references public.applications (id);
alter table public.match_resolutions add constraint match_resolutions_user_ticket_id_fkey foreign key (user_ticket_id) references public.user_tickets (id);
alter table public.match_resolutions add constraint match_resolutions_refund_id_fkey foreign key (refund_id) references public.refunds (id);
alter table public.chat_rooms add constraint chat_rooms_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.chat_messages add constraint chat_messages_room_id_fkey foreign key (room_id) references public.chat_rooms (id);
alter table public.chat_messages add constraint chat_messages_sender_id_fkey foreign key (sender_id) references public.profiles (id);
alter table public.notifications add constraint notifications_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.deliveries add constraint deliveries_notification_id_fkey foreign key (notification_id) references public.notifications (id);
alter table public.deliveries add constraint deliveries_chat_message_id_fkey foreign key (chat_message_id) references public.chat_messages (id);
alter table public.message_templates add constraint message_templates_updated_by_fkey foreign key (updated_by) references public.profiles (id);
alter table public.table_contents add constraint table_contents_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.table_contents add constraint table_contents_content_item_id_fkey foreign key (content_item_id) references public.content_items (id);
alter table public.table_contents add constraint table_contents_posted_message_id_fkey foreign key (posted_message_id) references public.chat_messages (id);
alter table public.feedbacks add constraint feedbacks_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.feedbacks add constraint feedbacks_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.feedbacks add constraint feedbacks_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.relations add constraint relations_from_profile_id_fkey foreign key (from_profile_id) references public.profiles (id);
alter table public.relations add constraint relations_to_profile_id_fkey foreign key (to_profile_id) references public.profiles (id);
alter table public.relations add constraint relations_source_table_id_fkey foreign key (source_table_id) references public.dining_tables (id);
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles (id);
alter table public.reports add constraint reports_reported_id_fkey foreign key (reported_id) references public.profiles (id);
alter table public.reports add constraint reports_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.reports add constraint reports_handled_by_fkey foreign key (handled_by) references public.profiles (id);
alter table public.noshow_cases add constraint noshow_cases_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.noshow_cases add constraint noshow_cases_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.penalty_records add constraint penalty_records_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.penalty_records add constraint penalty_records_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.sanctions add constraint sanctions_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.sanctions add constraint sanctions_report_id_fkey foreign key (report_id) references public.reports (id);
alter table public.sanctions add constraint sanctions_decided_by_fkey foreign key (decided_by) references public.profiles (id);
alter table public.exceptions add constraint exceptions_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.exceptions add constraint exceptions_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.exceptions add constraint exceptions_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.exceptions add constraint exceptions_inquiry_id_fkey foreign key (inquiry_id) references public.inquiries (id);
alter table public.exceptions add constraint exceptions_resolved_by_fkey foreign key (resolved_by) references public.profiles (id);
alter table public.status_history add constraint status_history_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.status_history add constraint status_history_actor_id_fkey foreign key (actor_id) references public.profiles (id);
alter table public.audit_logs add constraint audit_logs_actor_id_fkey foreign key (actor_id) references public.profiles (id);
alter table public.job_runs add constraint job_runs_round_id_fkey foreign key (round_id) references public.rounds (id);
alter table public.waitlist_offers add constraint waitlist_offers_table_id_fkey foreign key (table_id) references public.dining_tables (id);
alter table public.waitlist_offers add constraint waitlist_offers_application_id_fkey foreign key (application_id) references public.applications (id);
alter table public.inquiries add constraint inquiries_profile_id_fkey foreign key (profile_id) references public.profiles (id);
alter table public.inquiries add constraint inquiries_answered_by_fkey foreign key (answered_by) references public.profiles (id);
alter table public.balance_answers add constraint balance_answers_profile_id_fkey foreign key (profile_id) references public.profiles (id);

-- Indexes and partial unique indexes
create unique index applications_one_active on public.applications (profile_id) where is_active;
create index application_choices_slot on public.application_choices (round_id, region_code);
create unique index table_members_one_per_round on public.table_members (round_id, profile_id) where left_at is null;
create unique index table_members_one_per_application on public.table_members (application_id) where left_at is null;
create index chat_messages_room_time on public.chat_messages (room_id, created_at);
create index notifications_inbox on public.notifications (profile_id, created_at desc);
create index relations_from on public.relations (from_profile_id, type);
create index exceptions_open on public.exceptions (status, created_at);
create index status_history_app on public.status_history (application_id, created_at);

-- Row level security on every table (policies follow in A2)
alter table public.profiles enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.code_values enable row level security;
alter table public.app_settings enable row level security;
alter table public.rounds enable row level security;
alter table public.round_regions enable row level security;
alter table public.venues enable row level security;
alter table public.venue_availability enable row level security;
alter table public.applications enable row level security;
alter table public.application_choices enable row level security;
alter table public.ticket_products enable row level security;
alter table public.user_tickets enable row level security;
alter table public.ticket_ledger enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.coupons enable row level security;
alter table public.match_runs enable row level security;
alter table public.dining_tables enable row level security;
alter table public.table_members enable row level security;
alter table public.match_events enable row level security;
alter table public.alternative_offers enable row level security;
alter table public.match_resolutions enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.deliveries enable row level security;
alter table public.message_templates enable row level security;
alter table public.content_items enable row level security;
alter table public.table_contents enable row level security;
alter table public.feedbacks enable row level security;
alter table public.relations enable row level security;
alter table public.reports enable row level security;
alter table public.noshow_cases enable row level security;
alter table public.penalty_records enable row level security;
alter table public.sanctions enable row level security;
alter table public.exceptions enable row level security;
alter table public.status_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.job_runs enable row level security;
alter table public.waitlist_offers enable row level security;
alter table public.faq_items enable row level security;
alter table public.inquiries enable row level security;
alter table public.balance_answers enable row level security;

-- Realtime for the chat room and inbox
alter publication supabase_realtime add table public.chat_messages, public.notifications;

-- Seed: code values
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'EXERCISE', '운동(헬스·러닝·클라이밍 등)', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'FOOD_CAFE', '맛집·카페 탐방', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'TRAVEL', '여행', 3);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'MOVIE_DRAMA', '영화·드라마', 4);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'MUSIC', '음악', 5);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'READING', '독서·글쓰기', 6);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'SELF_DEV', '자기계발·공부', 7);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'ART', '전시·공연·아트', 8);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'FASHION_BEAUTY', '패션·뷰티', 9);
insert into public.code_values (code_group, code, label, sort_order) values ('INTEREST', 'PHOTO_VIDEO', '사진·영상', 10);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'LISTENER', '경청을 잘 함', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'DEEP_TALK', '깊은 대화를 좋아함', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'HUMOR_TALK', '가볍고 유머 있는 대화를 좋아함', 3);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'CALM', '잔잔하고 조용한 편', 4);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'ENERGETIC', '활기차고 에너지 있는 편', 5);
insert into public.code_values (code_group, code, label, sort_order) values ('SELF_TRAIT', 'LEADER', '이야기를 이끄는 편', 6);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'EASY_HUMOR', '편하고 유머 있는 사람', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'CALM_STABLE', '잔잔하고 안정적인 사람', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'DEEP_TALK', '깊은 대화가 되는 사람', 3);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'SIMILAR', '나와 비슷한 사람', 4);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'DIFFERENT', '나와 다른 자극을 주는 사람', 5);
insert into public.code_values (code_group, code, label, sort_order) values ('WANTED_TRAIT', 'PASSIONATE', '열정 있는 사람', 6);
insert into public.code_values (code_group, code, label, sort_order) values ('REGION', 'HONGDAE', '홍대/합정', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('REGION', 'GANGNAM', '강남/신논현', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('REGION', 'EULJIRO', '을지로/종로', 3);
insert into public.code_values (code_group, code, label, sort_order) values ('REGION', 'JAMSIL', '잠실', 4);
insert into public.code_values (code_group, code, label, sort_order) values ('REGION', 'ETC', '기타(매칭 대상 아님)', 5);
insert into public.code_values (code_group, code, label, sort_order) values ('PRICE_RANGE', 'P10_20', '10,000~20,000원', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('PRICE_RANGE', 'P20_30', '20,000~30,000원', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('PRICE_RANGE', 'P30_PLUS', '30,000원 이상(상관 없음)', 3);
insert into public.code_values (code_group, code, label, sort_order) values ('DRINK_PREF', 'NONE', '안 마심', 1);
insert into public.code_values (code_group, code, label, sort_order) values ('DRINK_PREF', 'LIGHT', '가볍게', 2);
insert into public.code_values (code_group, code, label, sort_order) values ('DRINK_PREF', 'LIKE', '좋아함', 3);

-- Seed: ticket products (amounts from the virtual data, to be confirmed)
insert into public.ticket_products (code, name, kind, price, uses, valid_days) values ('SINGLE', '1회권', 'SINGLE', 8000, 1, null), ('PACK3', '3회권', 'SUBSCRIPTION', 15000, 3, 60), ('PACK4', '4회권', 'SUBSCRIPTION', 18000, 4, 60);

-- Seed: settings (기능 명세서 2.4)
insert into public.app_settings (key, value) values ('match_weights', '{"gender_balance":30,"mbti":25,"interests":20,"wanted_traits":15,"new_people":10}'::jsonb);
insert into public.app_settings (key, value) values ('min_match_score', '60'::jsonb);
insert into public.app_settings (key, value) values ('table_size', '{"min":4,"max":6}'::jsonb);
insert into public.app_settings (key, value) values ('max_age_gap', '8'::jsonb);
insert into public.app_settings (key, value) values ('payment_due_hours', '24'::jsonb);
insert into public.app_settings (key, value) values ('retry_max_attempts', '3'::jsonb);
insert into public.app_settings (key, value) values ('noshow_objection_hours', '24'::jsonb);
insert into public.app_settings (key, value) values ('feedback_remind_hours', '24'::jsonb);
insert into public.app_settings (key, value) values ('penalty', '{"same_day_cancel_warn_count":2,"same_day_cancel_window_months":3,"noshow_warn_count":1,"noshow_restrict_propose_count":2}'::jsonb);
insert into public.app_settings (key, value) values ('chat_poll_fallback_seconds', '30'::jsonb);

-- Korean comments (logical names for ERD tools)
comment on table public.profiles is '프로필';
comment on column public.profiles.id is 'Auth 사용자 ID';
comment on column public.profiles.role is '역할';
comment on column public.profiles.name is '이름';
comment on column public.profiles.display_name is '표시 이름(같은 테이블에 공개)';
comment on column public.profiles.phone is '연락처';
comment on column public.profiles.birth_year is '출생연도';
comment on column public.profiles.gender is '성별';
comment on column public.profiles.job is '직업';
comment on column public.profiles.mbti is 'MBTI 16종 또는 UNKNOWN';
comment on column public.profiles.interests is '관심사 코드(INTEREST)';
comment on column public.profiles.self_traits is '본인 성향 코드(SELF_TRAIT)';
comment on column public.profiles.wanted_traits is '만나고 싶은 사람 코드(WANTED_TRAIT)';
comment on column public.profiles.price_ranges is '희망 식사 가격대 코드(PRICE_RANGE, 복수)';
comment on column public.profiles.food_avoid is '못 먹는 음식';
comment on column public.profiles.allergies is '알레르기';
comment on column public.profiles.one_liner is '한 줄 소개(선택)';
comment on column public.profiles.drink_pref is '음주 선호(추가 R-47)';
comment on column public.profiles.privacy_agreed_at is '개인정보 수집·이용 동의 시각';
comment on column public.profiles.policy_agreed_at is '운영 정책 동의 시각';
comment on column public.profiles.notify_email is '알림 받을 이메일(선택)';
comment on column public.profiles.restriction is '참가 제한 상태';
comment on column public.profiles.restricted_until is '참가 제한 종료일';
comment on column public.profiles.origin is '생성 경로. SEED·BULK는 이메일을 보내지 않는다';
comment on column public.profiles.created_at is '생성 시각';
comment on column public.profiles.updated_at is '수정 시각';
comment on table public.notification_settings is '알림 설정';
comment on column public.notification_settings.profile_id is '프로필';
comment on column public.notification_settings.email_payment_done is '결제 완료 메일';
comment on column public.notification_settings.email_match_confirmed is '매칭 확정 메일';
comment on column public.notification_settings.email_match_failed is '매칭 실패 메일';
comment on column public.notification_settings.email_reminder is '행사 1일 전 메일';
comment on column public.notification_settings.email_refund_done is '환불 완료 메일';
comment on column public.notification_settings.push_enabled is '웹 푸시 사용';
comment on column public.notification_settings.updated_at is '수정 시각';
comment on table public.push_subscriptions is '웹 푸시 구독';
comment on column public.push_subscriptions.id is '식별자';
comment on column public.push_subscriptions.profile_id is '프로필';
comment on column public.push_subscriptions.endpoint is '푸시 서비스 주소';
comment on column public.push_subscriptions.p256dh is '암호화 공개키';
comment on column public.push_subscriptions.auth_key is '인증 키';
comment on column public.push_subscriptions.user_agent is '기기 정보';
comment on column public.push_subscriptions.created_at is '생성 시각';
comment on column public.push_subscriptions.revoked_at is '해지 시각(발송 실패 410 등)';
comment on table public.code_values is '코드값';
comment on column public.code_values.code_group is '코드 그룹(6장)';
comment on column public.code_values.code is '코드';
comment on column public.code_values.label is '화면 표시 이름';
comment on column public.code_values.sort_order is '표시 순서';
comment on column public.code_values.active is '사용 여부';
comment on table public.app_settings is '설정값';
comment on column public.app_settings.key is '설정 키';
comment on column public.app_settings.value is '설정 값';
comment on column public.app_settings.description is '설명';
comment on column public.app_settings.updated_by is '수정한 운영자';
comment on column public.app_settings.updated_at is '수정 시각';
comment on table public.rounds is '회차';
comment on column public.rounds.id is '식별자';
comment on column public.rounds.title is '예: 10/22(목) 저녁';
comment on column public.rounds.event_date is '행사일';
comment on column public.rounds.start_at is '행사 시작 시각';
comment on column public.rounds.end_at is '행사 종료 시각';
comment on column public.rounds.apply_deadline_at is '신청·결제 마감';
comment on column public.rounds.match_run_at is '자동 매칭 실행 시각';
comment on column public.rounds.reminder_at is '1일 전 리마인드 시각';
comment on column public.rounds.status is '회차 상태';
comment on column public.rounds.setting_overrides is '회차별 설정 덮어쓰기';
comment on column public.rounds.created_by is '만든 운영자';
comment on column public.rounds.created_at is '생성 시각';
comment on table public.round_regions is '회차별 지역';
comment on column public.round_regions.round_id is '회차';
comment on column public.round_regions.region_code is '지역 코드(REGION)';
comment on column public.round_regions.capacity is '정원';
comment on table public.venues is '파트너 식당';
comment on column public.venues.id is '식별자';
comment on column public.venues.name is '식당명';
comment on column public.venues.region_code is '지역 코드';
comment on column public.venues.address is '주소';
comment on column public.venues.map_url is '지도 링크';
comment on column public.venues.price_range is '가격대 코드(PRICE_RANGE)';
comment on column public.venues.active is '사용 여부';
comment on column public.venues.created_at is '생성 시각';
comment on table public.venue_availability is '식당 재고';
comment on column public.venue_availability.id is '식별자';
comment on column public.venue_availability.venue_id is '식당';
comment on column public.venue_availability.round_id is '회차';
comment on column public.venue_availability.table_slots is '받을 수 있는 테이블 수';
comment on column public.venue_availability.max_seats is '테이블당 최대 인원';
comment on column public.venue_availability.booked_slots is '배정된 테이블 수';
comment on table public.applications is '신청';
comment on column public.applications.id is '식별자';
comment on column public.applications.profile_id is '신청자';
comment on column public.applications.application_status is '신청 상태';
comment on column public.applications.payment_status is '결제 상태';
comment on column public.applications.match_status is '매칭 상태';
comment on column public.applications.attendance_status is '참석 상태';
comment on column public.applications.ticket_product_code is '고른 이용권 상품';
comment on column public.applications.user_ticket_id is '차감한 보유 이용권(구독)';
comment on column public.applications.payment_due_at is '결제 기한';
comment on column public.applications.table_id is '현재 배정 테이블';
comment on column public.applications.transferred_from is '대체 일정 이동 전 신청';
comment on column public.applications.reason_code is '최근 처리 사유 코드(참가자 문구로 변환)';
comment on column public.applications.submitted_at is '제출 시각';
comment on column public.applications.canceled_at is '취소·불참 알림 시각';
comment on column public.applications.checked_in_at is '체크인 시각';
comment on column public.applications.is_active is '진행 중 여부(종료·취소·이동 시 false)';
comment on column public.applications.created_at is '생성 시각';
comment on column public.applications.updated_at is '수정 시각';
comment on table public.application_choices is '신청 선택지';
comment on column public.application_choices.application_id is '신청';
comment on column public.application_choices.round_id is '회차(날짜)';
comment on column public.application_choices.region_code is '지역 코드';
comment on table public.ticket_products is '이용권 상품';
comment on column public.ticket_products.code is 'SINGLE · PACK3 · PACK4';
comment on column public.ticket_products.name is '상품명';
comment on column public.ticket_products.kind is '1회권·구독';
comment on column public.ticket_products.price is '가격(원)';
comment on column public.ticket_products.uses is '사용 횟수';
comment on column public.ticket_products.valid_days is '유효기간(일), 1회권은 없음';
comment on column public.ticket_products.active is '판매 여부';
comment on table public.user_tickets is '보유 이용권';
comment on column public.user_tickets.id is '식별자';
comment on column public.user_tickets.profile_id is '보유자';
comment on column public.user_tickets.product_code is '상품';
comment on column public.user_tickets.source is '구매·보관';
comment on column public.user_tickets.total_uses is '전체 횟수';
comment on column public.user_tickets.remaining_uses is '남은 횟수';
comment on column public.user_tickets.valid_until is '유효기간';
comment on column public.user_tickets.payment_id is '구매 결제';
comment on column public.user_tickets.status is '상태';
comment on column public.user_tickets.created_at is '생성 시각';
comment on table public.ticket_ledger is '이용권 증감 이력';
comment on column public.ticket_ledger.id is '식별자';
comment on column public.ticket_ledger.user_ticket_id is '보유 이용권';
comment on column public.ticket_ledger.application_id is '관련 신청';
comment on column public.ticket_ledger.delta is '증감(−1 차감, +1 복원)';
comment on column public.ticket_ledger.reason is '사유';
comment on column public.ticket_ledger.created_at is '생성 시각';
comment on table public.payments is '결제(모의)';
comment on column public.payments.id is '식별자';
comment on column public.payments.profile_id is '결제자';
comment on column public.payments.application_id is '신청(구독 구매만 하면 없음)';
comment on column public.payments.product_code is '상품';
comment on column public.payments.amount is '결제 금액(할인 후)';
comment on column public.payments.discount_amount is '쿠폰 할인액';
comment on column public.payments.coupon_id is '사용한 쿠폰(쿠폰 1장은 결제 1건에만)';
comment on column public.payments.method is '결제 수단';
comment on column public.payments.status is '결제 결과';
comment on column public.payments.idempotency_key is '중복 결제 방지 키';
comment on column public.payments.paid_at is '결제 시각';
comment on column public.payments.created_at is '생성 시각';
comment on table public.refunds is '환불(모의)';
comment on column public.refunds.id is '식별자';
comment on column public.refunds.payment_id is '원결제';
comment on column public.refunds.application_id is '신청(1건만)';
comment on column public.refunds.amount is '환불 금액';
comment on column public.refunds.reason is '사유';
comment on column public.refunds.policy_exception is '환불 제한 기간 예외';
comment on column public.refunds.status is '처리 상태';
comment on column public.refunds.failure_reason is '실패 사유';
comment on column public.refunds.requested_at is '요청 시각';
comment on column public.refunds.completed_at is '완료 시각';
comment on table public.coupons is '보상 쿠폰';
comment on column public.coupons.id is '식별자';
comment on column public.coupons.profile_id is '받은 사람';
comment on column public.coupons.reason is '발급 사유';
comment on column public.coupons.source_table_id is '원인이 된 테이블';
comment on column public.coupons.discount_rate is '할인율(%) — 설정값 보류';
comment on column public.coupons.valid_until is '유효기간';
comment on column public.coupons.status is '상태';
comment on column public.coupons.issued_at is '발급 시각';
comment on table public.match_runs is '매칭 실행';
comment on column public.match_runs.id is '식별자';
comment on column public.match_runs.round_id is '회차';
comment on column public.match_runs.run_key is '멱등 키(MATCH:회차ID)';
comment on column public.match_runs.trigger is '실행 경로';
comment on column public.match_runs.algorithm_version is '알고리즘 버전';
comment on column public.match_runs.settings_snapshot is '실행 당시 가중치·최소 점수';
comment on column public.match_runs.status is '실행 상태';
comment on column public.match_runs.stats is '후보·테이블·확정·재배치·실패 수';
comment on column public.match_runs.error is '실패 사유';
comment on column public.match_runs.started_at is '시작';
comment on column public.match_runs.finished_at is '종료';
comment on table public.dining_tables is '식사 테이블';
comment on column public.dining_tables.id is '식별자';
comment on column public.dining_tables.round_id is '회차';
comment on column public.dining_tables.region_code is '지역 코드';
comment on column public.dining_tables.match_run_id is '만든 매칭 실행';
comment on column public.dining_tables.status is '테이블 상태';
comment on column public.dining_tables.score is '선호 점수(운영자만)';
comment on column public.dining_tables.score_detail is '항목별 점수(운영자만)';
comment on column public.dining_tables.venue_id is '배정 식당';
comment on column public.dining_tables.reservation_name is '예약명';
comment on column public.dining_tables.curation is '테이블 조합 큐레이션 문구';
comment on column public.dining_tables.food_summary is '이름 없는 식사 조건 요약';
comment on column public.dining_tables.confirmed_at is '확정 시각';
comment on column public.dining_tables.canceled_at is '취소 시각';
comment on column public.dining_tables.cancel_reason is '취소 사유';
comment on column public.dining_tables.created_at is '생성 시각';
comment on table public.table_members is '테이블 구성원';
comment on column public.table_members.id is '식별자';
comment on column public.table_members.table_id is '테이블';
comment on column public.table_members.round_id is '회차(중복 배치 방지용)';
comment on column public.table_members.application_id is '신청';
comment on column public.table_members.profile_id is '참가자';
comment on column public.table_members.joined_at is '배치 시각';
comment on column public.table_members.left_at is '빠진 시각';
comment on column public.table_members.left_reason is '빠진 사유';
comment on table public.match_events is '매칭 처리 이력';
comment on column public.match_events.id is '식별자';
comment on column public.match_events.match_run_id is '매칭 실행(인원 감소 처리는 없음)';
comment on column public.match_events.application_id is '신청';
comment on column public.match_events.event_type is '처리 종류';
comment on column public.match_events.from_table_id is '이전 테이블';
comment on column public.match_events.to_table_id is '새 테이블';
comment on column public.match_events.reason_code is '사유 코드';
comment on column public.match_events.detail is '상세';
comment on column public.match_events.created_at is '생성 시각';
comment on table public.alternative_offers is '대체 일정 추천';
comment on column public.alternative_offers.id is '식별자';
comment on column public.alternative_offers.application_id is '신청';
comment on column public.alternative_offers.round_id is '추천 회차';
comment on column public.alternative_offers.region_code is '추천 지역';
comment on column public.alternative_offers.rank is '추천 순위';
comment on column public.alternative_offers.created_at is '생성 시각';
comment on table public.match_resolutions is '미매칭 해결';
comment on column public.match_resolutions.application_id is '실패한 신청';
comment on column public.match_resolutions.choice is '일정 이동·보관·환불';
comment on column public.match_resolutions.target_round_id is '이동한 회차';
comment on column public.match_resolutions.target_region_code is '이동한 지역';
comment on column public.match_resolutions.new_application_id is '이동으로 생긴 신청';
comment on column public.match_resolutions.user_ticket_id is '보관된 이용권';
comment on column public.match_resolutions.refund_id is '환불';
comment on column public.match_resolutions.resolved_at is '선택 시각';
comment on table public.chat_rooms is '단체방';
comment on column public.chat_rooms.id is '식별자';
comment on column public.chat_rooms.table_id is '테이블(1:1)';
comment on column public.chat_rooms.created_at is '생성 시각';
comment on column public.chat_rooms.closed_at is '종료 시각';
comment on table public.chat_messages is '단체방 메시지';
comment on column public.chat_messages.id is '식별자';
comment on column public.chat_messages.room_id is '단체방';
comment on column public.chat_messages.sender_id is '보낸 사람(없으면 시스템)';
comment on column public.chat_messages.kind is '메시지 종류';
comment on column public.chat_messages.body is '내용';
comment on column public.chat_messages.dedupe_key is '시스템 메시지 중복 방지 키';
comment on column public.chat_messages.created_at is '생성 시각';
comment on table public.notifications is '앱 내 알림';
comment on column public.notifications.id is '식별자';
comment on column public.notifications.profile_id is '받는 사람';
comment on column public.notifications.type is '알림 유형 코드(NOTICE_TYPE)';
comment on column public.notifications.title is '제목';
comment on column public.notifications.body is '내용';
comment on column public.notifications.link is '이동할 화면';
comment on column public.notifications.dedupe_key is '같은 알림 중복 방지 키(유형:대상ID)';
comment on column public.notifications.read_at is '읽은 시각';
comment on column public.notifications.created_at is '생성 시각';
comment on table public.deliveries is '발송 이력';
comment on column public.deliveries.id is '식별자';
comment on column public.deliveries.notification_id is '알림';
comment on column public.deliveries.chat_message_id is '단체방 메시지';
comment on column public.deliveries.channel is '채널';
comment on column public.deliveries.status is '결과';
comment on column public.deliveries.attempts is '시도 횟수';
comment on column public.deliveries.last_error is '마지막 오류';
comment on column public.deliveries.next_retry_at is '다음 재시도';
comment on column public.deliveries.sent_at is '발송 성공 시각';
comment on column public.deliveries.created_at is '생성 시각';
comment on table public.message_templates is '메시지 템플릿';
comment on column public.message_templates.code is '템플릿 코드';
comment on column public.message_templates.channel is '채널';
comment on column public.message_templates.title is '제목';
comment on column public.message_templates.body is '본문(변수 포함)';
comment on column public.message_templates.updated_by is '수정한 운영자';
comment on column public.message_templates.updated_at is '수정 시각';
comment on table public.content_items is '대화 콘텐츠';
comment on column public.content_items.id is '식별자';
comment on column public.content_items.kind is '종류';
comment on column public.content_items.text is '내용';
comment on column public.content_items.interest_code is '관련 관심사(없으면 공통)';
comment on column public.content_items.trait_code is '관련 대화 성향';
comment on column public.content_items.active is '사용 여부';
comment on column public.content_items.created_at is '생성 시각';
comment on table public.table_contents is '테이블 게시 콘텐츠';
comment on column public.table_contents.table_id is '테이블';
comment on column public.table_contents.content_item_id is '콘텐츠';
comment on column public.table_contents.posted_message_id is '게시 메시지';
comment on table public.feedbacks is '피드백';
comment on column public.feedbacks.id is '식별자';
comment on column public.feedbacks.application_id is '신청';
comment on column public.feedbacks.table_id is '테이블';
comment on column public.feedbacks.profile_id is '작성자';
comment on column public.feedbacks.mood_score is '테이블 분위기';
comment on column public.feedbacks.talk_score is '대화';
comment on column public.feedbacks.venue_score is '식당';
comment on column public.feedbacks.rejoin_intent is '재참여 의향';
comment on column public.feedbacks.recommend_intent is '추천 의향';
comment on column public.feedbacks.review_rating is '공개 후기 별점';
comment on column public.feedbacks.review_text is '공개 후기';
comment on column public.feedbacks.review_public is '공개 여부';
comment on column public.feedbacks.review_hidden is '운영자 숨김(추가)';
comment on column public.feedbacks.submitted_at is '제출 시각';
comment on table public.relations is '사람 간 관계';
comment on column public.relations.id is '식별자';
comment on column public.relations.from_profile_id is '관계를 낸 사람';
comment on column public.relations.to_profile_id is '대상';
comment on column public.relations.type is '관계 종류';
comment on column public.relations.source_table_id is '계기가 된 테이블';
comment on column public.relations.created_at is '생성 시각';
comment on table public.reports is '신고';
comment on column public.reports.id is '식별자';
comment on column public.reports.reporter_id is '신고자';
comment on column public.reports.reported_id is '피신고자';
comment on column public.reports.table_id is '테이블';
comment on column public.reports.reason_code is '사유 코드';
comment on column public.reports.detail is '상세';
comment on column public.reports.status is '처리 상태';
comment on column public.reports.action is '운영자 조치';
comment on column public.reports.handled_by is '처리한 운영자';
comment on column public.reports.handled_at is '처리 시각';
comment on column public.reports.created_at is '생성 시각';
comment on table public.noshow_cases is '노쇼 처리';
comment on column public.noshow_cases.application_id is '신청';
comment on column public.noshow_cases.table_id is '테이블';
comment on column public.noshow_cases.candidate_at is '후보 기록 시각';
comment on column public.noshow_cases.adjusted_at is '동석자 피드백으로 보정한 시각';
comment on column public.noshow_cases.notice_sent_at is '확인 알림 발송';
comment on column public.noshow_cases.objection_deadline_at is '이의 마감(알림 후 24시간)';
comment on column public.noshow_cases.objection_at is '이의 제기 시각';
comment on column public.noshow_cases.objection_text is '이의 내용';
comment on column public.noshow_cases.result is '결과';
comment on column public.noshow_cases.decided_at is '확정 시각';
comment on table public.penalty_records is '패널티 기록';
comment on column public.penalty_records.id is '식별자';
comment on column public.penalty_records.profile_id is '참가자';
comment on column public.penalty_records.application_id is '신청';
comment on column public.penalty_records.kind is '종류';
comment on column public.penalty_records.created_at is '생성 시각';
comment on table public.sanctions is '경고·제한';
comment on column public.sanctions.id is '식별자';
comment on column public.sanctions.profile_id is '대상';
comment on column public.sanctions.level is '수준';
comment on column public.sanctions.status is '확정 상태';
comment on column public.sanctions.source is '근거';
comment on column public.sanctions.report_id is '근거 신고';
comment on column public.sanctions.reason is '사유';
comment on column public.sanctions.until_date is '제한 종료일';
comment on column public.sanctions.decided_by is '확정한 운영자';
comment on column public.sanctions.decided_at is '확정 시각';
comment on column public.sanctions.created_at is '생성 시각';
comment on table public.exceptions is '예외';
comment on column public.exceptions.id is '식별자';
comment on column public.exceptions.type is '예외 유형';
comment on column public.exceptions.status is '처리 상태';
comment on column public.exceptions.round_id is '회차';
comment on column public.exceptions.table_id is '테이블';
comment on column public.exceptions.application_id is '신청';
comment on column public.exceptions.inquiry_id is '문의(INQUIRY 유형)';
comment on column public.exceptions.reason is '사유';
comment on column public.exceptions.detail is '상세';
comment on column public.exceptions.dedupe_key is '중복 방지 키';
comment on column public.exceptions.resolved_by is '처리한 운영자';
comment on column public.exceptions.resolved_at is '처리 시각';
comment on column public.exceptions.resolution_note is '처리 내용';
comment on column public.exceptions.created_at is '생성 시각';
comment on table public.status_history is '상태 변경 이력';
comment on column public.status_history.id is '식별자';
comment on column public.status_history.application_id is '신청';
comment on column public.status_history.field is '바뀐 상태';
comment on column public.status_history.from_value is '이전 값';
comment on column public.status_history.to_value is '새 값';
comment on column public.status_history.actor_type is '주체';
comment on column public.status_history.actor_id is '주체 ID(시스템이면 없음)';
comment on column public.status_history.reason is '원인';
comment on column public.status_history.created_at is '생성 시각';
comment on table public.audit_logs is '운영자 변경 이력';
comment on column public.audit_logs.id is '식별자';
comment on column public.audit_logs.actor_id is '운영자';
comment on column public.audit_logs.action is '동작';
comment on column public.audit_logs.target_table is '대상 표';
comment on column public.audit_logs.target_id is '대상 ID';
comment on column public.audit_logs.before is '이전 값';
comment on column public.audit_logs.after is '이후 값';
comment on column public.audit_logs.created_at is '생성 시각';
comment on table public.job_runs is '자동 작업 실행';
comment on column public.job_runs.job_key is '멱등 키(작업:회차ID)';
comment on column public.job_runs.job_type is '작업 종류';
comment on column public.job_runs.round_id is '회차';
comment on column public.job_runs.trigger is '실행 경로';
comment on column public.job_runs.status is '상태';
comment on column public.job_runs.result is '결과 요약';
comment on column public.job_runs.started_at is '시작';
comment on column public.job_runs.finished_at is '종료';
comment on table public.waitlist_offers is '대기자 참가 제안';
comment on column public.waitlist_offers.id is '식별자';
comment on column public.waitlist_offers.table_id is '테이블';
comment on column public.waitlist_offers.application_id is '대기자 신청';
comment on column public.waitlist_offers.offered_at is '제안 시각';
comment on column public.waitlist_offers.deadline_at is '응답 기한';
comment on column public.waitlist_offers.response is '응답';
comment on column public.waitlist_offers.responded_at is '응답 시각';
comment on table public.faq_items is 'FAQ';
comment on column public.faq_items.id is '식별자';
comment on column public.faq_items.category is '유형';
comment on column public.faq_items.question is '질문';
comment on column public.faq_items.answer is '답변';
comment on column public.faq_items.sort_order is '순서';
comment on column public.faq_items.active is '사용 여부';
comment on table public.inquiries is '1:1 문의';
comment on column public.inquiries.id is '식별자';
comment on column public.inquiries.profile_id is '문의자';
comment on column public.inquiries.category is '유형';
comment on column public.inquiries.body is '내용';
comment on column public.inquiries.auto_answer_code is '보여 준 자동 답변';
comment on column public.inquiries.status is '상태';
comment on column public.inquiries.answer is '운영자 답변';
comment on column public.inquiries.answered_by is '답변한 운영자';
comment on column public.inquiries.answered_at is '답변 시각';
comment on column public.inquiries.created_at is '생성 시각';
comment on table public.balance_answers is '밸런스 질문 답';
comment on column public.balance_answers.profile_id is '참가자';
comment on column public.balance_answers.question_code is '질문 코드';
comment on column public.balance_answers.answer is '고른 답';
