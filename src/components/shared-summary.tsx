import Link from "next/link";
import { formatCOP } from "@/lib/finance";

/** «Te deben / Debes» in Inicio, only while something is pending. It is not money in an account, so it stays out of the balance. */
export function SharedSummary({ position }: { position: { owedToMe: number; iOwe: number } }) {
  const { owedToMe, iOwe } = position;
  if (!owedToMe && !iOwe) return null;
  return (
    <Link href="/compartidos" className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3.5 sm:py-4">
      <span className="text-sm font-semibold">Gastos compartidos</span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        {owedToMe > 0 && (
          <span>
            Te deben <strong className="num text-ink">{formatCOP(owedToMe)}</strong>
          </span>
        )}
        {iOwe > 0 && (
          <span>
            Debes <strong className="num text-ink">{formatCOP(iOwe)}</strong>
          </span>
        )}
      </span>
    </Link>
  );
}
