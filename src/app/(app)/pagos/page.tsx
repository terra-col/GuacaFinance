import Link from "next/link";
import { BillForm, IncomeForm } from "@/components/bill-forms";
import { HouseCard } from "@/components/house-card";
import { AddPayment, type HouseOption, type HouseSetup } from "@/components/house-forms";
import { profileName } from "@/lib/brand";
import { knownPeople } from "@/lib/contacts";
import { houseChecklist, houseMonth, houseSummary, housesOf } from "@/lib/house";
import { memberOf } from "@/lib/shared";
import { ChecklistRow } from "@/components/checklist-row";
import { Modal } from "@/components/modal";
import { PaidGroup } from "@/components/paid-group";
import { MonthPlanCard } from "@/components/month-plan";
import { incomeChecklist, incomeRow, monthPlan, nextIncomeDate } from "@/lib/budget";
import { loadData } from "@/lib/data";
import { byDue, currentBills, favoriteFirst, formatCOP, monthName, monthlyChecklist, nextBillDate, pendingFirst, rowKey, shiftMonth } from "@/lib/finance";
import { isFrequent } from "@/lib/recurrence";
import { ScheduledList, type ScheduledRow } from "@/components/scheduled-list";
import { goalChecklist } from "@/lib/goals";
import { PaymentsCalendar } from "@/components/payments-calendar";
import { PaymentsViews, type PaymentsView } from "@/components/payments-views";
import { calendarEntries, calendarTotals, calendarWeeks } from "@/lib/calendar";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const { accounts, txs, bills, incomes, budgets, skips, planReady, goals, deposits, shared, house, user, today } = await loadData();
  const current = today.slice(0, 7);
  const { mes: asked, vista } = await searchParams;
  const view: PaymentsView = vista === "calendario" ? "calendario" : "lista";
  const valid = Boolean(asked && MONTH.test(asked));
  // The list: the past, this month and the next one (to tick early what the salary of the
  // end of the month pays). The calendar also looks ahead, up to a year, to see what is coming.
  const nextMonth = shiftMonth(current, 1);
  const range: Record<PaymentsView, [string, string]> = {
    lista: ["0000-01", nextMonth],
    calendario: [shiftMonth(current, -12), shiftMonth(current, 12)],
  };
  const monthFor = (v: PaymentsView) => (valid && asked! >= range[v][0] && asked! <= range[v][1] ? asked! : current);
  const month = monthFor(view);
  const other: PaymentsView = view === "lista" ? "calendario" : "lista";
  // Both views come in this page (and switch instantly) when they show the same month.
  const both = monthFor(other) === month;
  // This month and the next can be ticked; earlier ones are a record.
  const editable = month === current || month === nextMonth;
  const ahead = month === nextMonth;
  const hrefFor = (m: string, v: PaymentsView) => `/pagos?${v === "calendario" ? "vista=calendario&" : ""}mes=${m}`;

  // Bills, card and loan payments, the monthly saving of goals with a plan, and what of the houses is one's own.
  const items = [
    ...monthlyChecklist(accounts, bills, txs, month, today, skips),
    ...houseChecklist(house, shared, user.id, month, today),
    ...goalChecklist(goals, deposits, month, today, skips),
  ].sort(byDue);
  const houses: HouseOption[] = housesOf(shared).map((g) => ({
    id: g.id,
    name: g.name,
    me: memberOf(g.id, shared, user.id)!.id,
    members: shared.members.filter((m) => m.group_id === g.id && !m.removed_at).map(({ id, name }) => ({ id, name })),
  }));
  const setup: HouseSetup = {
    myName: profileName(user),
    known: knownPeople(shared, user.id),
    groups: shared.groups.filter((g) => !g.house && !g.direct).map(({ id, name }) => ({ id, name })),
  };
  const ownBills = currentBills(bills);
  const addPayment = house.ready ? <AddPayment houses={houses} setup={setup} ownBills={ownBills} /> : <BillForm inModal />;
  const incomeItems = incomeChecklist(incomes, txs, month, today, skips);
  // Where a payment can come from: cards and savings for a bill, savings and cash for the rest.
  const spendable = favoriteFirst(accounts.filter((a) => a.kind !== "loan")).map(({ id, name }) => ({ id, name }));
  const savings = favoriteFirst(accounts.filter((a) => a.kind === "savings" || a.kind === "cash")).map(({ id, name }) => ({ id, name }));

  /** The month picker: the title centred between the previous and next month. */
  function monthRow(v: PaymentsView) {
    const prev = shiftMonth(month, -1);
    const next = shiftMonth(month, 1);
    const canGoBack = prev >= range[v][0];
    const canGoNext = next <= range[v][1];
    const arrow = (m: string, dir: "left" | "right", on: boolean) =>
      on ? (
        <Link href={hrefFor(m, v)} className="liquid flex size-10 shrink-0 items-center justify-center rounded-full" aria-label={`Ver ${monthName(m)}`}>
          <Chevron dir={dir} />
        </Link>
      ) : (
        <span className="liquid flex size-10 shrink-0 items-center justify-center rounded-full opacity-35" aria-hidden="true">
          <Chevron dir={dir} />
        </span>
      );
    return (
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        {arrow(prev, "left", canGoBack)}
        <h1 className="display min-w-0 text-center text-2xl sm:text-3xl">
          Pagos de {monthName(month)}
          {month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ""}
        </h1>
        {arrow(next, "right", canGoNext)}
      </div>
    );
  }

  const backLink = (v: PaymentsView) =>
    month !== current && (
      <Link href={hrefFor(current, v)} className="text-sm font-medium text-brand">
        Volver a {monthName(current)}
      </Link>
    );

  function calendarBody() {
    const { byDate, undated } = calendarEntries(items, incomeItems);
    const totals = calendarTotals([...Object.values(byDate).flat(), ...undated]);
    return (
      <>
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

  function listBody() {
    const plan = monthPlan(incomeItems, items, budgets);
    // Pending first (late ones by date), then skipped; paid ones go to the folded group at the end.
    const sorted = [...items].sort(pendingFirst);
    const incomeRows = incomeItems.map(incomeRow).sort(pendingFirst);
    // A daily income folds like a daily payment.
    const laterIncome = new Set<string>();
    const nextIncome = new Set<string>();
    for (const row of incomeRows) {
      if (!isFrequent(row.every) || row.paid || !row.due || row.due <= today) continue;
      if (nextIncome.has(row.id)) laterIncome.add(rowKey(row));
      else nextIncome.add(row.id);
    }

    // One-time extras drop off the list once their month is over.
    const visibleIncomes = incomes.filter((i) => !i.once_month || i.once_month >= current);
    // Incomes and fixed bills with their next date (even in a coming month), soonest first.
    const scheduled: ScheduledRow[] = [
      ...visibleIncomes.map((income) => ({ kind: "income" as const, income, next: nextIncomeDate(income, today) })),
      ...ownBills.map((bill) => ({ kind: "bill" as const, bill, next: nextBillDate(bill, today) })),
    ].sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999"));
    // What repeats every day or two shows up to today plus the next one; the rest folds away.
    const later = new Set<string>();
    const nextShown = new Set<string>();
    for (const item of items) {
      if (!isFrequent(item.every) || item.paid || !item.due || item.due <= today) continue;
      if (nextShown.has(item.id)) later.add(rowKey(item));
      else nextShown.add(item.id);
    }
    const counted = items.filter((i) => !i.skipped);
    const done = counted.filter((i) => i.paid).length;
    const skippedCount = items.length - counted.length;
    const pendingAmount = counted.filter((i) => !i.paid).reduce((sum, i) => sum + (i.expected ?? 0), 0);
    const variable = counted.filter((i) => !i.paid && !i.expected).length;

    return (
      <>
        <p className="-mt-3 text-balance text-center text-sm text-ink-3">
          {ahead
            ? `Puedes marcar desde ya lo de ${monthName(month)}: si el salario llega antes de fin de mes y con él pagas lo del mes siguiente. Queda con la fecha en que lo marcas y cuenta para ${monthName(month)}.`
            : editable
              ? "Lo que entra y lo que tienes que pagar este mes. Al marcar uno se registra el movimiento; cada mes la lista vuelve a empezar."
              : "Mes cerrado: así quedó la lista."}
        </p>

        {planReady && (incomes.length > 0 || budgets.length > 0) && <MonthPlanCard plan={plan} />}

        {houses.map((h) => (
          <HouseCard key={h.id} id={h.id} name={h.name} month={month} people={h.members} summary={houseSummary(houseMonth(house, shared, user.id, h.id, month, today))} />
        ))}

        {(incomeItems.length > 0 || (editable && planReady)) && (
          <section className="card" aria-label="Ingresos del mes">
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-2xl">Ingresos</h2>
              {editable && planReady && (
                <Modal label="+ Agregar" title="Nuevo ingreso" buttonClass="btn-quiet h-9 px-3 text-sm">
                  <IncomeForm accounts={savings} currentMonth={current} inModal />
                </Modal>
              )}
            </div>
            {incomeItems.length === 0 ? (
              <p className="mt-1 text-sm text-ink-3">Agrega tu salario, la prima o un extra y aquí verás qué te llega este mes y cuándo.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink-3">
                  {plan.incomePending > 0 ? (
                    <>
                      Por llegar <span className="num font-medium text-ink">{formatCOP(plan.incomePending)}</span>
                    </>
                  ) : (
                    "Todo recibido"
                  )}
                </p>
                <ul className="mt-2 divide-y divide-line">
                  {incomeRows.filter((r) => !r.paid && !laterIncome.has(rowKey(r))).map((row) => (
                    <ChecklistRow key={rowKey(row)} item={row} month={month} today={today} editable={editable} accounts={savings} />
                  ))}
                </ul>
                <PaidGroup id="ingresos-despues" label="Más adelante este mes" count={laterIncome.size}>
                  {incomeRows.filter((r) => laterIncome.has(rowKey(r))).map((row) => (
                    <ChecklistRow key={rowKey(row)} item={row} month={month} today={today} editable={editable} accounts={savings} />
                  ))}
                </PaidGroup>
                <PaidGroup id="ingresos" label="Ya recibidos" count={incomeRows.filter((r) => r.paid).length}>
                  {incomeRows.filter((r) => r.paid).map((row) => (
                    <ChecklistRow key={rowKey(row)} item={row} month={month} today={today} editable={editable} accounts={savings} />
                  ))}
                </PaidGroup>
              </>
            )}
          </section>
        )}

        {items.length === 0 ? (
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">No hay pagos obligatorios {month === current ? "este mes" : "en ese mes"}.</p>
              {editable && (
                <Modal label="+ Agregar" title={house.ready ? "Nuevo pago" : "Nuevo pago fijo"} buttonClass="btn-quiet h-9 shrink-0 px-3 text-sm">
                  {addPayment}
                </Modal>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">Agrega tus pagos fijos (arriendo, servicios, suscripciones). Las tarjetas y préstamos con saldo aparecen solos.</p>
          </section>
        ) : (
          <section className="card" aria-label="Lista de pagos del mes">
            <div className="flex items-center justify-between gap-3">
              <p className="display text-2xl">
                {done} de {counted.length} pagados
              </p>
              {editable && (
                <Modal label="+ Agregar" title={house.ready ? "Nuevo pago" : "Nuevo pago fijo"} buttonClass="btn-quiet h-9 shrink-0 px-3 text-sm">
                  {addPayment}
                </Modal>
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
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
              {sorted.filter((i) => !i.paid && !later.has(rowKey(i))).map((item) => (
                <ChecklistRow key={rowKey(item)} item={item} month={month} today={today} editable={editable} accounts={item.type === "bill" || item.type === "house" ? spendable : savings} />
              ))}
            </ul>
            <PaidGroup id="pagos-despues" label="Más adelante este mes" count={later.size}>
              {sorted.filter((i) => later.has(rowKey(i))).map((item) => (
                <ChecklistRow key={rowKey(item)} item={item} month={month} today={today} editable={editable} accounts={item.type === "bill" || item.type === "house" ? spendable : savings} />
              ))}
            </PaidGroup>
            <PaidGroup id="pagos" label="Ya pagados" count={sorted.filter((i) => i.paid).length}>
              {sorted.filter((i) => i.paid).map((item) => (
                <ChecklistRow key={rowKey(item)} item={item} month={month} today={today} editable={editable} accounts={item.type === "bill" || item.type === "house" ? spendable : savings} />
              ))}
            </PaidGroup>
          </section>
        )}

        {month === current && scheduled.length > 0 && (
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
    );
  }

  const parts = (v: PaymentsView) => ({ top: monthRow(v), under: backLink(v), body: v === "lista" ? listBody() : calendarBody() });
  const shown = (v: PaymentsView) => v === view || both;

  return (
    <PaymentsViews
      view={view}
      hrefs={{ lista: hrefFor(monthFor("lista") === month ? month : current, "lista"), calendario: hrefFor(month, "calendario") }}
      list={shown("lista") ? parts("lista") : undefined}
      calendar={shown("calendario") ? parts("calendario") : undefined}
    />
  );
}
