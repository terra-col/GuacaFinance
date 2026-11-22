// Personas and Grupos in Compartidos: each folds, and neither is taken for the other.
// People: round and purple. Groups: square and teal.
const KIND = {
  people: {
    colour: "var(--brand)",
    shape: "rounded-full",
    path: "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  },
  groups: {
    colour: "var(--savings)",
    shape: "rounded-xl",
    path: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8",
  },
};
const HOUSE = "M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20";

function Mark({ colour, shape, path }: { colour: string; shape: string; path: string }) {
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center ${shape}`} style={{ background: `color-mix(in srgb, ${colour} 18%, transparent)`, color: colour }} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

export const GroupMark = ({ house }: { house: boolean }) => <Mark {...KIND.groups} path={house ? HOUSE : KIND.groups.path} />;

export function FoldSection({ kind, title, count, children }: { kind: keyof typeof KIND; title: string; count: number; children: React.ReactNode }) {
  const look = KIND[kind];
  return (
    <details open className="card group/fold py-3.5 sm:py-4" style={{ borderColor: `color-mix(in srgb, ${look.colour} 50%, transparent)` }} data-fold={kind}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <Mark {...look} />
        <h2 className="display min-w-0 flex-1 text-2xl">
          {title} <span className="num text-base text-ink-3">{count}</span>
        </h2>
        <span className="text-xl text-ink-3 transition-transform group-open/fold:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
