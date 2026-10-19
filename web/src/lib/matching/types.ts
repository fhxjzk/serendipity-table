export type Gender = "M" | "F";

// One paid application, seen from the round being matched.
export type Candidate = {
  applicationId: string;
  profileId: string;
  gender: Gender;
  birthYear: number;
  mbti: string; // 16 types or UNKNOWN
  interests: string[];
  selfTraits: string[];
  wantedTraits: string[];
  regions: string[]; // regions chosen for this round (ETC excluded)
  hasLaterRound: boolean; // also chose a later open round, so a miss here is not final
};

export type RelationType = "MET" | "LIKE" | "DISLIKE" | "BLOCK" | "REPORT";
export type Relation = { from: string; to: string; type: RelationType };

export type MatchSettings = {
  weights: { gender_balance: number; mbti: number; interests: number; wanted_traits: number; new_people: number };
  minScore: number;
  tableMin: number;
  tableMax: number;
  maxAgeGap: number;
};

export type ScoreDetail = {
  total: number;
  components: { gender_balance: number; mbti: number; interests: number; wanted_traits: number; new_people: number };
};

export type FormedTable = {
  regionCode: string;
  members: Candidate[];
  score: ScoreDetail;
};

// Participant-facing reason codes (F-31). Text lives in reasons.ts.
export type FailReason = "NOT_ENOUGH_PEOPLE" | "AGE_GAP" | "RELATION_CONFLICT" | "LOW_SCORE" | "NO_REGION";

export type Failure = {
  candidate: Candidate;
  reason: FailReason;
  waitsForLaterRound: boolean;
};

export type MatchEventType = "PLACED" | "RELEASED" | "REALLOCATED" | "SPLIT" | "MERGED" | "CONFIRMED" | "FAILED";
export type MatchEvent = {
  applicationId: string;
  type: MatchEventType;
  reason: string;
  regionCode?: string;
  tableIndex?: number; // index into result.tables
  detail?: Record<string, unknown>;
};

export type MatchResult = {
  tables: FormedTable[];
  failures: Failure[];
  events: MatchEvent[];
};
