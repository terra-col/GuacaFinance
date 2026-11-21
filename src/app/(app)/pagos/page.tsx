import Link from "next/link";
import { BillForm, IncomeForm } from "@/components/bill-forms";
import { ChecklistRow } from "@/components/checklist-row";
import { MonthPlanCard } from "@/components/month-plan";
import { incomeChecklist, incomeRow, monthPlan, nextIncomeDate } from "@/lib/budget";
import { loadData } from "@/lib/data";
import { byDue, favoriteFirst, formatCOP, monthName, monthlyChecklist, nextDueDate, shiftMonth } from "@/lib/finance";
import { ScheduledList, type ScheduledRow } from "@/components/scheduled-list";
import { goalChecklist } from "@/lib/goals";
import { PaymentsCalendar } from "@/components/payments-calendar";
import { SegmentedNav } from "@/components/segmented-nav";
import { calendarEntries, calendarTotals, calendarWeeks } from "@/lib/calendar";


function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const { accounts, txs, bills, incomes, budgets, skips, planReady, goals, deposits, today } = await loadData();
  const current = today.slice(0, 7);
  const { mes: asked, vista } = await searchParams;
  const calendar = vista === "calendario";
  const valid = Boolean(asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked));
  // The list: the current month and the past (future months have nothing to tick yet).
  // The calendar also looks ahead, up to a year, to see what is coming.
  const month = calendar
    ? valid && asked! >= shiftMonth(current, -12) && asked! <= shiftMonth(current, 12)
      ? asked!
      : current
    : valid && asked! <= current
      ? asked!
      : current;
  const editable = month === current;
  const canGoNext = calendar ? month < shiftMonth(current, 12) : !editable;
  const hrefFor = (m: string, view = calendar) => `/pagos?${view ? "vista=calendario&" : ""}mes=${m}`;

  // Bills, card and loan payments, and the monthly saving of goals with a plan.
  const items = [...monthlyChecklist(accounts, bills, txs, month, today, skips), ...goalChecklist(goals, deposits, month, today, skips)].sort(byDue);
  const incomeItems = incomeChecklist(incomes, txs, month, today, skips);
  // Where a payment can come from: cards and savings for a bill, savings and cash for the rest.
  const spendable = favoriteFirst(accounts.filter((a) => a.kind !== "loan")).map(({ id, name }) => ({ id, name }));
  const savings = favoriteFirst(accounts.filter((a) => a.kind === "savings" || a.kind === "cash")).map(({ id, name }) => ({ id, name }));

  const header = (
    <div className="pt-2">
      {/* A month picker: the title centred between the previous and next month. */}
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <Link href={hrefFor(shiftMonth(month, -1))} className="liquid flex size-10 shrink-0 items-center justify-center rounded-full" aria-label={`Ver ${monthName(shiftMonth(month, -1))}`}>
          <Chevron dir="left" />
        </Link>
        <h1 className="display min-w-0 text-center text-2xl sm:text-3xl">
          Pagos de {monthName(month)}
          {month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ""}
        </h1>
        {canGoNext ? (
          <Link href={hrefFor(shiftMonth(month, 1))} className="liquid flex size-10 shrink-0 items-center justify-center rounded-full" aria-label={`Ver ${monthName(shiftMonth(month, 1))}`}>
            <Chevron dir="right" />
          </Link>
        ) : (
          <span className="liquid flex size-10 shrink-0 items-center justify-center rounded-full opacity-35" aria-hidden="true">
            <Chevron dir="right" />
          </span>
        )}
      </div>
      {/* Segmented control, centred under the title. */}
      <div className="mt-4 flex flex-col items-center gap-2">
        <SegmentedNav
          label="Cómo ver los pagos"
          name="pagos-view"
          items={[
            { href: hrefFor(month <= current ? month : current, false), label: "Lista", active: !calendar },
            { href: hrefFor(month, true), label: "Calendario", active: calendar },
          ]}
        />
        {!editable && (
          <Link href={hrefFor(current)} className="text-sm font-medium text-brand">
            Volver a {monthName(current)}
          </Link>
        )}
      </div>
    </div>
  );

  if (calendar) {
    const { byDate, undated } = calendarEntries(items, incomeItems);
    const totals = calendarTotals([...Object.values(byDate).flat(), ...undated]);
    return (
      <>
        {header}
        <p className="-mt-3 text-balance text-center text-sm text-ink-3">
          {month < current ? "Así quedó ese mes." : month === current ? "Lo que te toca pagar y recibir, día por día." : "Lo que viene, según tus pagos fijos, deudas e ingresos de hoy."}{" "}
          {(totals.toPay > 0 || totals.toReceive > 0) && (
            <>
              {month >= current ? "Por pagar" : "Quedó sin pagar"} <span className="num font-medium text-ink">{formatCOP(totals.toPay)}</span>
              {totals.unknown > 0 ? ` (+${totals.unknown} de valor variable)` : ""}
              {totals.toReceive > 0 && (
                <>
                  {" "}
                  · por recibir <span className="num font-medium text-ink">{formatCOP(totals.toReceive)}</span>
                </>
              )}
              .
            </>
          )}
        </p>
        <PaymentsCalendar
          key={month}
          weeks={calendarWeeks(month)}
          byDate={byDate}
          rows={[...items, ...incomeItems.map(incomeRow)]}
          undated={undated}
          today={today}
          month={month}
          editable={editable}
          spendable={spendable}
          savings={savings}
        />
      </>
    );
  }
  const plan = monthPlan(incomeItems, items, budgets);

  // One-time extras drop off the list once their month is over.
  const visibleIncomes = incomes.filter((i) => !i.once_month || i.once_month >= current);
  // Incomes and fixed bills with their next date (even in a coming month), soonest first.
  const scheduled: ScheduledRow[] = [
    ...visibleIncomes.map((income) => ({ kind: "income" as const, income, next: nextIncomeDate(income, today) })),
    ...bills.map((bill) => ({ kind: "bill" as const, bill, next: nextDueDate(bill.due_day, today) })),
  ].sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999"));
  const counted = items.filter((i) => !i.skipped);
  const done = counted.filter((i) => i.paid).length;
  const skippedCount = items.length - counted.length;
  const pendingAmount = counted.filter((i) => !i.paid).reduce((sum, i) => sum + (i.expected ?? 0), 0);
  const variable = counted.filter((i) => !i.paid && !i.expected).length;


  return (
    <>
      {header}
      <p className="-mt-3 text-balance text-center text-sm text-ink-3">
        {editable
          ? "Lo que entra y lo que tienes que pagar este mes. Al marcar uno se registra el movimiento; cada mes la lista vuelve a empezar."
          : "Mes cerrado: así quedó la lista."}
      </p>

      {planReady && (incomes.length > 0 || budgets.length > 0) && <MonthPlanCard plan={plan} />}

      {incomeItems.length > 0 && (
        <section className="card" aria-label="Ingresos del mes">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-2xl">Ingresos</h2>
            <p className="text-sm text-ink-3">
              {plan.incomePending > 0 ? (
                <>
                  Por llegar <span className="num font-medium text-ink">{formatCOP(plan.incomePending)}</span>
                </>
              ) : (
                "Todo recibido"
              )}
            </p>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {incomeItems.map((i) => (
              <ChecklistRow key={`income-${i.id}`} item={incomeRow(i)} month={month} today={today} editable={editable} accounts={savings} />
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <section className="card">
          <p className="font-medium">No hay pagos obligatorios {editable ? "este mes" : "en ese mes"}.</p>
          <p className="mt-1 text-sm text-ink-2">Agrega tus pagos fijos aquí abajo. Las tarjetas y préstamos con saldo aparecen solos.</p>
        </section>
      ) : (
        <section className="card" aria-label="Lista de pagos del mes">
          <div className="flex items-baseline justify-between gap-3">
            <p className="display text-2xl">
              {done} de {counted.length} pagados
            </p>
            <p className="text-right text-sm text-ink-2">
              {done === counted.length ? (
                <span className="pill pill-idea text-sm">🎉 Mes al día</span>
              ) : (
                <>
                  Faltan <span className="num font-medium text-ink">{formatCOP(pendingAmount)}</span>
                  {variable > 0 ? ` y ${variable} de valor variable` : ""}
                </>
              )}
            </p>
          </div>
          <div className="track mt-3 h-3" role="img" aria-label={`${done} de ${counted.length} pagados`}>
            <div className="fill fill-have" style={{ width: `${counted.length ? (done / counted.length) * 100 : 100}%` }} />
          </div>
          {skippedCount > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              {skippedCount} omitido{skippedCount > 1 ? "s" : ""} este mes, no cuenta{skippedCount > 1 ? "n" : ""} en el total.
            </p>
          )}
          <ul className="mt-3 divide-y divide-line">
            {items.map((item) => (
              <ChecklistRow
                key={`${item.type}-${item.id}`}
                item={item}
                month={month}
                today={today}
                editable={editable}
                accounts={item.type === "bill" ? spendable : savings}
              />
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <>
          <div className="flex flex-wrap gap-2">
            <details className="group w-full" open={bills.length === 0}>
              <summary className="btn-quiet inline-flex cursor-pointer list-none">Agregar un pago fijo</summary>
              <div className="mt-3">
                <BillForm />
              </div>
            </details>
            {planReady && (
              <details className="group w-full" open={incomes.length === 0 && bills.length > 0}>
                <summary className="btn-quiet inline-flex cursor-pointer list-none">Programar un ingreso o un extra</summary>
                <div className="mt-3">
                  <IncomeForm accounts={savings} currentMonth={current} />
                </div>
              </details>
            )}
          </div>

          {scheduled.length > 0 && (
            <section className="card" aria-labelledby="scheduled-title">
              <h2 id="scheduled-title" className="display text-2xl">
                Programados
              </h2>
              <p className="text-sm text-ink-3">
                Lo que entra y lo que pagas de forma fija, con su próxima fecha aunque sea en otro mes (la prima, un extra). Toca Editar para cambiarlo. Las
                tarjetas y préstamos se administran en Créditos.
              </p>
              <ScheduledList rows={scheduled} accounts={savings} currentMonth={current} />
            </section>
          )}
        </>
      )}
    </>
  );
}
