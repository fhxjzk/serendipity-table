// Shared pieces for the participant (mobile) screens.
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({ title, back = "/home", step }: { title: string; back?: string; step?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/90 backdrop-blur lg:border-cream/10 lg:bg-espresso/95 lg:text-cream">
      <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-3">
        <Link href={back} aria-label="뒤로" className="rounded-full p-2 text-ink/70 hover:bg-sand lg:text-cream/70 lg:hover:bg-cream/10"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-[16px] font-bold tracking-[-0.02em]">{title}</h1>
        {step && <span className="ml-auto pr-2 text-[12px] font-medium text-muted tabular lg:text-cream/50">{step}</span>}
      </div>
    </header>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-[12px] text-ember">{message}</p> : null;
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-ink/40 focus:ring-4 focus:ring-ink/5";

export const primaryButton =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-cream transition hover:bg-espresso disabled:opacity-50";

// Checkbox/radio rendered as a pill; the input keeps native form submission.
export function Chip({ name, value, label, type = "checkbox", defaultChecked }: { name: string; value: string; label: string; type?: "checkbox" | "radio"; defaultChecked?: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex items-center rounded-full border border-line bg-white px-3 py-1.5 text-[13px] text-ink/80 transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-cream peer-focus-visible:ring-4 peer-focus-visible:ring-ink/10">
        {label}
      </span>
    </label>
  );
}
