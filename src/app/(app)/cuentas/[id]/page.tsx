import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountHero } from "@/components/account-editor";
import { BalanceChart } from "@/components/balance-chart";
import { TxList } from "@/components/tx-list";
import { loadData } from "@/lib/data";
import { CardPurchases } from "@/components/card-purchases";
import { DebtTags, InstallmentMeter } from "@/components/installment-meter";
import { debtView } from "@/lib/debts";
import { accountForeign, balanceAt, nativeBalance, formatCOP, formatDate, isDebt, monthLabel, monthlySeries, nextDueDate, relativeDay, daysBetween } from "@/lib/finance";
import { purchaseView } from "@/lib/installments";
import { sharedMarks } from "@/lib/shared";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accounts, txs, shared, user, today, purchases, purchasesReady } = await loadData();
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();
  const view = isDebt(account) ? debtView(account, txs, today) : null;
  const schedule = view?.schedule ?? null;
  // Purchases still running first, then the ones already paid.
  const purchaseViews =
    account.kind === "credit_card"
      ? purchases
          .filter((p) => p.account_id === account.id)
          .map((p) => purchaseView(p, account.due_day, today))
          .sort((a, b) => Number(a.done) - Number(b.done))
      : [];

  const debt = isDebt(account);
  const balance = balanceAt(account, txs);
  const points = monthlySeries([account], txs, today, 12)
    .filter((p) => p.byAccount[account.id] !== null)
    .map((p) => ({ label: p.label, balance: p.byAccount[account.id] }));
  const own = txs.filter((t) => t.account_id === account.id || t.source_account_id === account.id);
  const due = account.due_day ? nextDueDate(account.due_day, today) : null;

  const facts = [
    account.institution && ["Entidad", account.institution],
    account.credit_limit && ["Cupo", `${formatCOP(account.credit_limit)} (disponible ${formatCOP(Math.max(0, account.credit_limit - balance))})`],
    account.annual_rate !== null && ["Tasa", `${account.annual_rate.toLocaleString("es-CO")}% efectivo anual`],
    account.rate_type && [
      "Tipo de tasa",
      account.rate_type === "variable" ? `Variable${account.rate_reference ? ` (${account.rate_reference})` : ""}: la cuota puede cambiar` : "Fija: la cuota no cambia",
    ],
    account.refinanced && ["Rediferido", "Sí: el banco amplió el plazo"],
    schedule && ["Plazo", `${schedule.total} cuotas, de ${monthLabel(account.first_due_month!)} a ${monthLabel(schedule.endsMonth)}`],
    account.original_amount && ["Monto original", formatCOP(account.original_amount)],
    account.monthly_payment && [account.kind === "loan" ? "Cuota mensual" : "Pago mínimo o cuota", formatCOP(account.monthly_payment)],
    account.statement_day && ["Día de corte", String(account.statement_day)],
    due && ["Próximo pago", `${formatDate(due)}, ${relativeDay(daysBetween(today, due))}`],
    account.wallet_card_name && ["En Apple Wallet", account.wallet_card_name],
    ["Registrada", `${formatDate(account.opening_date)} con ${formatCOP(account.opening_balance)}`],
  ].filter(Boolean) as [string, string][];

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href={debt ? "/deudas" : "/"} className="text-sm font-medium text-brand">
          ‹ {debt ? "Créditos" : "Inicio"}
        </Link>
        <h1 className="sr-only">{account.name}</h1>
        <AccountHero account={account} balance={balance} native={accountForeign(account) ? nativeBalance(account, txs) : null} debt={debt} today={today} movements={own.length} />
      </div>

      {account.kind === "loan" && (
        <section className="card flex flex-col gap-4" aria-labelledby="loan-plan">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="loan-plan" className="display text-2xl">
                Tus cuotas
              </h2>
              <p className="text-sm text-ink-3">
                {schedule
                  ? schedule.done
                    ? "Según el plazo ya pagaste todas las cuotas. Si aún tienes saldo, revisa el plazo o actualiza el saldo."
                    : `Próxima: ${monthLabel(schedule.nextMonth!)}. La última, en ${monthLabel(schedule.endsMonth)}.`
                  : "Agrega el plazo y las cuotas que ya pagaste para ver en qué cuota vas y cuándo terminas."}
              </p>
            </div>
            <DebtTags rateType={account.rate_type} rateReference={account.rate_reference} refinanced={account.refinanced} />
          </div>
          {schedule ? (
            <>
              <InstallmentMeter paid={schedule.paid} total={schedule.total} />
              {account.monthly_payment && !schedule.done && (
                <p className="text-sm text-ink-2">
                  Te quedan {schedule.left} cuotas de {formatCOP(account.monthly_payment)}: unos{" "}
                  <span className="num font-semibold text-ink">{formatCOP(schedule.left * account.monthly_payment)}</span> por pagar en total
                  {account.rate_type === "variable" ? ", si la tasa no cambia" : ""}.
                </p>
              )}
            </>
          ) : (
            <Link href="#editar" className="btn-quiet self-start">
              Agregar plazo y cuotas
            </Link>
          )}
        </section>
      )}

      {account.kind === "credit_card" && (
        <>
          <DebtTags rateType={account.rate_type} rateReference={account.rate_reference} refinanced={account.refinanced} />
          <CardPurchases accountId={account.id} views={purchaseViews} ready={purchasesReady} />
        </>
      )}

      <section className="card" aria-labelledby="account-trend">
        <h2 id="account-trend" className="display text-2xl">
          {debt ? "Cómo ha bajado" : "Cómo ha cambiado"}
        </h2>
        <p className="mb-3 text-sm text-ink-3">Saldo al cierre de cada mes. El mes actual va hasta hoy.</p>
        <BalanceChart data={points} series={[{ key: "balance", name: "Saldo", color: debt ? "var(--debt)" : "var(--savings)" }]} />
      </section>

      <section className="card">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt className="eyebrow">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>


      <h2 className="display text-2xl">Movimientos de esta cuenta</h2>
      <TxList txs={own} showAdjustments shared={sharedMarks(shared, user.id)} accounts={accounts.map(({ id, name, kind }) => ({ id, name, kind }))} today={today} />
    </>
  );
}
