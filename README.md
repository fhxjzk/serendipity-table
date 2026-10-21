# 우연한 식탁 (serendipity-table)

매주 목요일 저녁, 처음 보는 4~6명이 한 식탁에 앉는 소셜 다이닝 서비스의 MVP입니다.
수기로 하던 **신청 → 결제 → 매칭 → 식당·단체방 안내 → 피드백**을 자동화하고, 운영자는 예외만 처리합니다.

Blaybus × 와썹하우스 「우연한식탁 MVP 개발 해커톤」 제출물입니다.

- **배포 주소**: https://serendipity-table-zeta.vercel.app
- **구성**: 참가자 모바일 웹(PWA) + 운영자 웹 어드민(`/admin`)
- **문서**: [`docs/`](docs) — 요구 분석서, 기능 명세서, 데이터 정의서·ERD, 기술 결정 기록, 테스트 체크리스트, 최종 요약서

## 테스트 계정

로그인 화면 아래 **"테스트 계정으로 바로 둘러보기"** 버튼으로 비밀번호 없이 들어갈 수 있습니다.

| 버튼 | 계정 | 보여 주는 장면 |
|---|---|---|
| 새로 신청할 참가자 | `new@usangtak.test` | 다음 일정 추천 → 신청 → 모의 결제 |
| 매칭 대기 참가자 | `user@usangtak.test` | 결제 후 자동 매칭을 기다리는 상태 |
| 확정된 참가자 | `table@usangtak.test` | 식탁 좌석도·식당 안내·단체방·체크인·피드백 |
| 같은 식탁 참가자 | `table2@usangtak.test` | 확정된 참가자와 실시간 채팅 (시크릿 창에서) |
| 매칭 실패 참가자 | `fail@usangtak.test` | 실패 사유 → 일정 이동·이용권 보관·환불 |
| 운영자 | `admin@usangtak.test` | 대시보드·매칭 모니터·예외 처리함 등 |

비밀번호는 제출 양식(Blaybus Output 탭)에 적었습니다.

## 시연 순서 (데모 12단계)

1. **새로 신청할 참가자** — 참가 이력의 추천 일정으로 신청하고 결제합니다. 알림함에 결제 완료 알림이 옵니다.
2. **운영자 › 매칭 모니터** — 11/5 회차의 **진행 단계** 패널에서 ① 시연 참가자 13명 만들기 → ② 즉시 실행.
   테이블 2개, 다른 지역으로 재배치 2명, 나이 차이로 실패 1명이 나옵니다. 실행 기록에 이유가 남습니다.
3. **확정된 참가자** — 홈 티켓 카드 → 식탁 좌석도·식당·예약명 → 단체방(확정 안내·큐레이션·식사 조건).
4. **같은 식탁 참가자**(시크릿 창) — 두 창에서 실시간 채팅.
5. **운영자** — 10/22 회차 진행 단계: 리마인드 → 행사 시작(대화 주제) → 체크인 → 종료 → 피드백 → 노쇼 확정.
6. **매칭 실패 참가자** — 일정 이동·보관·환불 중 선택. 운영자 대시보드 "선택 대기 참가자"에서 확인합니다.
7. **운영자** — 예외 처리함, 자동 안내·발송(템플릿 수정, 발송 이력), 테이블 조회, 참석·노쇼 현황, CSV.

시연 회차(10/22·10/29·11/5)는 **자동 진행을 멈춰 두었습니다.** 시간이 지나도 장면이 그대로 남고, 진행 단계 버튼으로만 움직입니다.
되돌리려면 매칭 모니터의 **되돌리기 → 즉시 실행**을 누르면 됩니다.

## 기술 스택

| 영역 | 사용 |
|---|---|
| 앱 | Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS 4 |
| 데이터 | Supabase — Postgres(RLS, 상태 변경은 모두 `security definer` 함수), Auth, Realtime(단체방), pg_cron(1분 스케줄러) |
| 배포 | Vercel (서울 `icn1`, DB와 같은 지역) |
| 알림 | 앱 내 알림 + 웹 푸시(PWA, VAPID) + 이메일(Gmail SMTP), 실패 시 자동 재시도 |
| 테스트 | Vitest (매칭 엔진·문구 생성 단위 테스트) |

자세한 구조와 결정 이유는 [`docs/05.최종 요약서`](docs)와 [`docs/기술스택_아키텍처_결정기록`](docs)에 있습니다.

## 폴더 구조

```
docs/                 산출물 문서 (HTML 원본 + PDF)
db/                   ERD 역공학용 로컬 MySQL 도구
web/
  src/app/(participant)/   참가자 화면 (홈, 신청·결제, 식탁, 단체방, 알림함, 피드백 …)
  src/app/admin/           운영자 어드민
  src/app/api/jobs/tick/   스케줄러 진입점 (pg_cron이 1분마다 호출)
  src/lib/matching/        매칭 엔진(순수 함수)·실행·재배치
  src/lib/delivery/        웹 푸시·이메일 발송과 재시도
  supabase/migrations/     스키마·RLS·DB 함수 (16개)
  scripts/                 시드·시연 데이터 스크립트
```

## 로컬에서 실행하기

필요한 것: Node.js 20+, Docker(로컬 Supabase), Supabase CLI.

```bash
cd web
npm install
npx supabase start            # 로컬 Postgres·Auth·Realtime
npx supabase migration up     # 스키마·함수 적용
```

`web/.env.local`에 아래 값을 넣습니다(실제 값은 저장소에 없습니다).

```
NEXT_PUBLIC_SUPABASE_URL=        NEXT_PUBLIC_SUPABASE_ANON_KEY=     SUPABASE_SERVICE_ROLE_KEY=
SEED_OPERATOR_EMAIL/PASSWORD     SEED_PARTICIPANT_EMAIL/PASSWORD    SEED_TABLE_EMAIL/PASSWORD
SEED_TABLE2_EMAIL/PASSWORD       SEED_FAIL_EMAIL/PASSWORD           SEED_NEW_EMAIL/PASSWORD
JOB_TICK_URL= CRON_SECRET=       (선택) NEXT_PUBLIC_VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=
(선택) GMAIL_USER= GMAIL_APP_PASSWORD= SITE_URL=
```

시드 데이터(가상 신청자 294명 정제본 + 과거 22개 회차 이력)를 넣고 실행합니다.

```bash
npm run seed -- --reset       # 회차·신청·결제·테스트 계정
npm run seed:history          # 과거 회차 매칭·참석·피드백·관계 이력
npm run seed:rooms            # 과거 테이블의 단체방 기록
npm run demo:account          # 새로 신청할 참가자 계정
npm run match -- 2026-10-22   # 10/22 회차 매칭 (확정·실패 시연 상태)
npm run demo:mate             # 확정된 참가자와 같은 식탁의 두 번째 계정
npm run dev                   # http://localhost:3000
```

테스트: `npm test` · 린트: `npm run lint`

## 배포

```bash
cd web
npx supabase db push          # 클라우드 DB에 마이그레이션 적용
npx vercel deploy --prod      # Vercel 배포 (Git 자동 배포는 연결하지 않음)
```

클라우드 스크립트는 `npx tsx --env-file=.env.local --env-file=.env.cloud scripts/<이름>.mts`로 실행합니다.
