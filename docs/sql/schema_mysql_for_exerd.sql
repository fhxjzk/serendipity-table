-- 우연한 식탁 MVP — MySQL 8 DDL for eXERD reverse engineering (ERD only, not the runtime schema)
-- Runtime DB is Supabase(Postgres): docs/sql/schema_draft.sql. CHECK constraints and partial unique indexes are omitted here.
set names utf8mb4;

create table `profiles` (
  `id` char(36) not null comment 'Auth 사용자 ID',
  `role` varchar(255) not null default 'PARTICIPANT' comment '역할',
  `name` varchar(20) not null comment '이름',
  `display_name` varchar(20) not null comment '표시 이름(같은 테이블에 공개)',
  `phone` text not null comment '연락처',
  `birth_year` int not null comment '출생연도',
  `gender` varchar(255) not null comment '성별',
  `job` varchar(30) not null comment '직업',
  `mbti` varchar(255) not null default 'UNKNOWN' comment 'MBTI 16종 또는 UNKNOWN',
  `interests` json not null comment '관심사 코드(INTEREST)',
  `self_traits` json not null comment '본인 성향 코드(SELF_TRAIT)',
  `wanted_traits` json not null comment '만나고 싶은 사람 코드(WANTED_TRAIT)',
  `price_ranges` json not null comment '희망 식사 가격대 코드(PRICE_RANGE, 복수)',
  `food_avoid` json not null comment '못 먹는 음식',
  `allergies` json not null comment '알레르기',
  `one_liner` varchar(30) comment '한 줄 소개(선택)',
  `drink_pref` varchar(255) comment '음주 선호(추가 R-47)',
  `privacy_agreed_at` datetime comment '개인정보 수집·이용 동의 시각',
  `policy_agreed_at` datetime comment '운영 정책 동의 시각',
  `notify_email` text comment '알림 받을 이메일(선택)',
  `restriction` varchar(255) not null default 'NONE' comment '참가 제한 상태',
  `restricted_until` date comment '참가 제한 종료일',
  `origin` varchar(255) not null default 'APP' comment '생성 경로. SEED·BULK는 이메일을 보내지 않는다',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  `updated_at` datetime not null default current_timestamp comment '수정 시각',
  primary key (`id`)
) comment '프로필';

create table `notification_settings` (
  `profile_id` char(36) not null comment '프로필',
  `email_payment_done` boolean not null default true comment '결제 완료 메일',
  `email_match_confirmed` boolean not null default true comment '매칭 확정 메일',
  `email_match_failed` boolean not null default true comment '매칭 실패 메일',
  `email_reminder` boolean not null default true comment '행사 1일 전 메일',
  `email_refund_done` boolean not null default true comment '환불 완료 메일',
  `push_enabled` boolean not null default false comment '웹 푸시 사용',
  `updated_at` datetime not null default current_timestamp comment '수정 시각',
  primary key (`profile_id`)
) comment '알림 설정';

create table `push_subscriptions` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '프로필',
  `endpoint` varchar(255) not null comment '푸시 서비스 주소',
  `p256dh` text not null comment '암호화 공개키',
  `auth_key` text not null comment '인증 키',
  `user_agent` text comment '기기 정보',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  `revoked_at` datetime comment '해지 시각(발송 실패 410 등)',
  primary key (`id`),
  unique key `push_subscriptions_endpoint_uq` (`endpoint`)
) comment '웹 푸시 구독';

create table `code_values` (
  `code_group` varchar(255) not null comment '코드 그룹(6장)',
  `code` varchar(255) not null comment '코드',
  `label` text not null comment '화면 표시 이름',
  `sort_order` int not null default 0 comment '표시 순서',
  `active` boolean not null default true comment '사용 여부',
  primary key (`code_group`, `code`)
) comment '코드값';

create table `app_settings` (
  `key` varchar(255) not null comment '설정 키',
  `value` json not null comment '설정 값',
  `description` text comment '설명',
  `updated_by` char(36) comment '수정한 운영자',
  `updated_at` datetime not null default current_timestamp comment '수정 시각',
  primary key (`key`)
) comment '설정값';

