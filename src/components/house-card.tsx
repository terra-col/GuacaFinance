import Link from "next/link";
import { formatDate } from "@/lib/finance";
import type { HouseSummary } from "@/lib/house";
import { Avatar } from "./split-panel";

/** A house in one line, in Pagos: how many are paid and what is one's own. Its screen is a tap away. */
export function HouseCard({
  id,
  name,
  month,
  people,
  summary: { paid, of, next, more },
}: {
  id: string;
  name: string;
  month: string;
  people: { id: string; name: string }[];
  summary: HouseSummary;
}) {
  let detail: string;
  if (next) detail = `Te toca ${next.name}, el ${next.due.startsWith(month) ? Number(next.due.slice(8)) : formatDate(next.due)}${more ? ` y ${more} más` : ""}`;
  else if (of === 0) detail = "Agrega el primer recibo";
  else detail = paid === of ? "Todo pagado" : "Nada pendiente para ti";

  return (
    <Link href={`/pagos/casa/${id}?mes=${month}`} className="card flex items-center gap-3 py-3 sm:py-3.5" data-house-card>
      <span className="flex shrink-0 -space-x-3" aria-hidden="true">
        {people.slice(0, 3).map((p, i) => (
          <span key={p.id} className="rounded-full bg-surface">
            <Avatar name={p.name} index={i} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {name}
          {of > 0 && ` · ${paid} de ${of} pagados`}
        </span>
        <span className={`block truncate text-xs ${next ? "font-semibold text-brand" : "text-ink-3"}`}>{detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-brand">Ver ›</span>
    </Link>
  );
}
