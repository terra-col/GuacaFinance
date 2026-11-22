import { formatCOP } from "@/lib/finance";
import { AnimatedNumber } from "./animated-number";

/**
 * The opening tile: what you have and what you owe as two glowing bars that
 * meet at one point, on a track whose midpoint means "even". When the meeting
 * point sits right of the midpoint you have more than you owe.
 */
export function BalanceBeam({ savings, debt, previousNet }: { savings: number; debt: number; previousNet: number | null }) {
  const net = savings - debt;
  const total = savings + debt;
  const share = total > 0 ? savings / total : 0.5;
  const diff = previousNet === null ? null : net - previousNet;

  return (
    <section aria-labelledby="balance-title" className="card @container flex h-full flex-col justify-between gap-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <h2 id="balance-title" className="eyebrow">
            Tu balance hoy
          </h2>
          {diff !== null && diff !== 0 && (
            <span className={`pill ${diff > 0 ? "pill-idea" : "pill-urgent"}`}>
              <span aria-hidden="true">{diff > 0 ? "↑" : "↓"}</span>&nbsp;{diff > 0 ? "Mejoró" : "Bajó"} {formatCOP(Math.abs(diff))} este mes
            </span>
          )}
        </div>
        <p className="hero-number display mt-2 leading-none" style={{ "--chars": formatCOP(net).length } as React.CSSProperties}>
          <AnimatedNumber value={net} from={previousNet ?? net} />
        </p>
        <p className="mt-3 text-ink-2">{net >= 0 ? "Tienes más de lo que debes." : "Debes más de lo que tienes."}</p>
      </div>

      <div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Tienes</p>
            <p className="display text-xl min-[360px]:text-2xl sm:text-3xl">{formatCOP(savings)}</p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Debes</p>
            <p className="display text-xl min-[360px]:text-2xl sm:text-3xl">{formatCOP(debt)}</p>
          </div>
        </div>
        <div
          className="relative mt-3"
          role="img"
          aria-label={`De cada 100 pesos entre lo que tienes y lo que debes, ${Math.round(share * 100)} son tuyos y ${100 - Math.round(share * 100)} son deuda.`}
        >
          <div className="flex h-6 gap-1">
            <div className="overflow-hidden rounded-l-full" style={{ width: `${share * 100}%` }}>
              <div className="grow-left h-full rounded-l-full" />
            </div>
            <div className="flex-1 overflow-hidden rounded-r-full">
              <div className="grow-right h-full rounded-r-full" />
            </div>
          </div>
          <div className="absolute -top-2 left-1/2 h-10 w-0.5 rounded-full bg-ink" aria-hidden="true" />
        </div>
        <p className="mt-3 text-center text-xs text-ink-3">La línea marca el punto de equilibrio</p>
      </div>
    </section>
  );
}