create table `rounds` (
  `id` char(36) not null comment '식별자',
  `title` text not null comment '예: 10/22(목) 저녁',
  `event_date` date not null comment '행사일',
  `start_at` datetime not null comment '행사 시작 시각',
  `end_at` datetime not null comment '행사 종료 시각',
  `apply_deadline_at` datetime not null comment '신청·결제 마감',
  `match_run_at` datetime not null comment '자동 매칭 실행 시각',
  `reminder_at` datetime not null comment '1일 전 리마인드 시각',
  `status` varchar(255) not null default 'DRAFT' comment '회차 상태',
  `setting_overrides` json not null comment '회차별 설정 덮어쓰기',
  `created_by` char(36) comment '만든 운영자',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '회차';

create table `round_regions` (
  `round_id` char(36) not null comment '회차',
  `region_code` varchar(255) not null comment '지역 코드(REGION)',
  `capacity` int not null comment '정원',
  primary key (`round_id`, `region_code`)
) comment '회차별 지역';

create table `venues` (
  `id` char(36) not null comment '식별자',
  `name` text not null comment '식당명',
  `region_code` text not null comment '지역 코드',
  `address` text not null comment '주소',
  `map_url` text comment '지도 링크',
  `price_range` text comment '가격대 코드(PRICE_RANGE)',
  `active` boolean not null default true comment '사용 여부',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '파트너 식당';

create table `venue_availability` (
  `id` char(36) not null comment '식별자',
  `venue_id` char(36) not null comment '식당',
  `round_id` char(36) not null comment '회차',
  `table_slots` int not null comment '받을 수 있는 테이블 수',
  `max_seats` int not null default 6 comment '테이블당 최대 인원',
  `booked_slots` int not null default 0 comment '배정된 테이블 수',
  primary key (`id`),
  unique key `venue_availability_uq1` (`venue_id`, `round_id`)
) comment '식당 재고';

create table `applications` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '신청자',
  `application_status` varchar(255) not null default 'DRAFT' comment '신청 상태',
  `payment_status` varchar(255) not null default 'PENDING' comment '결제 상태',
  `match_status` varchar(255) not null default 'WAITING' comment '매칭 상태',
  `attendance_status` varchar(255) not null default 'SCHEDULED' comment '참석 상태',
  `ticket_product_code` varchar(255) comment '고른 이용권 상품',
  `user_ticket_id` char(36) comment '차감한 보유 이용권(구독)',
  `payment_due_at` datetime comment '결제 기한',
  `table_id` char(36) comment '현재 배정 테이블',
  `transferred_from` char(36) comment '대체 일정 이동 전 신청',
  `reason_code` text comment '최근 처리 사유 코드(참가자 문구로 변환)',
  `submitted_at` datetime comment '제출 시각',
  `canceled_at` datetime comment '취소·불참 알림 시각',
  `checked_in_at` datetime comment '체크인 시각',
  `is_active` boolean not null default true comment '진행 중 여부(종료·취소·이동 시 false)',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  `updated_at` datetime not null default current_timestamp comment '수정 시각',
  primary key (`id`)
) comment '신청';

create table `application_choices` (
  `application_id` char(36) not null comment '신청',
  `round_id` char(36) not null comment '회차(날짜)',
  `region_code` varchar(255) not null comment '지역 코드',
  primary key (`application_id`, `round_id`, `region_code`)
) comment '신청 선택지';

create table `ticket_products` (
  `code` varchar(255) not null comment 'SINGLE · PACK3 · PACK4',
  `name` text not null comment '상품명',
  `kind` varchar(255) not null comment '1회권·구독',
  `price` int not null comment '가격(원)',
  `uses` int not null comment '사용 횟수',
  `valid_days` int comment '유효기간(일), 1회권은 없음',
  `active` boolean not null default true comment '판매 여부',
  primary key (`code`)
) comment '이용권 상품';

create table `user_tickets` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '보유자',
  `product_code` varchar(255) not null comment '상품',
  `source` varchar(255) not null comment '구매·보관',
  `total_uses` int not null comment '전체 횟수',
  `remaining_uses` int not null comment '남은 횟수',
  `valid_until` date comment '유효기간',
  `payment_id` char(36) comment '구매 결제',
  `status` varchar(255) not null default 'ACTIVE' comment '상태',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '보유 이용권';

create table `ticket_ledger` (
  `id` char(36) not null comment '식별자',
  `user_ticket_id` char(36) not null comment '보유 이용권',
  `application_id` char(36) comment '관련 신청',
  `delta` int not null comment '증감(−1 차감, +1 복원)',
  `reason` varchar(255) not null comment '사유',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `ticket_ledger_uq1` (`user_ticket_id`, `application_id`, `reason`)
) comment '이용권 증감 이력';

create table `payments` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '결제자',
  `application_id` char(36) comment '신청(구독 구매만 하면 없음)',
  `product_code` varchar(255) not null comment '상품',
  `amount` int not null comment '결제 금액(할인 후)',
  `discount_amount` int not null default 0 comment '쿠폰 할인액',
  `coupon_id` char(36) comment '사용한 쿠폰(쿠폰 1장은 결제 1건에만)',
  `method` varchar(255) not null default 'MOCK' comment '결제 수단',
  `status` varchar(255) not null default 'PENDING' comment '결제 결과',
  `idempotency_key` varchar(255) not null comment '중복 결제 방지 키',
  `paid_at` datetime comment '결제 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `payments_coupon_id_uq` (`coupon_id`),
  unique key `payments_idempotency_key_uq` (`idempotency_key`)
) comment '결제(모의)';

