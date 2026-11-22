import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/skeletons";
import { BalanceBeam } from "@/components/balance-beam";
import { BalanceChart, HAVE_OWE } from "@/components/balance-chart";
import { AccountShelf } from "@/components/account-shelf";
import { AddAccount } from "@/components/add-account";
import { MonthPlanCard } from "@/components/month-plan";
import { Ring } from "@/components/ring";
import { advise, type Advice } from "@/lib/advice";
import { incomeChecklist, monthPlan } from "@/lib/budget";
import { profileName } from "@/lib/brand";
import { loadData } from "@/lib/data";
import { balanceAt, byDue, daysBetween, formatCOP, isDebt, monthName, monthlyChecklist, monthlySeries, relativeDay, spendingByCategory, totals } from "@/lib/finance";
import { goalChecklist } from "@/lib/goals";
import { SharedSummary } from "@/components/shared-summary";
import { TourButton } from "@/components/tour";

const LEVEL = { urgent: "Urgente", warn: "Atención", idea: "Idea" };
// Phones swipe through the cards sideways; wider screens lay them out in two columns.
const ADVICE_ROW = "-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0";
const VISIBLE = 4; // the most pressing recommendations; the rest stay one tap away

const adviceCard = (item: Advice) => (
  <li key={item.id} className="card w-[82%] shrink-0 snap-start p-4 sm:p-5 md:w-auto">
    <span className={`pill pill-${item.level}`}>{LEVEL[item.level]}</span>
    <p className="mt-2 font-semibold">{item.title}</p>
    <p className="mt-1 text-sm text-ink-2">{item.detail}</p>
  </li>
);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Props = { searchParams: Promise<{ nueva?: string }> };

/**
 * The skeleton lives here rather than in a loading.tsx at the group level: such
 * a file would also cover account detail pages, and a detail page that shows a
 * skeleton first cannot morph its card in from the list.
 */
