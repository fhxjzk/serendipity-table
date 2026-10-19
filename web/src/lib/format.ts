// Display helpers. All times are shown in KST regardless of the server's zone.
const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});

export const formatKst = (iso: string | null | undefined) => (iso ? kst.format(new Date(iso)) : "-");

export const ageOf = (birthYear: number) => new Date().getFullYear() - birthYear;

export const REGION_LABEL: Record<string, string> = {
  HONGDAE: "홍대/합정", GANGNAM: "강남/신논현", EULJIRO: "을지로/종로", JAMSIL: "잠실", ETC: "기타",
};

// Today in KST as YYYY-MM-DD.
export const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
