import Link from "next/link";
import { BudgetsCard } from "@/components/budgets-card";
import { InboxItem } from "@/components/inbox-item";
import { budgetViews } from "@/lib/budget";
import { NewMovementButton } from "@/components/quick-add";
import { TxList } from "@/components/tx-list";
import { SectionHead } from "@/components/section-head";
import { sharedMarks } from "@/lib/shared";
import { loadData } from "@/lib/data";
import { formatCOP, monthFlows, monthLabel, spendingByCategory } from "@/lib/finance";

export default async function TransactionsPage() {
  const { accounts, txs, flows: counted, shared, user, inbox, budgets, planReady, today } = await loadData();

  if (accounts.length === 0) {
    return (
      <>
        <section className="card flex flex-col items-start gap-3">
          <h1 className="display text-3xl">Primero registra una cuenta</h1>
          <Link href="/?nueva=1" className="btn">
            Ir a cuentas
          </Link>
        </section>
      </>
    );
  }

  const month = today.slice(0, 7);
  const sum = monthFlows(counted, month);
  const flows = [
    { label: "Ingresos", amount: sum.income, bar: "fill-have" },
    { label: "Gastos", amount: sum.expense, bar: "fill-owe" },
    { label: "Pagos a deuda", amount: sum.payment, bar: "fill-brand" },
  ];
  const largest = Math.max(1, ...flows.map((f) => f.amount));
  const spendable = accounts.filter((a) => a.kind !== "loan").map(({ id, name }) => ({ id, name }));

  return (
    <>
      <SectionHead text="Todo lo que entra y sale de tus cuentas, día por día.">
        <NewMovementButton />
      </SectionHead>

      <section className="card">
        <p className="eyebrow">Flujo de {monthLabel(month)}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {flows.map((flow) => (
            <div key={flow.label}>
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <p className="text-sm text-ink-2">{flow.label}</p>
                <p className="display text-2xl">{formatCOP(flow.amount)}</p>
              </div>
              <div className="track mt-2 h-2.5">
                <div className={`fill ${flow.bar}`} style={{ width: `${(flow.amount / largest) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {planReady && (
        <BudgetsCard
          views={budgetViews(budgets, counted, month, today)}
          current
          // Where the month's spending went.
          totals={spendingByCategory(counted, month)}
        />
      )}

      {inbox.length > 0 && (
        <section className="card">
          <h2 className="display text-2xl">Pagos de Apple Wallet por revisar</h2>
          <p className="text-sm text-ink-3">Llegaron sin monto o con una tarjeta que aún no está vinculada. No afectan tus saldos hasta que los registres.</p>
          <ul className="mt-1 divide-y divide-line">
            {inbox.map((item) => (
              <InboxItem key={item.id} item={item} accounts={spendable} />
            ))}
          </ul>
        </section>
      )}

      <TxList txs={txs} shared={sharedMarks(shared, user.id)} accounts={accounts.map(({ id, name, kind }) => ({ id, name, kind }))} today={today} />
    </>
  );
}