export default function Page(props: Props) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard {...props} />
    </Suspense>
  );
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Under the greeting: "Sábado 21 de noviembre". */
function greetingLine(today: string) {
  const d = new Date(`${today}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${monthName(today.slice(0, 7))}`;
}

async function Dashboard({ searchParams }: Props) {
  const { accounts, txs, flows, position, shared, bills, inbox, incomes, budgets, skips, planReady, goals, deposits, user, today } = await loadData();
  const addNow = (await searchParams).nueva === "1";
  const name = profileName(user);
  const invitations = shared.requests?.filter((r) => r.user_id === user.id).length ?? 0;
  const greeting = (
    <div className="pt-1">
      <div className="flex items-center gap-3">
        <h1 className="display text-3xl sm:text-4xl">{name ? `Hola, ${name.split(" ")[0]}` : "Hola"}</h1>
        <TourButton />
      </div>
      <p className="text-sm text-ink-3">
        {greetingLine(today)}
        {!name && (
          <>
            {" · "}
            <Link href="/ajustes#perfil" className="font-medium text-brand">
              Dinos tu nombre
            </Link>
          </>
        )}
      </p>
    </div>
  );

  if (accounts.length === 0) {
    return (
      <>
      {greeting}
      <SharedSummary position={position} invitations={invitations} />
      <section className="max-w-xl pt-2" data-tour="accounts">
        <h2 className="display text-3xl">Empieza por lo que tienes y lo que debes</h2>
        <p className="mt-3 text-ink-2">
          Registra tus cuentas de ahorros, tarjetas y créditos con el saldo de hoy. Desde ahí, cada pago y cada gasto mueve el balance.
        </p>
        <div className="mt-5">
          <AddAccount today={today} autoOpen={addNow} label="Agregar la primera cuenta" />
        </div>
      </section>
      </>
    );
  }

  const now = totals(accounts, txs);
  const series = monthlySeries(accounts, txs, today, 12);
  // Months before the first account existed have no balance; drawing them as $0 would fake a jump.
  const started = series.filter((p) => Object.values(p.byAccount).some((v) => v !== null));
  const lastMonth = series[series.length - 2];
  const previous = started.includes(lastMonth) ? lastMonth : null;
  const spending = spendingByCategory(flows, today.slice(0, 7));
  const spent = spending.reduce((sum, c) => sum + c.amount, 0);
  const advice = advise(accounts, txs, today, bills, flows, skips);
  const debts = accounts.filter(isDebt);

  const month = today.slice(0, 7);
  const checklist = [...monthlyChecklist(accounts, bills, txs, month, today, skips), ...goalChecklist(goals, deposits, month, today, skips)]
    .sort(byDue)
    .filter((i) => !i.skipped);
  const paid = checklist.filter((i) => i.paid).length;
  // What is still to pay this month, soonest first.
  // Each payment once: something daily would fill the four places by itself.
  const upcoming = checklist.filter((i, at, all) => !i.paid && all.findIndex((x) => !x.paid && x.type === i.type && x.id === i.id) === at).slice(0, 4);
  const plan = planReady && incomes.length > 0 ? monthPlan(incomeChecklist(incomes, txs, month, today, skips), checklist, budgets) : null;
  const cardLimit = debts.reduce((sum, a) => sum + (a.credit_limit ?? 0), 0);
  const cardUsed = debts.filter((a) => a.credit_limit).reduce((sum, a) => sum + Math.max(0, balanceAt(a, txs)), 0);

  return (
    <>
      {greeting}
      <div className="grid gap-4 lg:grid-cols-6 lg:gap-5">
        <div className="min-w-0 lg:col-span-4">
          <BalanceBeam savings={now.savings} debt={now.debt} previousNet={previous ? previous.net : null} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1 lg:gap-5">
          <Link href="/pagos" className="card flex items-center gap-4 transition-transform hover:-translate-y-0.5">
            <Ring
              value={checklist.length ? paid / checklist.length : 0}
              label={`${paid}/${checklist.length}`}
              sub="pagados"
              gradient="have"
            />
            <div>
              <p className="eyebrow">Pagos de {monthName(month)}</p>
              <p className="display mt-1 text-xl leading-tight">
                {checklist.length === 0 ? "Sin pagos fijos" : paid === checklist.length ? "Mes al día" : `Faltan ${checklist.length - paid}`}
              </p>
              <p className="mt-1 text-sm text-brand">Abrir la lista</p>
            </div>
          </Link>
          <div className="card flex items-center gap-4">
            {cardLimit > 0 ? (
              <Ring value={cardUsed / cardLimit} label={`${Math.round((cardUsed / cardLimit) * 100)}%`} sub="del cupo" gradient="owe" />
            ) : (
              <Ring value={0} label="—" sub="sin cupo" gradient="owe" />
            )}
            <div>
              <p className="eyebrow">Gastado este mes</p>
              <p className="display mt-1 text-2xl leading-tight">{formatCOP(spent)}</p>
              <p className="mt-1 text-sm text-ink-3">
                {cardLimit > 0 ? `Cupo libre: ${formatCOP(Math.max(0, cardLimit - cardUsed))}` : "Agrega el cupo de tus tarjetas"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <SharedSummary position={position} invitations={invitations} />

      <section aria-labelledby="money-title" data-tour="accounts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="money-title" className="display text-2xl">
              Tus cuentas y efectivo
            </h2>
            <p className="text-sm text-ink-3">Ahorros, nómina, débito y efectivo. Toca una para ver sus movimientos.</p>
          </div>
          <AddAccount today={today} autoOpen={addNow} label="Agregar" buttonClass="btn-quiet h-10 gap-1.5 px-4 text-sm" kinds={["savings", "cash"]} />
        </div>
        <AccountShelf kinds={["savings", "cash"]} accounts={accounts} txs={txs} title="Tus cuentas y efectivo" showTitle={false} />
      </section>

      {inbox.length > 0 && (
        <Link href="/movimientos" className="card flex items-center justify-between gap-3 py-4 text-sm sm:py-4">
          <span className="flex items-center gap-3">
            <span className="badge bg-debt/15 text-debt" aria-hidden="true">
              {inbox.length}
            </span>
            <span>
              {inbox.length === 1 ? "Hay 1 pago de Apple Wallet" : `Hay ${inbox.length} pagos de Apple Wallet`} por revisar. No cuentan en tus saldos todavía.
            </span>
          </span>
          <span className="shrink-0 font-semibold text-brand">Revisar</span>
        </Link>
      )}

      {advice.length > 0 && (
        <section aria-labelledby="advice-title">
          <h2 id="advice-title" className="display text-2xl">
            Qué hacer ahora
          </h2>
          <ul className={ADVICE_ROW}>{advice.slice(0, VISIBLE).map(adviceCard)}</ul>
          {advice.length > VISIBLE && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">
                Ver {advice.length - VISIBLE} {advice.length - VISIBLE === 1 ? "recomendación más" : "recomendaciones más"}
              </summary>
              <ul className={ADVICE_ROW}>{advice.slice(VISIBLE).map(adviceCard)}</ul>
            </details>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-6 lg:gap-5">
        <section className="card lg:col-span-4" aria-labelledby="trend-title">
          <h2 id="trend-title" className="display text-2xl">
            Tu plata mes a mes
          </h2>
          <p className="mb-3 text-sm text-ink-3">Saldo al cierre de cada mes. El mes actual va hasta hoy.</p>
          <BalanceChart data={started.map(({ label, savings: s, debt }) => ({ label, savings: s, debt }))} series={HAVE_OWE} />
          <details className="mt-3 text-sm text-ink-2">
            <summary className="cursor-pointer">Ver como tabla</summary>
            <table className="mt-2 w-full text-right">
              <thead>
                <tr className="text-ink-3">
                  <th className="text-left font-normal">Mes</th>
                  <th className="font-normal">Tienes</th>
                  <th className="font-normal">Debes</th>
                </tr>
              </thead>
              <tbody>
                {started.map((p) => (
                  <tr key={p.month} className="border-t border-line">
                    <td className="py-1 text-left">{p.label}</td>
                    <td className="num">{formatCOP(p.savings)}</td>
                    <td className="num">{formatCOP(p.debt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className="card lg:col-span-2" aria-labelledby="upcoming-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="upcoming-title" className="display text-2xl">
              Próximos pagos
            </h2>
            <Link href="/pagos" className="text-sm font-medium text-brand">
              Ver todos
            </Link>
          </div>
          {checklist.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">Agrega el día de pago a tus tarjetas y créditos, o registra tus pagos fijos, para verlos aquí.</p>
          ) : upcoming.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 font-semibold">
              <span aria-hidden="true">🎉</span> Todo pagado en {monthName(month)}
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {upcoming.map((item) => {
                const late = item.overdue;
                const days = item.due ? daysBetween(today, item.due) : null;
                return (
                  <li key={`${item.type}-${item.id}`} className="flex items-center gap-3">
                    {/* A calendar leaf: the date is the thing to read first. */}
                    <span
                      className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-1.5 leading-tight ${late ? "text-white" : "bg-brand/12 text-ink"}`}
                      style={late ? { background: "linear-gradient(135deg, var(--debt), var(--debt-2))" } : undefined}
                    >
                      <span className="display text-lg">{item.due ? Number(item.due.slice(8, 10)) : "—"}</span>
                      <span className="text-[11px] font-medium">{item.due ? MONTHS[Number(item.due.slice(5, 7)) - 1] : "sin día"}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.name}</p>
                      <p className={`text-sm ${late ? "font-medium text-ink" : "text-ink-3"}`}>{days === null ? "Sin día de pago" : relativeDay(days)}</p>
                    </div>
                    <p className="num shrink-0 text-sm font-medium">{item.expected ? formatCOP(item.expected) : "Variable"}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {checklist.length - paid > upcoming.length && (
            <p className="mt-4 text-xs text-ink-3">Y {checklist.length - paid - upcoming.length} más en la lista de pagos.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-6 lg:gap-5">
        {plan && (
          <div className="lg:col-span-3">
            <MonthPlanCard plan={plan} compact />
          </div>
        )}

        <section className={`card ${plan ? "lg:col-span-3" : "lg:col-span-6"}`} aria-labelledby="spend-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="spend-title" className="display text-2xl">
              En qué se fue
            </h2>
            <Link href="/movimientos" className="text-sm font-medium text-brand">
              Ver movimientos
            </Link>
          </div>
          {spending.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">Todavía no hay gastos este mes.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3.5">
              {spending.map((c) => (
                <li key={c.category} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{c.category}</span>
                    <span className="num">
                      {formatCOP(c.amount)} <span className="text-ink-3">({Math.round((c.amount / spent) * 100)}%)</span>
                    </span>
                  </div>
                  <div className="track mt-1.5 h-2.5">
                    <div className="fill fill-brand" style={{ width: `${(c.amount / spending[0].amount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

    </>
  );
}
