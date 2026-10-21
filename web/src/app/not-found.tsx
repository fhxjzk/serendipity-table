// Wrong or old address: say so in the service's own voice and offer the way back.
import Link from "next/link";
import { TableSeats } from "@/components/table-seats";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <TableSeats seats={4} size={120} label="빈 식탁" />
      <h1 className="mt-4 text-[20px] font-bold tracking-[-0.02em]">찾는 화면이 없어요</h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted">주소가 바뀌었거나, 내 신청이 아닌 화면일 수 있어요.</p>
      <Link href="/" className="mt-6 flex h-11 items-center rounded-xl bg-ink px-5 text-[14px] font-semibold text-cream">처음 화면으로</Link>
    </main>
  );
}
