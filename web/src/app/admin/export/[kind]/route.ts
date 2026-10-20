// F-73 CSV 내보내기: /admin/export/applicants?round=… and /admin/export/tables?round=…
// Operators only. A BOM keeps Korean readable when the file is opened in Excel.
import type { NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, ageOf } from "@/lib/format";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type Profile = { name: string; gender: string; birth_year: number; job: string; mbti: string };

export async function GET(req: NextRequest, ctx: RouteContext<"/admin/export/[kind]">) {
  await requireProfile("OPERATOR");
  const { kind } = await ctx.params;
  const roundId = req.nextUrl.searchParams.get("round");
  if (!roundId || !["applicants", "tables"].includes(kind)) return new Response("round와 종류를 확인해 주세요.", { status: 400 });
  const db = createAdminClient();
  const { data: round } = await db.from("rounds").select("title, event_date").eq("id", roundId).maybeSingle();
  if (!round) return new Response("회차를 찾지 못했어요.", { status: 404 });

  let rows: unknown[][];
  if (kind === "applicants") {
    const { data } = await db.from("application_choices")
      .select("region_code, applications!inner(application_status, payment_status, match_status, attendance_status, submitted_at, profiles(name, gender, birth_year, job, mbti))")
      .eq("round_id", roundId);
    rows = [["이름", "성별", "나이", "직업", "MBTI", "희망 지역", "신청", "결제", "매칭", "참석", "신청 시각"]];
    for (const c of data ?? []) {
      const a = one(c.applications as unknown as { application_status: string; payment_status: string; match_status: string; attendance_status: string; submitted_at: string | null; profiles: Profile | Profile[] | null });
      const p = one(a?.profiles);
      if (!a || !p) continue;
      rows.push([p.name, p.gender === "F" ? "여" : "남", ageOf(p.birth_year), p.job, p.mbti, REGION_LABEL[c.region_code] ?? c.region_code,
        a.application_status, a.payment_status, a.match_status, a.attendance_status, a.submitted_at ?? ""]);
    }
  } else {
    const { data } = await db.from("dining_tables")
      .select("status, region_code, score, reservation_name, venues(name), table_members(left_at, applications(attendance_status), profiles(name, gender, birth_year, job, mbti))")
      .eq("round_id", roundId).order("score", { ascending: false });
    rows = [["테이블", "상태", "지역", "식당", "예약명", "점수", "이름", "성별", "나이", "직업", "MBTI", "참석"]];
    (data ?? []).forEach((t, i) => {
      for (const m of (t.table_members ?? []) as unknown as { left_at: string | null; applications: { attendance_status: string } | { attendance_status: string }[] | null; profiles: Profile | Profile[] | null }[]) {
        if (m.left_at) continue;
        const p = one(m.profiles);
        if (!p) continue;
        rows.push([i + 1, t.status, REGION_LABEL[t.region_code] ?? t.region_code, one(t.venues as { name: string } | { name: string }[] | null)?.name ?? "", t.reservation_name ?? "", t.score ?? "",
          p.name, p.gender === "F" ? "여" : "남", ageOf(p.birth_year), p.job, p.mbti, one(m.applications)?.attendance_status ?? ""]);
      }
    });
  }

  const filename = `${round.event_date}_${kind === "applicants" ? "신청자" : "테이블"}.csv`;
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
