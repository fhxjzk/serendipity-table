// Participant-facing text for matching outcomes (F-31). No other person's data or scores.
import type { FailReason } from "./types";

export const FAIL_REASON_TEXT: Record<FailReason, string> = {
  NOT_ENOUGH_PEOPLE: "선택하신 날짜·지역에 함께할 신청자가 4명이 되지 않아 테이블을 만들지 못했어요.",
  AGE_GAP: "연령대가 맞는 신청자가 부족해 테이블을 만들지 못했어요. 모든 테이블은 나이 차이 8살 이내로 구성해요.",
  RELATION_CONFLICT: "함께 앉을 수 없는 관계(차단·신고 등)를 피하다 보니 자리가 나지 않았어요.",
  LOW_SCORE: "조건이 잘 맞는 조합을 찾지 못해 이번에는 테이블을 만들지 않았어요.",
  NO_REGION: "선택하신 지역은 아직 우연한 식탁이 열리지 않는 곳이에요.",
};

export const CONFIRM_TEXT = "조건에 맞는 테이블이 확정됐어요. 식당과 단체방 안내를 확인해 주세요.";
export const WAIT_TEXT = "이번 날짜에는 자리가 나지 않았어요. 함께 선택하신 다른 날짜의 매칭을 기다리는 중이에요.";
