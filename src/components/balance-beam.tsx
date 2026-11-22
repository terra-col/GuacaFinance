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
    <section aria-labelledby="balance-title" data-tour="balance" className="card @container flex h-full flex-col justify-between gap-8">
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
        <Track share={share} label={`De cada 100 pesos entre lo que tienes y lo que debes, ${Math.round(share * 100)} son tuyos y ${100 - Math.round(share * 100)} son deuda.`} />
        <p className="mt-3 text-center text-xs text-ink-3">La línea marca el punto de equilibrio</p>
      </div>
    </section>
  );
}

/** The two bars and the midpoint. No share: nothing on either side. */
function Track({ share, label }: { share: number | null; label: string }) {
  return (
    <div className="relative mt-3" role="img" aria-label={label}>
      {share === null ? (
        <div className="h-6 rounded-full bg-line" />
      ) : (
        <div className="flex h-6 gap-1">
          <div className="overflow-hidden rounded-l-full" style={{ width: `${share * 100}%` }}>
            <div className="grow-left h-full rounded-l-full" />
          </div>
          <div className="flex-1 overflow-hidden rounded-r-full">
            <div className="grow-right h-full rounded-r-full" />
          </div>
        </div>
      )}
      <div className="absolute -top-2 left-1/2 h-10 w-0.5 rounded-full bg-ink" aria-hidden="true" />
    </div>
  );
}

/** The same balance for what is owed to one and what one owes: in all, or with one person (`name`). */
export function SharedBeam({ owed, owes, name }: { owed: number; owes: number; name?: string }) {
  const net = owed - owes;
  const total = owed + owes;
  const title = name ? (net > 0 ? "Te debe en total" : net < 0 ? "Le debes en total" : "Están al día") : net > 0 ? "A tu favor" : net < 0 ? "En tu contra" : "Estás al día";
  return (
    <section className="card flex flex-col gap-5" aria-label={name ? `Saldo con ${name}` : "Tus saldos compartidos"}>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="display mt-1 text-4xl leading-none">{formatCOP(Math.abs(net))}</p>
      </div>
      <div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{name ? "Te debe" : "Te deben"}</p>
            <p className="display text-xl min-[360px]:text-2xl">{formatCOP(owed)}</p>
          </div>
          <div className="text-right">
            <p className="eyebrow">{name ? "Le debes" : "Debes"}</p>
            <p className="display text-xl min-[360px]:text-2xl">{formatCOP(owes)}</p>
          </div>
        </div>
        <Track share={total ? owed / total : null} label={`Te deben ${formatCOP(owed)} y debes ${formatCOP(owes)}.`} />
      </div>
    </section>
  );
}
