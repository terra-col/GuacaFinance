import { deleteBudget } from "@/app/actions";
import type { BudgetView } from "@/lib/budget";
import { formatCOP, type CategoryTotal } from "@/lib/finance";
import { Icon, txIconName } from "./icons";
import { BudgetForm } from "./bill-forms";
import { BudgetsViewToggle } from "./budgets-view-toggle";
import { Modal } from "./modal";
import { SpendingDonut } from "./spending-donut";
import { SubmitButton } from "./submit-button";

const STATUS = {
  ok: { fill: "var(--savings)", pill: null },
  watch: { fill: "var(--warn)", pill: { cls: "pill-warn", text: "Vas rápido" } },
  over: { fill: "var(--debt)", pill: { cls: "pill-urgent", text: "Te pasaste" } },
} as const;

/**
 * Presupuestos, two ways. Bars (the default): each budget as a bar of what was spent, with a
 * tick for where spending «should» be by today; past the tick means the month is running ahead.
 * Chart: a donut of where the month's spending went, by category.
 */
export function BudgetsCard({ views, current, totals }: { views: BudgetView[]; current: boolean; totals: CategoryTotal[] }) {
  const bars =
    views.length === 0 ? (
      <p className="mt-3 text-sm text-ink-2">Ponle un tope mensual a una categoría (mercado, ocio, gasolina) y aquí verás cuánto te queda cada día.</p>
    ) : (
      <ul className="mt-3 flex flex-col gap-4">
        {views.map((v) => {
          const look = STATUS[v.status];
          return (
            <li key={v.id}>
              <div className="flex items-center gap-2">
                <span className="icon-tile tone-brand size-8 rounded-lg">
                  <Icon name={txIconName({ kind: "expense", category: v.category })} className="size-4" />
                </span>
                <p className="min-w-0 flex-1 truncate font-semibold">{v.category}</p>
                {look.pill && <span className={`pill ${look.pill.cls}`}>{look.pill.text}</span>}
                <p className="num shrink-0 text-sm">
                  <span className="font-semibold">{formatCOP(v.spent)}</span>
                  <span className="text-ink-3"> de {formatCOP(v.amount)}</span>
                </p>
              </div>
              <div className="track relative mt-2 h-2.5" role="img" aria-label={`${v.category}: gastado ${Math.round(v.share * 100)} % del tope`}>
                <div className="fill" style={{ width: `${Math.min(1, v.share) * 100}%`, background: look.fill }} />
                {current && v.pace > 0 && v.pace < 1 && (
                  <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/50" style={{ left: `${v.pace * 100}%` }} title="Lo esperado a hoy" />
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink-3">
                <span>
                  {v.left < 0
                    ? `Pasado por ${formatCOP(-v.left)}`
                    : current
                      ? `Quedan ${formatCOP(v.left)}${v.perDay ? `, unos ${formatCOP(v.perDay)} por día` : ""}`
                      : `Sobraron ${formatCOP(v.left)}`}
                </span>
                {current && (
                  <span className="flex shrink-0 items-center gap-3">
                    <Modal label="Cambiar" title={`Presupuesto de ${v.category}`} buttonClass="font-medium hover:text-ink">
                      <BudgetForm initial={v} />
                    </Modal>
                    <form action={deleteBudget}>
                      <input type="hidden" name="id" value={v.id} />
                      <SubmitButton className="font-medium hover:text-ink" aria-label={`Quitar presupuesto de ${v.category}`}>
                        Quitar
                      </SubmitButton>
                    </form>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="card" aria-label="Presupuestos del mes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl">Presupuestos</h2>
        <Modal label="+ Agregar" title="Nuevo presupuesto" buttonClass="btn-quiet h-9 px-3 text-sm">
          <BudgetForm taken={views.map((v) => v.category)} />
        </Modal>
      </div>
      <BudgetsViewToggle bars={bars} chart={<SpendingDonut totals={totals} />} />
    </section>
  );
}
