// Varied one-liners and public reviews for seeded people, so the same sentence does not repeat
// around one table. Picks are stable for a given key (profile or application id).

const BY_INTEREST = {
  FOOD_CAFE: ["요즘 동네 빵집 투어 중이에요", "맛집 리스트가 메모장 한가득", "새로 생긴 카페는 꼭 가 봐요", "노포 찾아다니는 게 취미예요"],
  MOVIE_DRAMA: ["주말엔 영화관에서 살아요", "정주행할 드라마 추천받아요", "인생 영화 이야기 나눠요", "OTT 신작은 다 챙겨 봐요"],
  TRAVEL: ["다음 여행지 고민 중이에요", "혼자 떠나는 여행을 좋아해요", "여행 사진 정리가 취미예요", "제주 한 달 살기가 꿈이에요"],
  MUSIC: ["출퇴근길 플레이리스트 장인", "페스티벌 시즌만 기다려요", "요즘 재즈에 빠졌어요", "LP 모으는 중이에요"],
  EXERCISE: ["퇴근하고 한강에서 러닝해요", "주말 아침엔 클라이밍", "등산 메이트 구해요", "필라테스 3년 차예요"],
  READING: ["한 달에 책 두 권 읽어요", "요즘 에세이에 빠져 있어요", "독립서점 구경을 좋아해요", "추리소설이라면 밤새워요"],
  SELF_DEV: ["아침 루틴 만드는 중이에요", "새로운 걸 배우는 게 좋아요", "요즘 외국어 공부 중이에요", "사이드 프로젝트 하고 있어요"],
  ART: ["전시 보러 다니는 게 취미예요", "뮤지컬 덕후예요", "주말엔 미술관 산책해요", "도자기 공방 다녀요"],
  FASHION_BEAUTY: ["빈티지 옷 구경 좋아해요", "향수 모으는 게 취미예요", "계절마다 옷장 정리해요", "편집숍 탐방 좋아해요"],
  PHOTO_VIDEO: ["필름 카메라 들고 다녀요", "일상 브이로그 찍어요", "노을 사진 수집가예요", "사진 찍어 드리는 거 좋아해요"],
};
const BY_TRAIT = {
  LISTENER: ["이야기 듣는 걸 좋아해요", "리액션 부자예요", "고민 상담 잘 들어줘요"],
  DEEP_TALK: ["깊은 대화가 좋아요", "진지한 이야기도 환영이에요", "사는 이야기 나누는 게 좋아요"],
  HUMOR_TALK: ["웃음이 많은 편이에요", "드립 받아 주실 분 환영", "유쾌한 대화를 좋아해요"],
  CALM: ["조용히 잘 어울리는 편이에요", "잔잔한 대화가 좋아요", "천천히 친해지는 편이에요"],
  ENERGETIC: ["처음 만나도 금방 친해져요", "텐션 높은 편이에요", "새로운 사람 만나는 게 좋아요"],
  LEADER: ["어색함은 제가 깰게요", "대화 시작은 맡겨 주세요", "모임 분위기 메이커예요"],
};

export const REVIEW_POOL = [
  "처음 보는 분들인데 대화가 끊기지 않았어요.", "식당 분위기가 좋아서 편하게 이야기했어요.", "혼자 먹기 아쉬운 날 딱 좋았어요.",
  "연령대가 비슷해서 이야기가 잘 통했어요.", "생각보다 훨씬 즐거운 저녁이었어요.", "다음에도 또 신청하고 싶어요.",
  "대화 주제 덕분에 어색하지 않게 시작했어요.", "새로운 사람을 만나는 부담이 적었어요.", "관심사가 겹쳐서 2차까지 갔어요.",
  "음식도 대화도 다 만족스러웠어요.", "낯가림이 심한데도 편하게 있다 왔어요.", "퇴근 후에 기분 전환이 제대로 됐어요.",
  "단체방 안내가 깔끔해서 찾아가기 쉬웠어요.", "예약까지 다 되어 있어서 몸만 가면 됐어요.", "서로 다른 직업 이야기가 재밌었어요.",
  "아이스브레이킹 질문이 의외로 꿀잼이었어요.", "조용한 편인데 다들 배려해 줘서 좋았어요.", "목요일 저녁 루틴으로 만들고 싶어요.",
  "추천받은 책을 벌써 주문했어요.", "인원이 딱 적당해서 모두와 이야기했어요.", "생각지 못한 인연을 만난 기분이에요.",
  "한 사람도 소외되지 않게 대화가 흘렀어요.", "다음엔 다른 지역으로도 가 보려고요.", "가볍게 갔다가 웃고만 왔어요.",
];

export function keyNumber(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// About six in ten lean on an interest, the rest on how the person talks.
export function oneLinerFor(key, interests, traits) {
  const n = keyNumber(key);
  const fromInterest = (interests ?? []).map((c) => BY_INTEREST[c]).filter(Boolean);
  const fromTrait = (traits ?? []).map((c) => BY_TRAIT[c]).filter(Boolean);
  const useInterest = fromInterest.length && (n % 10 < 6 || !fromTrait.length);
  const lists = useInterest ? fromInterest : fromTrait;
  if (!lists.length) return null;
  const list = lists[(n >>> 4) % lists.length];
  return list[(n >>> 8) % list.length].slice(0, 30);
}

export const reviewFor = (key) => REVIEW_POOL[(keyNumber(key) >>> 3) % REVIEW_POOL.length];
