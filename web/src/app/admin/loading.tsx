// Shown at once while an operator screen loads, so a click never looks ignored.
export default function Loading() {
  const bar = "animate-pulse rounded-lg bg-sand/70";
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="불러오는 중">
      <div className="flex flex-col gap-2">
        <div className={`${bar} h-3 w-24`} />
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-3 w-96 max-w-full`} />
      </div>
      <div className={`${bar} h-9 w-80 max-w-full`} />
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex gap-4 border-t border-line/70 px-4 py-3 first:border-t-0">
            <div className={`${bar} h-4 w-20`} /><div className={`${bar} h-4 w-32`} /><div className={`${bar} h-4 flex-1`} />
          </div>
        ))}
      </div>
    </div>
  );
}
