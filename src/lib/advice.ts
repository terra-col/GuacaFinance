// Payment recommendations: plain rules over the recorded balances and movements,
// recomputed on every page load. Each rule states the numbers it is based on.
import {
  ADJUSTMENT,
  addDays,
  balanceAt,
  billStatus,
  currentBills,
  daysBetween,
  findPlanned,
  formatCOP,
  isDebt,
  lastMonths,
  monthLabel,
  nextDueDate,
  relativeDay,
  spendingByCategory,
  totals,
  type Account,
  type Bill,
  type ChecklistItem,
  type Planned,
  type Skip,
  type Tx,
} from "./finance.ts";
import { isFrequent } from "./recurrence.ts";

export interface Advice {
  id: string;
  level: "urgent" | "warn" | "idea";
  title: string;
  detail: string;
}

const LEVEL_ORDER = { urgent: 0, warn: 1, idea: 2 };
const pct = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;

/** Monthly rate equivalent to an effective annual rate given in percent. */
export const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Months to clear `balance` paying `payment` each month; null when the payment never catches the interest. */
export function monthsToPayOff(balance: number, payment: number, annualPct: number): number | null {
  if (balance <= 0) return 0;
  const r = monthlyRate(annualPct);
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
}

function monthAfter(today: string, months: number): string {
  const total = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + months;
  return monthLabel(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
}

/**
 * `flows`: what counts as spending, when it is not simply the movements (shared expenses).
 * `house`: the house receipts of the person's own list, this month's and the next.
 */
export function advise(accounts: Account[], txs: Tx[], today: string, bills: Bill[] = [], flows: Tx[] = txs, skips: Skip[] = [], house: ChecklistItem[] = [], planned: Planned[] = []): Advice[] {
  const out: Advice[] = [];

  // 0. A fixed bill is overdue or due within three days and has not been paid this month.
  for (const bill of currentBills(bills)) {
    const status = billStatus(bill, txs, today, skips);
    // A daily one would be urgent every single day: only when one is late.
    if (status.paidThisMonth || status.days > 3 || (isFrequent(bill.every) && status.days >= 0)) continue;
    // The value set for that month (a statement) when there is one.
    const amount = (bill.every ?? "monthly") === "monthly" ? (findPlanned(planned, "bill", bill.id, status.date.slice(0, 7))?.amount ?? bill.amount) : bill.amount;
    out.push({
      id: `bill-${bill.id}`,
      level: "urgent",
      title: status.days < 0 ? `${bill.name} ${relativeDay(status.days)}` : `${bill.name} vence ${relativeDay(status.days)}`,
      detail: `${amount ? `Valor: ${formatCOP(amount)}. ` : ""}Márcalo en Pagos cuando lo pagues.`,
    });
  }
  const advised = new Set<string>();
  for (const item of house) {
    if (item.paid || item.skipped || !item.due || advised.has(item.id)) continue;
    advised.add(item.id);
    const days = daysBetween(today, item.due);
    if (days > 3 || (isFrequent(item.every) && days >= 0)) continue;
    out.push({
      id: `house-${item.id}`,
      level: "urgent",
      title: days < 0 ? `${item.name} ${relativeDay(days)}` : `${item.name} vence ${relativeDay(days)}`,
      detail: `Es de la casa y te toca a ti. ${item.expected ? `Valor: ${formatCOP(item.expected)}. ` : ""}Márcalo en Pagos cuando lo pagues.`,
    });
  }
  const debts = accounts.filter(isDebt).map((account) => ({ account, balance: balanceAt(account, txs) })).filter((d) => d.balance > 0);

  // 1. A due date is close and no payment has been recorded lately.
  for (const { account, balance } of debts) {
    if (!account.due_day) continue;
    const due = nextDueDate(account.due_day, today);
    const days = daysBetween(today, due);
    if (days > 5) continue;
    const since = addDays(today, -25);
    const paid = txs.some((t) => t.kind === "payment" && t.account_id === account.id && t.category !== ADJUSTMENT && t.occurred_on >= since);
    if (paid) continue;
    const statement = findPlanned(planned, "debt", account.id, due.slice(0, 7))?.amount;
    out.push({
      id: `due-${account.id}`,
      level: "urgent",
      title: `${account.name} vence ${days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`}`,
      detail: `No hay pagos registrados en los últimos 25 días. ${
        statement ? `Este mes: ${formatCOP(statement)}.` : account.monthly_payment ? `Cuota: ${formatCOP(account.monthly_payment)}.` : `Debes ${formatCOP(balance)}.`
      }`,
    });
  }

  // 2. A loan whose instalment does not cover its interest, or how long it has left.
  for (const { account, balance } of debts) {
    if (account.kind !== "loan" || !account.monthly_payment || account.annual_rate === null) continue;
    const months = monthsToPayOff(balance, account.monthly_payment, account.annual_rate);
    if (months === null) {
      out.push({
        id: `never-${account.id}`,
        level: "urgent",
        title: `La cuota de ${account.name} no alcanza a cubrir los intereses`,
        detail: `Con ${pct(account.annual_rate)} E.A. se generan cerca de ${formatCOP(
          Math.round(balance * monthlyRate(account.annual_rate)),
        )} al mes y la cuota es ${formatCOP(account.monthly_payment)}. Revisa los datos o habla con el banco.`,
      });
      continue;
    }
    const extra = Math.ceil((account.monthly_payment * 0.1) / 10_000) * 10_000;
    const faster = monthsToPayOff(balance, account.monthly_payment + extra, account.annual_rate)!;
    out.push({
      id: `payoff-${account.id}`,
      level: "idea",
      title: `A este ritmo terminas ${account.name} en ${months} ${months === 1 ? "mes" : "meses"} (${monthAfter(today, months)})`,
      detail:
        faster < months
          ? `Con ${formatCOP(extra)} más al mes serían ${faster} ${faster === 1 ? "mes" : "meses"}. Estimado con cuota fija y ${pct(account.annual_rate)} E.A.`
          : `Estimado con cuota fija y ${pct(account.annual_rate)} E.A.`,
    });
  }

  // 3. Savings do not cover the loan instalments falling due in the next 30 days.
  const horizon = addDays(today, 30);
  const instalments = debts
    .filter(({ account }) => account.kind === "loan" && account.monthly_payment && account.due_day && nextDueDate(account.due_day, today) <= horizon)
    .reduce((sum, { account, balance }) => sum + Math.min(account.monthly_payment!, balance), 0);
  const { savings } = totals(accounts, txs);
  if (instalments > 0 && savings < instalments) {
    out.push({
      id: "coverage",
      level: "warn",
      title: "Tus ahorros no cubren las cuotas de los próximos 30 días",
      detail: `Cuotas: ${formatCOP(instalments)}. Ahorros: ${formatCOP(savings)}. Faltan ${formatCOP(instalments - savings)}, sin contar los pagos de tarjetas.`,
    });
  }

  // 4. A card close to its limit.
  for (const { account, balance } of debts) {
    if (!account.credit_limit) continue;
    const usage = balance / account.credit_limit;
    if (usage < 0.7) continue;
    out.push({
      id: `usage-${account.id}`,
      level: "warn",
      title: `${account.name} está al ${Math.round(usage * 100)}% del cupo`,
      detail: `Quedan ${formatCOP(Math.max(0, account.credit_limit - balance))} disponibles. Para bajar al 30% del cupo habría que abonar ${formatCOP(
        Math.ceil(balance - account.credit_limit * 0.3),
      )}.`,
    });
  }

  // 5. A category running well above its usual level.
  const [m3, m2, m1, current] = lastMonths(today, 4);
  const usual = new Map<string, number>();
  for (const month of [m3, m2, m1]) {
    for (const c of spendingByCategory(flows, month)) usual.set(c.category, (usual.get(c.category) ?? 0) + c.amount / 3);
  }
  for (const c of spendingByCategory(flows, current)) {
    const average = usual.get(c.category) ?? 0;
    if (average <= 0 || c.amount < average * 1.3 || c.amount - average < 50_000) continue;
    out.push({
      id: `spike-${c.category}`,
      level: "warn",
      title: `${c.category} va ${Math.round((c.amount / average - 1) * 100)}% por encima de lo normal`,
      detail: `Este mes llevas ${formatCOP(c.amount)}; el promedio de los tres meses anteriores es ${formatCOP(Math.round(average))}.`,
    });
  }

  // 6. Where extra money does the most: the debt with the highest rate.
  const rated = debts.filter((d) => d.account.annual_rate !== null).sort((a, b) => b.account.annual_rate! - a.account.annual_rate!);
  if (rated.length > 0) {
    const [top, second] = rated;
    const interest = formatCOP(Math.round(top.balance * monthlyRate(top.account.annual_rate!)));
    out.push({
      id: "avalanche",
      level: "idea",
      title: second ? `Si te sobra plata, abónala primero a ${top.account.name}` : `${top.account.name} te cuesta cerca de ${interest} al mes en intereses`,
      detail: second
        ? `Es tu deuda más cara: ${pct(top.account.annual_rate!)} E.A., cerca de ${interest} al mes en intereses. Le sigue ${second.account.name} con ${pct(second.account.annual_rate!)}.`
        : `Estimado sobre el saldo de hoy con ${pct(top.account.annual_rate!)} E.A.`,
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