create table `refunds` (
  `id` char(36) not null comment '식별자',
  `payment_id` char(36) not null comment '원결제',
  `application_id` char(36) not null comment '신청(1건만)',
  `amount` int not null comment '환불 금액',
  `reason` varchar(255) not null comment '사유',
  `policy_exception` boolean not null default false comment '환불 제한 기간 예외',
  `status` varchar(255) not null default 'REQUESTED' comment '처리 상태',
  `failure_reason` text comment '실패 사유',
  `requested_at` datetime not null default current_timestamp comment '요청 시각',
  `completed_at` datetime comment '완료 시각',
  primary key (`id`),
  unique key `refunds_application_id_uq` (`application_id`)
) comment '환불(모의)';

create table `coupons` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '받은 사람',
  `reason` varchar(255) not null comment '발급 사유',
  `source_table_id` char(36) comment '원인이 된 테이블',
  `discount_rate` int comment '할인율(%) — 설정값 보류',
  `valid_until` date comment '유효기간',
  `status` varchar(255) not null default 'ISSUED' comment '상태',
  `issued_at` datetime not null default current_timestamp comment '발급 시각',
  primary key (`id`),
  unique key `coupons_uq1` (`profile_id`, `source_table_id`)
) comment '보상 쿠폰';

create table `match_runs` (
  `id` char(36) not null comment '식별자',
  `round_id` char(36) not null comment '회차',
  `run_key` varchar(255) not null comment '멱등 키(MATCH:회차ID)',
  `trigger` varchar(255) not null comment '실행 경로',
  `algorithm_version` text not null comment '알고리즘 버전',
  `settings_snapshot` json not null comment '실행 당시 가중치·최소 점수',
  `status` varchar(255) not null default 'RUNNING' comment '실행 상태',
  `stats` json not null comment '후보·테이블·확정·재배치·실패 수',
  `error` text comment '실패 사유',
  `started_at` datetime not null default current_timestamp comment '시작',
  `finished_at` datetime comment '종료',
  primary key (`id`),
  unique key `match_runs_run_key_uq` (`run_key`)
) comment '매칭 실행';

