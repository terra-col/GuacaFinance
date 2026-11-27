"use client";

import { useState } from "react";
import { deleteBill, deleteIncome } from "@/app/actions";
import { incomeSchedule, type Income } from "@/lib/budget";
import { billSchedule, formatCOP, formatDate, monthName, type Bill } from "@/lib/finance";
import { cadenceText } from "@/lib/recurrence";
import { foreignOf } from "@/lib/finance";
import { formatForeign } from "@/lib/currency";
import { BillForm, IncomeForm, type Debt } from "./bill-forms";
import { SubmitButton } from "./submit-button";

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type ScheduledRow = { kind: "income"; income: Income; next: string | null } | { kind: "bill"; bill: Bill; next: string | null };

const onceText = (month: string) => `Una vez, en ${monthName(month)}${month.slice(0, 4) !== new Date().getFullYear().toString() ? ` ${month.slice(0, 4)}` : ""}`;

/** "Cada mes, día 30", "jun y dic, día 20", "una vez, 30 de diciembre". */
function cadence(row: ScheduledRow): string {
  if (row.kind === "bill" && row.bill.once_month) return onceText(row.bill.once_month);
  if (row.kind === "bill") {
    const text = cadenceText(billSchedule(row.bill));
    return text[0].toUpperCase() + text.slice(1);
  }
  const { income } = row;
  if (income.once_month) return onceText(income.once_month);
  if (income.months) {
    const list = income.months.map((m) => MONTH_SHORT[m - 1]);
    return `${list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list.at(-1)}` : list[0]}, día ${income.day}`;
  }
  const text = cadenceText(incomeSchedule(income));
  return text[0].toUpperCase() + text.slice(1);
}

function Row({ row, accounts, currentMonth, debts }: { row: ScheduledRow; accounts: { id: string; name: string }[]; currentMonth: string; debts: Debt[] }) {
  const [editing, setEditing] = useState(false);
  const income = row.kind === "income";
  const item = income ? row.income : row.bill;
  const label = income ? (row.income.once_month ? "Extra" : row.income.months ? "Algunos meses" : "Ingreso") : row.bill.once_month ? "Una vez" : "Pago fijo";
  // In another currency: its value there, and about how much in pesos today.
  const foreign = foreignOf(item);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`pill ${income ? "bg-savings/15" : "bg-debt/12"}`}>{label}</span>
        <span className="min-w-0 flex-1 font-semibold">{item.name}</span>
        <span className={`num font-semibold ${income ? "text-[var(--savings)]" : ""}`}>
          {foreign?.original ? `${income ? "+" : ""}${formatForeign(foreign.original, foreign.currency)}` : item.amount ? `${income ? "+" : ""}${formatCOP(item.amount)}` : foreign ? `Variable, en ${foreign.currency}` : "Valor variable"}
          {foreign?.original && item.amount ? <span className="block text-right text-xs font-normal text-ink-3">≈ {formatCOP(item.amount)} hoy</span> : null}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-ink-3">
          {cadence(row)}
          {row.next ? (
            <>
              {" · "}
              <span className="font-medium text-ink-2">Próximo: {formatDate(row.next).replace(/ \d{4}$/, "")}</span>
            </>
          ) : null}
        </span>
        {!editing && (
          <span className="flex items-center gap-4">
            <button type="button" className="font-medium text-brand" onClick={() => setEditing(true)}>
              Editar
            </button>
            <form action={income ? deleteIncome : deleteBill}>
              <input type="hidden" name="id" value={item.id} />
              <SubmitButton className="text-ink-3 hover:text-ink">Eliminar</SubmitButton>
            </form>
          </span>
        )}
      </div>
      {editing && (
        <div className="rise mt-3 rounded-2xl bg-brand/6 p-3">
          {income ? (
            <IncomeForm accounts={accounts} currentMonth={currentMonth} income={row.income} onDone={() => setEditing(false)} />
          ) : (
            <BillForm bill={row.bill} debts={debts} onDone={() => setEditing(false)} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Everything scheduled: incomes (monthly, some months like the prima, one-time extras) and fixed
 * bills, soonest first, each with when it comes next, even in a coming month, and edit or delete.
 */
export function ScheduledList({ rows, accounts, currentMonth, debts = [] }: { rows: ScheduledRow[]; accounts: { id: string; name: string }[]; currentMonth: string; debts?: Debt[] }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {rows.map((row) => (
        <Row key={`${row.kind}-${row.kind === "income" ? row.income.id : row.bill.id}`} row={row} accounts={accounts} currentMonth={currentMonth} debts={debts} />
      ))}
    </ul>
  );
}
