// Shown at once while a participant screen loads.
export default function Loading() {
  const bar = "animate-pulse rounded-xl bg-sand/70";
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper" aria-busy="true" aria-label="불러오는 중">
      <div className="h-14 border-b border-line/70" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pt-6">
        <div className={`${bar} h-4 w-24`} />
        <div className={`${bar} h-6 w-64`} />
        <div className={`${bar} h-40 w-full rounded-2xl`} />
        <div className={`${bar} h-24 w-full rounded-2xl`} />
        <div className={`${bar} h-24 w-full rounded-2xl`} />
      </div>
    </main>
  );
}