create table `dining_tables` (
  `id` char(36) not null comment '식별자',
  `round_id` char(36) not null comment '회차',
  `region_code` text not null comment '지역 코드',
  `match_run_id` char(36) comment '만든 매칭 실행',
  `status` varchar(255) not null default 'FORMING' comment '테이블 상태',
  `score` decimal(5,1) comment '선호 점수(운영자만)',
  `score_detail` json comment '항목별 점수(운영자만)',
  `venue_id` char(36) comment '배정 식당',
  `reservation_name` text comment '예약명',
  `curation` text comment '테이블 조합 큐레이션 문구',
  `food_summary` text comment '이름 없는 식사 조건 요약',
  `confirmed_at` datetime comment '확정 시각',
  `canceled_at` datetime comment '취소 시각',
  `cancel_reason` text comment '취소 사유',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '식사 테이블';

create table `table_members` (
  `id` char(36) not null comment '식별자',
  `table_id` char(36) not null comment '테이블',
  `round_id` char(36) not null comment '회차(중복 배치 방지용)',
  `application_id` char(36) not null comment '신청',
  `profile_id` char(36) not null comment '참가자',
  `joined_at` datetime not null default current_timestamp comment '배치 시각',
  `left_at` datetime comment '빠진 시각',
  `left_reason` varchar(255) comment '빠진 사유',
  primary key (`id`)
) comment '테이블 구성원';

create table `match_events` (
  `id` char(36) not null comment '식별자',
  `match_run_id` char(36) comment '매칭 실행(인원 감소 처리는 없음)',
  `application_id` char(36) not null comment '신청',
  `event_type` varchar(255) not null comment '처리 종류',
  `from_table_id` char(36) comment '이전 테이블',
  `to_table_id` char(36) comment '새 테이블',
  `reason_code` text not null comment '사유 코드',
  `detail` json not null comment '상세',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '매칭 처리 이력';

create table `alternative_offers` (
  `id` char(36) not null comment '식별자',
  `application_id` char(36) not null comment '신청',
  `round_id` char(36) not null comment '추천 회차',
  `region_code` varchar(255) not null comment '추천 지역',
  `rank` int not null comment '추천 순위',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `alternative_offers_uq1` (`application_id`, `round_id`, `region_code`)
) comment '대체 일정 추천';

create table `match_resolutions` (
  `application_id` char(36) not null comment '실패한 신청',
  `choice` varchar(255) not null comment '일정 이동·보관·환불',
  `target_round_id` char(36) comment '이동한 회차',
  `target_region_code` text comment '이동한 지역',
  `new_application_id` char(36) comment '이동으로 생긴 신청',
  `user_ticket_id` char(36) comment '보관된 이용권',
  `refund_id` char(36) comment '환불',
  `resolved_at` datetime not null default current_timestamp comment '선택 시각',
  primary key (`application_id`)
) comment '미매칭 해결';

create table `chat_rooms` (
  `id` char(36) not null comment '식별자',
  `table_id` char(36) not null comment '테이블(1:1)',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  `closed_at` datetime comment '종료 시각',
  primary key (`id`),
  unique key `chat_rooms_table_id_uq` (`table_id`)
) comment '단체방';

create table `chat_messages` (
  `id` char(36) not null comment '식별자',
  `room_id` char(36) not null comment '단체방',
  `sender_id` char(36) comment '보낸 사람(없으면 시스템)',
  `kind` varchar(255) not null comment '메시지 종류',
  `body` varchar(1000) not null comment '내용',
  `dedupe_key` varchar(255) comment '시스템 메시지 중복 방지 키',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `chat_messages_dedupe_key_uq` (`dedupe_key`)
) comment '단체방 메시지';

create table `notifications` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '받는 사람',
  `type` text not null comment '알림 유형 코드(NOTICE_TYPE)',
  `title` text not null comment '제목',
  `body` text not null comment '내용',
  `link` text comment '이동할 화면',
  `dedupe_key` varchar(255) not null comment '같은 알림 중복 방지 키(유형:대상ID)',
  `read_at` datetime comment '읽은 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `notifications_dedupe_key_uq` (`dedupe_key`)
) comment '앱 내 알림';

create table `deliveries` (
  `id` char(36) not null comment '식별자',
  `notification_id` char(36) comment '알림',
  `chat_message_id` char(36) comment '단체방 메시지',
  `channel` varchar(255) not null comment '채널',
  `status` varchar(255) not null default 'PENDING' comment '결과',
  `attempts` int not null default 0 comment '시도 횟수',
  `last_error` text comment '마지막 오류',
  `next_retry_at` datetime comment '다음 재시도',
  `sent_at` datetime comment '발송 성공 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `deliveries_uq1` (`notification_id`, `channel`)
) comment '발송 이력';

create table `message_templates` (
  `code` varchar(255) not null comment '템플릿 코드',
  `channel` varchar(255) not null comment '채널',
  `title` text comment '제목',
  `body` text not null comment '본문(변수 포함)',
  `updated_by` char(36) comment '수정한 운영자',
  `updated_at` datetime not null default current_timestamp comment '수정 시각',
  primary key (`code`)
) comment '메시지 템플릿';

create table `content_items` (
  `id` char(36) not null comment '식별자',
  `kind` varchar(255) not null comment '종류',
  `text` text not null comment '내용',
  `interest_code` text comment '관련 관심사(없으면 공통)',
  `trait_code` text comment '관련 대화 성향',
  `active` boolean not null default true comment '사용 여부',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '대화 콘텐츠';

create table `table_contents` (
  `table_id` char(36) not null comment '테이블',
  `content_item_id` char(36) not null comment '콘텐츠',
  `posted_message_id` char(36) comment '게시 메시지',
  primary key (`table_id`, `content_item_id`)
) comment '테이블 게시 콘텐츠';

create table `feedbacks` (
  `id` char(36) not null comment '식별자',
  `application_id` char(36) not null comment '신청',
  `table_id` char(36) not null comment '테이블',
  `profile_id` char(36) not null comment '작성자',
  `mood_score` int not null comment '테이블 분위기',
  `talk_score` int not null comment '대화',
  `venue_score` int not null comment '식당',
  `rejoin_intent` int not null comment '재참여 의향',
  `recommend_intent` int not null comment '추천 의향',
  `review_rating` int comment '공개 후기 별점',
  `review_text` varchar(100) comment '공개 후기',
  `review_public` boolean not null default false comment '공개 여부',
  `review_hidden` boolean not null default false comment '운영자 숨김(추가)',
  `submitted_at` datetime not null default current_timestamp comment '제출 시각',
  primary key (`id`),
  unique key `feedbacks_application_id_uq` (`application_id`)
) comment '피드백';

create table `relations` (
  `id` char(36) not null comment '식별자',
  `from_profile_id` char(36) not null comment '관계를 낸 사람',
  `to_profile_id` char(36) not null comment '대상',
  `type` varchar(255) not null comment '관계 종류',
  `source_table_id` char(36) comment '계기가 된 테이블',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `relations_uq1` (`from_profile_id`, `to_profile_id`, `type`, `source_table_id`)
) comment '사람 간 관계';

create table `reports` (
  `id` char(36) not null comment '식별자',
  `reporter_id` char(36) not null comment '신고자',
  `reported_id` char(36) not null comment '피신고자',
  `table_id` char(36) comment '테이블',
  `reason_code` text not null comment '사유 코드',
  `detail` varchar(1000) comment '상세',
  `status` varchar(255) not null default 'OPEN' comment '처리 상태',
  `action` varchar(255) comment '운영자 조치',
  `handled_by` char(36) comment '처리한 운영자',
  `handled_at` datetime comment '처리 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '신고';

create table `noshow_cases` (
  `application_id` char(36) not null comment '신청',
  `table_id` char(36) not null comment '테이블',
  `candidate_at` datetime not null default current_timestamp comment '후보 기록 시각',
  `adjusted_at` datetime comment '동석자 피드백으로 보정한 시각',
  `notice_sent_at` datetime comment '확인 알림 발송',
  `objection_deadline_at` datetime comment '이의 마감(알림 후 24시간)',
  `objection_at` datetime comment '이의 제기 시각',
  `objection_text` varchar(500) comment '이의 내용',
  `result` varchar(255) not null default 'PENDING' comment '결과',
  `decided_at` datetime comment '확정 시각',
  primary key (`application_id`)
) comment '노쇼 처리';

create table `penalty_records` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '참가자',
  `application_id` char(36) not null comment '신청',
  `kind` varchar(255) not null comment '종류',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `penalty_records_uq1` (`application_id`, `kind`)
) comment '패널티 기록';

create table `sanctions` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '대상',
  `level` varchar(255) not null comment '수준',
  `status` varchar(255) not null default 'PROPOSED' comment '확정 상태',
  `source` varchar(255) not null comment '근거',
  `report_id` char(36) comment '근거 신고',
  `reason` text not null comment '사유',
  `until_date` date comment '제한 종료일',
  `decided_by` char(36) comment '확정한 운영자',
  `decided_at` datetime comment '확정 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '경고·제한';

create table `exceptions` (
  `id` char(36) not null comment '식별자',
  `type` varchar(255) not null comment '예외 유형',
  `status` varchar(255) not null default 'OPEN' comment '처리 상태',
  `round_id` char(36) comment '회차',
  `table_id` char(36) comment '테이블',
  `application_id` char(36) comment '신청',
  `inquiry_id` char(36) comment '문의(INQUIRY 유형)',
  `reason` text not null comment '사유',
  `detail` json not null comment '상세',
  `dedupe_key` varchar(255) not null comment '중복 방지 키',
  `resolved_by` char(36) comment '처리한 운영자',
  `resolved_at` datetime comment '처리 시각',
  `resolution_note` text comment '처리 내용',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`),
  unique key `exceptions_dedupe_key_uq` (`dedupe_key`)
) comment '예외';

create table `status_history` (
  `id` char(36) not null comment '식별자',
  `application_id` char(36) not null comment '신청',
  `field` varchar(255) not null comment '바뀐 상태',
  `from_value` text comment '이전 값',
  `to_value` text not null comment '새 값',
  `actor_type` varchar(255) not null comment '주체',
  `actor_id` char(36) comment '주체 ID(시스템이면 없음)',
  `reason` text comment '원인',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '상태 변경 이력';

create table `audit_logs` (
  `id` char(36) not null comment '식별자',
  `actor_id` char(36) not null comment '운영자',
  `action` text not null comment '동작',
  `target_table` text not null comment '대상 표',
  `target_id` text not null comment '대상 ID',
  `before` json comment '이전 값',
  `after` json comment '이후 값',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '운영자 변경 이력';

create table `job_runs` (
  `job_key` varchar(255) not null comment '멱등 키(작업:회차ID)',
  `job_type` varchar(255) not null comment '작업 종류',
  `round_id` char(36) comment '회차',
  `trigger` varchar(255) not null comment '실행 경로',
  `status` varchar(255) not null default 'RUNNING' comment '상태',
  `result` json not null comment '결과 요약',
  `started_at` datetime not null default current_timestamp comment '시작',
  `finished_at` datetime comment '종료',
  primary key (`job_key`)
) comment '자동 작업 실행';

create table `waitlist_offers` (
  `id` char(36) not null comment '식별자',
  `table_id` char(36) not null comment '테이블',
  `application_id` char(36) not null comment '대기자 신청',
  `offered_at` datetime not null default current_timestamp comment '제안 시각',
  `deadline_at` datetime not null comment '응답 기한',
  `response` varchar(255) not null default 'PENDING' comment '응답',
  `responded_at` datetime comment '응답 시각',
  primary key (`id`),
  unique key `waitlist_offers_uq1` (`table_id`, `application_id`)
) comment '대기자 참가 제안';

create table `faq_items` (
  `id` char(36) not null comment '식별자',
  `category` varchar(255) not null comment '유형',
  `question` text not null comment '질문',
  `answer` text not null comment '답변',
  `sort_order` int not null default 0 comment '순서',
  `active` boolean not null default true comment '사용 여부',
  primary key (`id`)
) comment 'FAQ';

create table `inquiries` (
  `id` char(36) not null comment '식별자',
  `profile_id` char(36) not null comment '문의자',
  `category` varchar(255) not null comment '유형',
  `body` varchar(1000) not null comment '내용',
  `auto_answer_code` text comment '보여 준 자동 답변',
  `status` varchar(255) not null default 'OPEN' comment '상태',
  `answer` text comment '운영자 답변',
  `answered_by` char(36) comment '답변한 운영자',
  `answered_at` datetime comment '답변 시각',
  `created_at` datetime not null default current_timestamp comment '생성 시각',
  primary key (`id`)
) comment '1:1 문의';

create table `balance_answers` (
  `profile_id` char(36) not null comment '참가자',
  `question_code` varchar(255) not null comment '질문 코드',
  `answer` varchar(255) not null comment '고른 답',
  primary key (`profile_id`, `question_code`)
) comment '밸런스 질문 답';

alter table `notification_settings` add constraint `notification_settings_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `push_subscriptions` add constraint `push_subscriptions_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `app_settings` add constraint `app_settings_updated_by_fk` foreign key (`updated_by`) references `profiles` (`id`);
alter table `rounds` add constraint `rounds_created_by_fk` foreign key (`created_by`) references `profiles` (`id`);
alter table `round_regions` add constraint `round_regions_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `venue_availability` add constraint `venue_availability_venue_id_fk` foreign key (`venue_id`) references `venues` (`id`);
alter table `venue_availability` add constraint `venue_availability_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `applications` add constraint `applications_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `applications` add constraint `applications_ticket_product_code_fk` foreign key (`ticket_product_code`) references `ticket_products` (`code`);
alter table `applications` add constraint `applications_user_ticket_id_fk` foreign key (`user_ticket_id`) references `user_tickets` (`id`);
alter table `applications` add constraint `applications_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `applications` add constraint `applications_transferred_from_fk` foreign key (`transferred_from`) references `applications` (`id`);
alter table `application_choices` add constraint `application_choices_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `application_choices` add constraint `application_choices_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `user_tickets` add constraint `user_tickets_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `user_tickets` add constraint `user_tickets_product_code_fk` foreign key (`product_code`) references `ticket_products` (`code`);
alter table `user_tickets` add constraint `user_tickets_payment_id_fk` foreign key (`payment_id`) references `payments` (`id`);
alter table `ticket_ledger` add constraint `ticket_ledger_user_ticket_id_fk` foreign key (`user_ticket_id`) references `user_tickets` (`id`);
alter table `ticket_ledger` add constraint `ticket_ledger_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `payments` add constraint `payments_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `payments` add constraint `payments_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `payments` add constraint `payments_product_code_fk` foreign key (`product_code`) references `ticket_products` (`code`);
alter table `payments` add constraint `payments_coupon_id_fk` foreign key (`coupon_id`) references `coupons` (`id`);
alter table `refunds` add constraint `refunds_payment_id_fk` foreign key (`payment_id`) references `payments` (`id`);
alter table `refunds` add constraint `refunds_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `coupons` add constraint `coupons_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `coupons` add constraint `coupons_source_table_id_fk` foreign key (`source_table_id`) references `dining_tables` (`id`);
alter table `match_runs` add constraint `match_runs_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `dining_tables` add constraint `dining_tables_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `dining_tables` add constraint `dining_tables_match_run_id_fk` foreign key (`match_run_id`) references `match_runs` (`id`);
alter table `dining_tables` add constraint `dining_tables_venue_id_fk` foreign key (`venue_id`) references `venues` (`id`);
alter table `table_members` add constraint `table_members_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `table_members` add constraint `table_members_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `table_members` add constraint `table_members_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `table_members` add constraint `table_members_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `match_events` add constraint `match_events_match_run_id_fk` foreign key (`match_run_id`) references `match_runs` (`id`);
alter table `match_events` add constraint `match_events_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `match_events` add constraint `match_events_from_table_id_fk` foreign key (`from_table_id`) references `dining_tables` (`id`);
alter table `match_events` add constraint `match_events_to_table_id_fk` foreign key (`to_table_id`) references `dining_tables` (`id`);
alter table `alternative_offers` add constraint `alternative_offers_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `alternative_offers` add constraint `alternative_offers_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `match_resolutions` add constraint `match_resolutions_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `match_resolutions` add constraint `match_resolutions_target_round_id_fk` foreign key (`target_round_id`) references `rounds` (`id`);
alter table `match_resolutions` add constraint `match_resolutions_new_application_id_fk` foreign key (`new_application_id`) references `applications` (`id`);
alter table `match_resolutions` add constraint `match_resolutions_user_ticket_id_fk` foreign key (`user_ticket_id`) references `user_tickets` (`id`);
alter table `match_resolutions` add constraint `match_resolutions_refund_id_fk` foreign key (`refund_id`) references `refunds` (`id`);
alter table `chat_rooms` add constraint `chat_rooms_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `chat_messages` add constraint `chat_messages_room_id_fk` foreign key (`room_id`) references `chat_rooms` (`id`);
alter table `chat_messages` add constraint `chat_messages_sender_id_fk` foreign key (`sender_id`) references `profiles` (`id`);
alter table `notifications` add constraint `notifications_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `deliveries` add constraint `deliveries_notification_id_fk` foreign key (`notification_id`) references `notifications` (`id`);
alter table `deliveries` add constraint `deliveries_chat_message_id_fk` foreign key (`chat_message_id`) references `chat_messages` (`id`);
alter table `message_templates` add constraint `message_templates_updated_by_fk` foreign key (`updated_by`) references `profiles` (`id`);
alter table `table_contents` add constraint `table_contents_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `table_contents` add constraint `table_contents_content_item_id_fk` foreign key (`content_item_id`) references `content_items` (`id`);
alter table `table_contents` add constraint `table_contents_posted_message_id_fk` foreign key (`posted_message_id`) references `chat_messages` (`id`);
alter table `feedbacks` add constraint `feedbacks_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `feedbacks` add constraint `feedbacks_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `feedbacks` add constraint `feedbacks_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `relations` add constraint `relations_from_profile_id_fk` foreign key (`from_profile_id`) references `profiles` (`id`);
alter table `relations` add constraint `relations_to_profile_id_fk` foreign key (`to_profile_id`) references `profiles` (`id`);
alter table `relations` add constraint `relations_source_table_id_fk` foreign key (`source_table_id`) references `dining_tables` (`id`);
alter table `reports` add constraint `reports_reporter_id_fk` foreign key (`reporter_id`) references `profiles` (`id`);
alter table `reports` add constraint `reports_reported_id_fk` foreign key (`reported_id`) references `profiles` (`id`);
alter table `reports` add constraint `reports_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `reports` add constraint `reports_handled_by_fk` foreign key (`handled_by`) references `profiles` (`id`);
alter table `noshow_cases` add constraint `noshow_cases_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `noshow_cases` add constraint `noshow_cases_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `penalty_records` add constraint `penalty_records_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `penalty_records` add constraint `penalty_records_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `sanctions` add constraint `sanctions_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `sanctions` add constraint `sanctions_report_id_fk` foreign key (`report_id`) references `reports` (`id`);
alter table `sanctions` add constraint `sanctions_decided_by_fk` foreign key (`decided_by`) references `profiles` (`id`);
alter table `exceptions` add constraint `exceptions_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `exceptions` add constraint `exceptions_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `exceptions` add constraint `exceptions_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `exceptions` add constraint `exceptions_inquiry_id_fk` foreign key (`inquiry_id`) references `inquiries` (`id`);
alter table `exceptions` add constraint `exceptions_resolved_by_fk` foreign key (`resolved_by`) references `profiles` (`id`);
alter table `status_history` add constraint `status_history_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `status_history` add constraint `status_history_actor_id_fk` foreign key (`actor_id`) references `profiles` (`id`);
alter table `audit_logs` add constraint `audit_logs_actor_id_fk` foreign key (`actor_id`) references `profiles` (`id`);
alter table `job_runs` add constraint `job_runs_round_id_fk` foreign key (`round_id`) references `rounds` (`id`);
alter table `waitlist_offers` add constraint `waitlist_offers_table_id_fk` foreign key (`table_id`) references `dining_tables` (`id`);
alter table `waitlist_offers` add constraint `waitlist_offers_application_id_fk` foreign key (`application_id`) references `applications` (`id`);
alter table `inquiries` add constraint `inquiries_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);
alter table `inquiries` add constraint `inquiries_answered_by_fk` foreign key (`answered_by`) references `profiles` (`id`);
alter table `balance_answers` add constraint `balance_answers_profile_id_fk` foreign key (`profile_id`) references `profiles` (`id`);