"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ClipboardCheck, LayoutDashboard, ReceiptText, ShieldAlert, Shuffle, Store, TriangleAlert, UsersRound, UtensilsCrossed } from "lucide-react";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/rounds", label: "회차 관리", icon: CalendarPlus },
  { href: "/admin/venues", label: "식당·재고", icon: Store },
  { href: "/admin/applicants", label: "신청자 목록", icon: UsersRound },
  { href: "/admin/payments", label: "결제·환불 내역", icon: ReceiptText },
  { href: "/admin/matching", label: "매칭 모니터", icon: Shuffle },
  { href: "/admin/tables", label: "테이블 조회", icon: UtensilsCrossed },
  { href: "/admin/attendance", label: "참석·노쇼 현황", icon: ClipboardCheck },
  { href: "/admin/exceptions", label: "예외 처리함", icon: TriangleAlert },
  { href: "/admin/reports", label: "신고·제재", icon: ShieldAlert },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${active ? "bg-cream/10 font-semibold text-cream" : "text-cream/60 hover:bg-cream/5 hover:text-cream"}`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
