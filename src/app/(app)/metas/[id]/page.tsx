import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDeposit, deleteGoal } from "@/app/actions";
import { GoalDeposit } from "@/components/goal-deposit";
import { GoalEditor } from "@/components/goal-editor";
import { GoalSummary } from "@/components/goal-summary";
import { SubmitButton } from "@/components/submit-button";
import { loadData } from "@/lib/data";
import { formatCOP, formatDate, monthEnd, shiftMonth } from "@/lib/finance";
import { goalSchedule, goalView, planOutlook } from "@/lib/goals";
import { cadenceText } from "@/lib/recurrence";

/** One goal: how it is going, its savings plan (which also shows up in Pagos), its deposits, editing. */
export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accounts, txs, goals, deposits, incomes, today } = await loadData();
  const goal = goals.find((g) => g.id === id);
  if (!goal) notFound();

  const view = goalView(goal, deposits, accounts, txs, today);
  const save = goal.kind === "save";
  const outlook = planOutlook(view, deposits, today);
  const own = deposits.filter((d) => d.goal_id === goal.id);
  const month = today.slice(0, 7);
  const savedThisMonth = own.some((d) => d.amount > 0 && d.occurred_on >= `${month}-01` && d.occurred_on <= monthEnd(month));
  const income = incomes.find((i) => i.id === goal.plan_income_id);
  const incomeOptions = incomes.filter((i) => !i.once_month || i.once_month >= month).map(({ id, name, day }) => ({ id, name, day }));
  const open = view.status !== "done" && view.daysLeft >= 0;

  return (
    <>
      <Link href="/metas" className="pt-2 text-sm font-medium text-brand">
        ‹ Metas
      </Link>

      <section className="card flex flex-col gap-4">
        <GoalSummary view={view} large />
      </section>

      {save && open && (
        <section className="card flex flex-col gap-3" aria-labelledby="plan-title">
          <h2 id="plan-title" className="display text-2xl">
            {goal.plan_once ? "Cómo lo vas a pagar" : "Tu plan de ahorro"}
          </h2>
          {goal.plan_once ? (
            <>
              <p className="text-ink-2">
                <span className="font-semibold text-ink">Pago único</span> el {formatDate(goal.target_date)} por {formatCOP(view.remaining)}. Te aparece en Pagos ese día; al
                marcarlo, la meta queda lograda. No se mide por ritmo, así que nunca dirá que vas atrasado.
              </p>
              <Link href={`/pagos?vista=calendario&mes=${goal.target_date.slice(0, 7)}`} className="text-sm font-medium text-brand">
                Ver en el calendario de pagos ›
              </Link>
            </>
          ) : outlook ? (
            <>
              <p className="text-ink-2">
                Abonas <span className="num font-semibold text-ink">{formatCOP(goal.plan_amount!)}</span>, {cadenceText(goalSchedule(goal))}
                {income ? `, de tu ${income.name.toLowerCase()}` : ""}.
                {outlook.next ? ` El próximo es el ${formatDate(outlook.next)} y te aparece en Pagos.` : ""}
              </p>
              {outlook.enough ? (
                <p className="rounded-xl bg-savings/12 p-3 text-sm">
                  <span className="font-semibold">✓ Con este plan llegas a tiempo:</span> {outlook.instalments}{" "}
                  {outlook.instalments === 1 ? "abono más" : "abonos más"} y juntas {formatCOP(Math.min(outlook.projected, view.target))}.
                </p>
              ) : (
                <p className="rounded-xl bg-[var(--warn)]/15 p-3 text-sm">
                  Con este plan llegarías a {formatCOP(outlook.projected)}: <span className="font-semibold">te faltarían {formatCOP(outlook.shortfall)}</span>. Para llegar,
                  abona {formatCOP(Math.ceil((view.remaining / Math.max(1, outlook.instalments)) / 1000) * 1000)} {goalSchedule(goal).every === "monthly" ? "al mes" : "cada vez"}.{" "}
                  <Link href="#editar" className="font-semibold text-brand">
                    Ajustar el plan
                  </Link>
                </p>
              )}
              <Link href={`/pagos?vista=calendario&mes=${outlook.next?.slice(0, 7) ?? month}`} className="text-sm font-medium text-brand">
                Ver en el calendario de pagos ›
              </Link>
            </>
          ) : (
            <>
              <p className="text-ink-2">Sin plan: abonas cuando quieras y no se mide por ritmo. Si prefieres, programa abonos cada mes o un solo pago en su fecha.</p>
              <p className="text-sm text-ink-3">
                Como referencia, para llegar a tiempo: {formatCOP(view.perMonth)} al mes, {formatCOP(view.perQuincena)} por quincena o {formatCOP(view.perWeek)} por semana.
              </p>
              <Link href="#editar" className="btn-quiet self-start">
                Programar un plan
              </Link>
            </>
          )}
        </section>
      )}

      {!save && (
        <section className="card flex flex-col gap-3">
          <h2 className="display text-2xl">Cómo llegar</h2>
          {open ? (
            <p className="text-ink-2">
              Para dejarlo en cero a tiempo, paga <span className="num font-semibold text-ink">{formatCOP(view.perMonth)}</span> al mes
              {view.account?.annual_rate == null ? " (sin tasa registrada, no incluye intereses)" : ", intereses incluidos"}. Cada pago que registres en Pagos o en
              Movimientos suma aquí.
            </p>
          ) : (
            <p className="text-ink-2">{view.status === "done" ? "Ya está en cero." : "La fecha ya pasó: cámbiala para volver a medir el ritmo."}</p>
          )}
          {view.account && (
            <Link href={`/cuentas/${view.account.id}`} className="text-sm font-medium text-brand">
              Ver {view.account.name} ›
            </Link>
          )}
        </section>
      )}

      {save && (
        <section className="card flex flex-col gap-3" aria-labelledby="deposits-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="deposits-title" className="display text-2xl">
              Abonos
            </h2>
            <GoalDeposit goalId={goal.id} suggested={goal.plan_amount ?? (goal.plan_once ? view.remaining : view.perMonth)} />
          </div>
          {own.length === 0 ? (
            <p className="text-sm text-ink-3">Todavía no hay abonos. Puedes abonar aquí o marcar el ahorro del mes en Pagos.</p>
          ) : (
            <ul className="divide-y divide-line">
              {own.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{formatDate(d.occurred_on)}</span>
                  <span className="flex items-center gap-4">
                    <span className={`num font-semibold ${d.amount < 0 ? "text-ink-3" : ""}`}>
                      {d.amount < 0 ? "Retiro " : "+"}
                      {formatCOP(Math.abs(d.amount))}
                    </span>
                    <form action={deleteDeposit}>
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton className="text-ink-3 hover:text-ink" aria-label={`Borrar el abono del ${formatDate(d.occurred_on)}`}>
                        Borrar
                      </SubmitButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <GoalEditor goal={goal} achieved={view.achieved} today={today} fromMonth={savedThisMonth ? shiftMonth(month, 1) : month} incomes={incomeOptions} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-ink-3 hover:text-ink">Eliminar esta meta</summary>
        <form action={deleteGoal} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={goal.id} />
          <p className="text-ink-2">{save ? `Se borran también sus ${own.length} abonos.` : "El crédito y sus pagos no se tocan."} No se puede deshacer.</p>
          <SubmitButton className="btn-quiet border-debt/40 text-ink">Sí, eliminar</SubmitButton>
        </form>
      </details>
    </>
  );
}
