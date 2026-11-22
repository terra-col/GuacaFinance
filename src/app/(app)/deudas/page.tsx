import Link from "next/link";
import { AccountCard } from "@/components/account-card";
import { AddAccount } from "@/components/add-account";
import { AddTile } from "@/components/add-tile";
import { SortableCarousel } from "@/components/sortable-carousel";
import { PlanSimulator } from "@/components/plan-simulator";
import { planDebts } from "@/lib/planner";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { UsageBar } from "@/components/usage-bar";
import { DebtTags, InstallmentMeter } from "@/components/installment-meter";
import { purchaseView, purchasesSummary } from "@/lib/installments";
import { cardColor } from "@/lib/banks";
import { loadData } from "@/lib/data";
import { debtView, payFirst, type DebtView } from "@/lib/debts";
import { formatCOP, formatDate, isDebt, relativeDay, shelfOrder } from "@/lib/finance";

// Debts slide sideways on every screen, like the account cards: almost one per view on
// phones, a fixed width with arrows on wider screens.
const DEBT_SLIDE = "w-[86%] shrink-0 snap-start sm:w-[22rem]";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}

function DebtModule({
  view,
  first,
  installments,
}: {
  view: DebtView;
  first: boolean;
  /** Cards: their purchases in instalments still running. */
  installments?: ReturnType<typeof purchasesSummary>;
}) {
  const { account } = view;
  const owed = Math.max(0, view.balance);
  return (
    <div className="card flex h-full flex-col gap-4">
      <Link
        href={`/cuentas/${account.id}`}
        draggable={false}
        className="relative block transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
        aria-label={`Ver ${account.name}`}
      >
        <LinkPending />
        <AccountCard
          account={account}
          balance={owed}
          caption={
            view.usage !== null || account.kind === "credit_card"
              ? "Saldo de la deuda"
              : "Te falta por pagar"
          }
          morph={account.id}
        />
      </Link>

      {/* One row: the balance button and, beside it, what makes this debt different (rediferido,
          variable rate), so every card keeps the same rhythm whether it has tags or not. */}
      <div className="-mt-1 flex min-h-10 flex-wrap items-center justify-between gap-2">
        {/* A button, not a link with a ↻ (that reads as "reload"): it opens the balance form on the account. */}
        <Link
          href={`/cuentas/${account.id}#saldo`}
          className="liquid flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold"
        >
          <Icon name="edit" className="size-4 text-brand" />
          Actualizar saldo
        </Link>
        <DebtTags
          rateType={account.rate_type}
          rateReference={account.rate_reference}
          refinanced={account.refinanced}
        />
      </div>

      {first && (
        <p className="pill pill-idea self-start">
          <span aria-hidden="true">★</span>&nbsp;Abona aquí primero: es tu deuda
          más cara
        </p>
      )}

      {account.kind === "credit_card" &&
        (view.usage !== null ? (
          <div>
            <UsageBar usage={view.usage} />
            <p className="mt-1.5 text-sm text-ink-2">
              Disponible{" "}
              <span className="num font-semibold text-ink">
                {formatCOP(view.available!)}
              </span>{" "}
              de {formatCOP(account.credit_limit!)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            Agrega el cupo en{" "}
            <Link
              href={`/cuentas/${account.id}#editar`}
              className="font-medium text-brand"
            >
              Datos
            </Link>{" "}
            para ver el porcentaje de uso.
          </p>
        ))}

      {account.kind === "credit_card" && installments && installments.active > 0 && (
        <Link
          href={`/cuentas/${account.id}#compras`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5 text-sm transition-colors hover:border-brand"
        >
          <span>
            <span className="font-semibold">
              {installments.active} {installments.active === 1 ? "compra" : "compras"} a cuotas
            </span>
            <span className="block text-xs text-ink-3">
              {formatCOP(installments.remaining)} de capital por pagar, aprox.
            </span>
          </span>
          <span className="num shrink-0 font-semibold">
            {formatCOP(installments.monthly)}
            <span className="block text-right text-xs font-normal text-ink-3">al mes</span>
          </span>
        </Link>
      )}

      {account.kind === "loan" && view.schedule && (
        <InstallmentMeter paid={view.schedule.paid} total={view.schedule.total} />
      )}

      {account.kind === "loan" && view.paidShare !== null && (
        <div>
          <div className="flex items-baseline justify-between text-xs font-semibold">
            <span>Llevas pagado</span>
            <span className="num">{Math.round(view.paidShare * 100)}%</span>
          </div>
          <div
            className="track mt-1.5 h-3"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.paidShare * 100)}
            aria-label={`Pagado: ${Math.round(view.paidShare * 100)}%`}
          >
            <div
              className="fill fill-have"
              style={{
                width: `${Math.max(view.paidShare > 0 ? 2 : 0, view.paidShare * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-sm text-ink-2">
            {formatCOP(view.base! - owed)} pagados de {formatCOP(view.base!)}
            {view.baseIsOriginal ? "" : " desde que lo registraste"}.
            {!view.baseIsOriginal && (
              <>
                {" "}
                <Link
                  href={`/cuentas/${account.id}#editar`}
                  className="font-medium text-brand"
                >
                  Agrega el monto original
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
        <Fact
          label="Próximo pago"
          value={
            view.nextDue
              ? `${formatDate(view.nextDue).replace(/ \d{4}$/, "")}, ${relativeDay(view.daysToDue!)}`
              : owed > 0
                ? "Sin día de pago"
                : "Pagada"
          }
        />
        {account.kind === "loan" && (
          <Fact
            label="Cuota"
            value={
              account.monthly_payment ? formatCOP(account.monthly_payment) : "—"
            }
          />
        )}
        {account.kind === "loan" && view.monthsLeft !== null && view.endsIn && (
          <Fact
            label={view.schedule ? "Última cuota" : "Terminas, aprox."}
            value={`${view.endsIn} (${view.monthsLeft} ${view.monthsLeft === 1 ? "cuota" : "cuotas"})`}
          />
        )}
        <Fact
          label="Tasa"
          value={
            account.annual_rate !== null
              ? `${account.annual_rate.toLocaleString("es-CO")}% E.A.`
              : "—"
          }
        />
        {view.monthlyInterest !== null && (
          <Fact
            label="Intereses al mes, aprox."
            value={formatCOP(view.monthlyInterest)}
          />
        )}
      </dl>
    </div>
  );
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { accounts, txs, today, purchases } = await loadData();
  const installmentsOf = (account: DebtView["account"]) =>
    purchasesSummary(
      purchases
        .filter((p) => p.account_id === account.id)
        .map((p) => purchaseView(p, account.due_day, today)),
    );
  const addNow = (await searchParams).nueva === "1";
  const planned = planDebts(accounts, txs);
  const colors = Object.fromEntries(accounts.map((a) => [a.id, cardColor(a)]));
  const views = accounts.filter(isDebt).map((a) => debtView(a, txs, today));
  const owing = views.filter((v) => v.balance > 0);
  const total = owing.reduce((sum, v) => sum + v.balance, 0);
  const interest = owing.reduce((sum, v) => sum + (v.monthlyInterest ?? 0), 0);
  // In the order the person chose by dragging (oldest first until then).
  const inOrder = (list: DebtView[]) => {
    const order = shelfOrder(list.map((v) => v.account)).map((a) => a.id);
    return [...list].sort((a, b) => order.indexOf(a.account.id) - order.indexOf(b.account.id));
  };
  const cards = inOrder(views.filter((v) => v.account.kind === "credit_card"));
  const loans = inOrder(views.filter((v) => v.account.kind === "loan"));
  const limit = cards.reduce(
    (sum, v) => sum + (v.account.credit_limit ?? 0),
    0,
  );
  const used = cards
    .filter((v) => v.account.credit_limit)
    .reduce((sum, v) => sum + Math.max(0, v.balance), 0);
  const first = payFirst(views);

  if (views.length === 0) {
    return (
      <section className="card max-w-xl">
        <h1 className="display text-3xl">Sin créditos registrados</h1>
        <p className="mt-2 text-ink-2">
          Cuando agregues una tarjeta de crédito o un préstamo, aquí verás cuánto
          debes, cuánto cupo usas y cuánto te falta.
        </p>
        <div className="mt-4">
          <AddAccount
          kinds={["credit_card", "loan"]}
            today={today}
            autoOpen={addNow}
            defaultKind="credit_card"
            label="Agregar una tarjeta o un préstamo"
          />
        </div>
      </section>
    );
  }

  return (
    <>
      <AddAccount
          kinds={["credit_card", "loan"]}
        today={today}
        autoOpen={addNow}
        defaultKind="credit_card"
        label="Agregar"
        buttonClass="btn-quiet h-10 gap-1.5 self-end px-4 text-sm -mb-3"
      />
      <section className="card" aria-labelledby="debts-total">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="debts-total" className="eyebrow">
              Saldo en créditos
            </h1>
            <p className="display text-5xl leading-none sm:text-6xl">
              {formatCOP(total)}
            </p>
          </div>
          <dl className="flex flex-wrap gap-6">
            {interest > 0 && (
              <Fact
                label="Intereses al mes, aprox."
                value={formatCOP(interest)}
              />
            )}
            {limit > 0 && (
              <Fact
                label="Cupo usado en tarjetas"
                value={`${Math.round((used / limit) * 100)}%`}
              />
            )}
          </dl>
        </div>

        {/* Parts of a whole: each debt's share of the total, in its card colour, named in the legend. */}
        {owing.length > 1 && (
          <>
            <div
              className="mt-5 flex h-4 gap-1 overflow-hidden rounded-full"
              role="img"
              aria-label="Reparto del saldo total por cuenta"
            >
              {owing.map((v) => (
                <div
                  key={v.account.id}
                  className="fill first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(v.balance / total) * 100}%`,
                    background: cardColor(v.account),
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {owing.map((v) => (
                <li key={v.account.id} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ background: cardColor(v.account) }}
                  />
                  <span className="font-medium">{v.account.name}</span>
                  <span className="num text-ink-3">
                    {formatCOP(v.balance)} (
                    {Math.round((v.balance / total) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {cards.length > 0 && (
        <section aria-labelledby="cards-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="cards-title" className="display text-2xl">
              Tarjetas de crédito
            </h2>
            {cards.length > 1 && (
              <p className="text-sm text-ink-3">{cards.length} · desliza; mantén oprimida una para moverla</p>
            )}
          </div>
          <div className="mt-3">
            <SortableCarousel
              label="Tarjetas de crédito"
              slideClass={DEBT_SLIDE}
              items={cards.map((v) => ({
                id: v.account.id,
                node: <DebtModule view={v} first={v.account.id === first} installments={installmentsOf(v.account)} />,
              }))}
              tail={
                <li className={`flex min-h-40 ${DEBT_SLIDE}`}>
                  <AddTile kind="credit_card" />
                </li>
              }
            />
          </div>
        </section>
      )}

      {loans.length > 0 && (
        <section aria-labelledby="loans-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="loans-title" className="display text-2xl">
              Préstamos
            </h2>
            {loans.length > 1 && (
              <p className="text-sm text-ink-3">{loans.length} · desliza; mantén oprimido uno para moverlo</p>
            )}
          </div>
          <div className="mt-3">
            <SortableCarousel
              label="Préstamos"
              slideClass={DEBT_SLIDE}
              items={loans.map((v) => ({ id: v.account.id, node: <DebtModule view={v} first={v.account.id === first} /> }))}
              tail={
                <li className={`flex min-h-40 ${DEBT_SLIDE}`}>
                  <AddTile kind="loan" />
                </li>
              }
            />
          </div>
        </section>
      )}

      {planned.length > 0 && (
        <div id="plan" className="scroll-mt-4">
          <PlanSimulator
            debts={planned}
            colors={colors}
            startMonth={today.slice(0, 7)}
          />
        </div>
      )}

      <p className="text-xs text-ink-3">
        Los intereses son un estimado sobre el saldo de hoy con la tasa que
        registraste. El extracto del banco manda.
      </p>
    </>
  );
}
