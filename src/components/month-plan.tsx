import type { MonthPlan } from "@/lib/budget";
import { PESOS, formatMain, type MainCurrency } from "@/lib/currency";

/**
 * Income − obligations − budgets = free money, as one bar split into what the
 * salary already has a destination for and what is left to decide.
 */
export function MonthPlanCard({ plan, compact = false, main = PESOS }: { plan: MonthPlan; compact?: boolean; /** Shown in the main currency (Ajustes). */ main?: MainCurrency }) {
  const formatCOP = (n: number) => formatMain(n, main);
  const short = plan.free < 0;
  const whole = Math.max(plan.income, plan.obligations + plan.budgets, 1);
  const parts = [
    { key: "obl", label: "Obligaciones", value: plan.obligations, color: "var(--debt)" },
    { key: "bud", label: "Presupuestos", value: plan.budgets, color: "var(--brand)" },
    { key: "free", label: short ? "Faltante" : "Libre", value: Math.abs(plan.free), color: short ? "var(--warn)" : "var(--savings)" },
  ].filter((p) => p.value > 0);

  return (
    <section className="card" aria-label="Cómo se reparte tu ingreso del mes">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`display ${compact ? "text-xl" : "text-2xl"}`}>Tu mes</h2>
        <p className="text-sm text-ink-3">
          Ingresos <span className="num font-semibold text-ink">{formatCOP(plan.income)}</span>
        </p>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        {plan.income === 0
          ? "Programa tu salario para ver cuánto te queda libre después de pagos y presupuestos."
          : short
            ? `Los pagos y presupuestos superan tus ingresos por ${formatCOP(-plan.free)}. Revisa los topes o abona menos a una deuda.`
            : `Después de pagos y presupuestos te quedan ${formatCOP(plan.free)} para ahorrar o abonar a una deuda.`}
      </p>
      <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-line/50" role="img" aria-label={parts.map((p) => `${p.label} ${formatCOP(p.value)}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.key} className="fill rounded-none first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / whole) * 100}%`, background: p.color }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Obligaciones", value: plan.obligations, color: "var(--debt)", note: plan.unknownObligations ? `+ ${plan.unknownObligations} variable${plan.unknownObligations > 1 ? "s" : ""}` : null },
          { label: "Presupuestos", value: plan.budgets, color: "var(--brand)", note: null },
          { label: short ? "Faltante" : "Libre", value: Math.abs(plan.free), color: short ? "var(--warn)" : "var(--savings)", note: null },
        ].map((p) => (
          <div key={p.label}>
            <dt className="flex items-center gap-1.5 text-ink-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="num font-semibold">{formatCOP(p.value)}</dd>
            {p.note && <dd className="text-xs text-ink-3">{p.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
