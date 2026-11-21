"use client";

import { useState } from "react";
import { deleteBill, deleteIncome } from "@/app/actions";
import type { Income } from "@/lib/budget";
import { formatCOP, formatDate, monthName, type Bill } from "@/lib/finance";
import { BillForm, IncomeForm } from "./bill-forms";
import { SubmitButton } from "./submit-button";

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type ScheduledRow = { kind: "income"; income: Income; next: string | null } | { kind: "bill"; bill: Bill; next: string | null };

/** "Cada mes, día 30", "jun y dic, día 20", "una vez, 30 de diciembre". */
function cadence(row: ScheduledRow): string {
  if (row.kind === "bill") return `Cada mes, día ${row.bill.due_day}`;
  const { income } = row;
  if (income.once_month) return `Una vez, en ${monthName(income.once_month)}${income.once_month.slice(0, 4) !== new Date().getFullYear().toString() ? ` ${income.once_month.slice(0, 4)}` : ""}`;
  if (income.months) {
    const list = income.months.map((m) => MONTH_SHORT[m - 1]);
    return `${list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list.at(-1)}` : list[0]}, día ${income.day}`;
  }
  return `Cada mes, día ${income.day}`;
}

function Row({ row, accounts, currentMonth }: { row: ScheduledRow; accounts: { id: string; name: string }[]; currentMonth: string }) {
  const [editing, setEditing] = useState(false);
  const income = row.kind === "income";
  const item = income ? row.income : row.bill;
  const label = income ? (row.income.once_month ? "Extra" : row.income.months ? "Algunos meses" : "Ingreso") : "Pago fijo";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`pill ${income ? "bg-savings/15" : "bg-debt/12"}`}>{label}</span>
        <span className="min-w-0 flex-1 font-semibold">{item.name}</span>
        <span className={`num font-semibold ${income ? "text-[var(--savings)]" : ""}`}>
          {item.amount ? `${income ? "+" : ""}${formatCOP(item.amount)}` : "Valor variable"}
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
            <BillForm bill={row.bill} onDone={() => setEditing(false)} />
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
export function ScheduledList({ rows, accounts, currentMonth }: { rows: ScheduledRow[]; accounts: { id: string; name: string }[]; currentMonth: string }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {rows.map((row) => (
        <Row key={`${row.kind}-${row.kind === "income" ? row.income.id : row.bill.id}`} row={row} accounts={accounts} currentMonth={currentMonth} />
      ))}
    </ul>
  );
}
