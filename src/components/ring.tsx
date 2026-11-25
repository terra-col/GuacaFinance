/** A progress ring that draws itself on load. The label in the middle carries the value. */
/** `small`: a size smaller on phones, for two cards side by side. */
export function Ring({ value, label, sub, gradient, small = false }: { value: number; label: string; sub: string; gradient: "have" | "owe" | "brand"; small?: boolean }) {
  const R = 42;
  const length = 2 * Math.PI * R;
  const clamped = Math.min(1, Math.max(0, value));
  const stops = { have: ["var(--savings)", "var(--savings-2)"], owe: ["var(--debt)", "var(--debt-2)"], brand: ["var(--brand)", "var(--brand-2)"] }[gradient];
  const id = `ring-${gradient}`;
  return (
    <div className={`relative shrink-0 ${small ? "size-[5.25rem] sm:size-28" : "size-28"}`} role="img" aria-label={`${label} ${sub}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={stops[0]} />
            <stop offset="1" stopColor={stops[1]} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" stroke="color-mix(in srgb, var(--ink) 9%, transparent)" strokeWidth="10" />
        {clamped > 0 && (
          <circle
            className="ring-arc"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${length * clamped} ${length}`}
            style={{ "--ring-length": `${length * clamped}` } as React.CSSProperties}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className={`display ${small ? "text-lg sm:text-xl" : "text-xl"}`}>{label}</span>
        <span className="text-[11px] text-ink-3">{sub}</span>
      </div>
    </div>
  );
}
