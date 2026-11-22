import { Avatar } from "./split-panel";

/**
 * A group's people, folded into one line at the top: who they are at a glance. Opened, each one in
 * a short row, with what is done to them in windows of its own.
 */
export function PeopleSection({
  people,
  waiting,
  action,
  children,
}: {
  people: { id: string; name: string; me: boolean }[];
  /** How many have not joined yet. */
  waiting: number;
  /** «+ Agregar», when there is one. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Oneself first; each keeps the colour of their place, the same as when dividing.
  const ordered = people.map((p, index) => ({ ...p, index })).sort((a, b) => Number(b.me) - Number(a.me));
  const shown = ordered.slice(0, 4);
  const names = ordered.map((p) => (p.me ? "Tú" : p.name)).join(", ");
  return (
    <details className="card group/people py-3 sm:py-3.5" data-people>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="flex shrink-0 -space-x-3" aria-hidden="true">
          {shown.map((p) => (
            <span key={p.id} className="rounded-full bg-surface">
              <Avatar name={p.name} index={p.index} />
            </span>
          ))}
          {people.length > shown.length && (
            <span className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-bold text-ink-2">+{people.length - shown.length}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            <span id="people-title">{people.length} personas</span>
            {waiting > 0 && <span className="font-normal text-ink-3"> · {waiting} sin unirse</span>}
          </span>
          <span className="block truncate text-xs text-ink-3">{names}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-brand">
          <span className="group-open/people:hidden">Ver ▾</span>
          <span className="hidden group-open/people:inline">Cerrar ▴</span>
        </span>
      </summary>
      <section aria-labelledby="people-title" className="mt-3 border-t border-line pt-1">
        <ul className="divide-y divide-line">{children}</ul>
        {action && <div className="pt-2">{action}</div>}
      </section>
    </details>
  );
}
