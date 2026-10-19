import { LogOut } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Endorsement, Wordmark } from "@/components/brand";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { profile } = await requireProfile("OPERATOR");
  return (
    <div className="flex min-h-dvh bg-paper text-ink">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between bg-espresso px-4 py-6 md:flex">
        <div>
          <div className="px-2">
            <Wordmark tone="light" size="sm" />
            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-gold">Operator Console</p>
          </div>
          <div className="mt-8"><AdminNav /></div>
        </div>
        <div className="border-t border-cream/10 px-2 pt-4">
          <p className="text-[13px] font-medium text-cream">{profile.display_name}</p>
          <p className="text-[11px] text-cream/50">운영자</p>
          <form action={logout} className="mt-3">
            <button className="flex items-center gap-1.5 text-[12px] text-cream/60 hover:text-cream"><LogOut className="h-3.5 w-3.5" />로그아웃</button>
          </form>
          <div className="mt-5"><Endorsement tone="light" /></div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-espresso px-5 py-3 md:hidden">
          <Wordmark tone="light" size="sm" />
          <form action={logout}><button className="text-[12px] text-cream/70">로그아웃</button></form>
        </header>
        <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">{children}</div>
      </div>
    </div>
  );
}
