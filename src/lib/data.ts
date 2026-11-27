import { redirect } from "next/navigation";
import { houseChecklist } from "./house";
import { loadHouse } from "./house-data";
import { accountForeign, knownCategories, shiftMonth, todayInBogota, type Account, type Bill, type Planned, type Skip, type Tx } from "./finance";
import type { Budget, Income } from "./budget";
import { NO_RATES, atTodayRate, needsRates } from "./currency";
import { todayRates } from "./rates";
import type { Goal, GoalDeposit } from "./goals";
import type { CardPurchase } from "./installments";
import { allPages } from "./paging";
import { flowTxs, myPosition } from "./shared";
import { loadShared } from "./shared-data";

export interface InboxItem {
  id: string;
  card: string | null;
  merchant: string | null;
  amount: number | null;
  occurred_on: string;
}
import { createClient } from "./supabase/server";

/** What every screen's frame needs: accounts for the quick «new movement» sheet and the Wallet inbox count. */
export async function loadShell() {
  const supabase = await createClient();
  const [session, inbox, withFavorite, usedInTxs, usedInBills, budgeted, groups, dated, datedIncomes, periods, waiting, currencies, accountCurrencies, transfers] = await Promise.all([
    // Read from the cookie, no network: only to tell this person's things apart on the device (the
    // advisor's saved conversation), never to authorize anything.
    supabase.auth.getSession(),
    supabase.from("wallet_inbox").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id, name, kind, favorite").order("created_at"),
    // The categories the person has used, newest first, to offer next to the app's own.
    supabase.from("transactions").select("category").not("category", "is", null).order("created_at", { ascending: false }).limit(1000),
    supabase.from("bills").select("category").not("category", "is", null),
    // And the ones with a budget, so a new one written there is offered when recording a movement.
    supabase.from("budgets").select("category"),
    // Only whether Compartidos exists yet (migration 0016).
    supabase.from("shared_groups").select("id").limit(1),
    // And whether periodicity does (migration 0017).
    supabase.from("date_skips").select("id").limit(1),
    // And that of incomes (migration 0019).
    supabase.from("incomes").select("every").limit(1),
    // And periods of any length (migration 0022).
    supabase.rpc("custom_periods_ready"),
    // The bell's number, which is also whether it exists (migration 0023).
    supabase.rpc("shared_pending_count"),
    // Other currencies (migration 0026).
    supabase.rpc("currencies_ready"),
    // Each account's currency (migration 0030), so the quick sheet takes an account in dollars in
    // dollars. Its own read: before the migration it fails alone and everything stays in pesos.
    supabase.from("accounts").select("id, currency"),
    // Moving money between one's own accounts (migration 0031).
    supabase.rpc("transfers_ready"),
  ]);
  // Until migration 0012 runs there is no favourite column: ask again without it.
  const accounts = withFavorite.error ? await supabase.from("accounts").select("id, name, kind").order("created_at") : withFavorite;
  const currencyOf = new Map((accountCurrencies.data ?? []).map((r) => [r.id as string, r.currency as string]));
  return {
    pending: inbox.count ?? 0,
    accounts: ((accounts.data ?? []) as Pick<Account, "id" | "name" | "kind" | "favorite">[]).map((a) => ({ ...a, currency: currencyOf.get(a.id) ?? "COP" })),
    accountCurrenciesReady: !accountCurrencies.error,
    transfersReady: !transfers.error,
    userId: session.data.session?.user.id ?? null,
    // The welcome tour starts by itself until it is seen once (see markTourSeen).
    tourSeen: Boolean(session.data.session?.user.user_metadata?.tour_seen),
    categories: knownCategories([...(usedInTxs.data ?? []), ...(usedInBills.data ?? []), ...(budgeted.data ?? [])].map((r) => r.category as string)),
    sharedReady: !groups.error,
    socialReady: !waiting.error,
    noticeCount: Number(waiting.data) || 0,
    recurrenceReady: !dated.error,
    incomeRecurrenceReady: !datedIncomes.error,
    customPeriodsReady: !periods.error,
    currenciesReady: !currencies.error,
    today: todayInBogota(),
  };
}

/** Everything the signed-in user has recorded. Row Level Security scopes every query to them. */
export async function loadData() {
  const supabase = await createClient();
  // All at once: Row Level Security already limits each query to the signed-in person, so asking
  // who they are does not have to come first (it names them and sends anyone else to /login).
  // One round trip to Supabase instead of four in a row, on every screen.
  const who = supabase.auth.getUser();
  const reads = Promise.all([
    supabase.from("accounts").select("*").order("created_at"),
    // Balances are sums over every movement, so a silently truncated page would show wrong numbers.
    allPages<Tx>((from, to) => supabase.from("transactions").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to)),
    supabase.from("bills").select("*").order("due_day"),
    supabase.from("wallet_inbox").select("*").order("received_at", { ascending: false }),
    supabase.from("goals").select("*").order("target_date"),
    // Daily savings pass 1000 rows: every page.
    allPages<GoalDeposit>((from, to) => supabase.from("goal_deposits").select("*").order("occurred_on", { ascending: false }).order("id").range(from, to)),
    supabase.from("budgets").select("*").order("category"),
    supabase.from("checklist_skips").select("*"),
    supabase.from("incomes").select("*").order("day"),
    supabase.from("card_purchases").select("*").order("first_due_month"),
    loadShared(supabase, who.then(({ data }) => data.user?.id ?? "")),
    loadHouse(supabase),
    allPages<Skip>((from, to) => supabase.from("date_skips").select("*").order("for_date").order("id").range(from, to)),
    // A month's value (migration 0027): a few a month at most, so all of them.
    supabase.from("planned_amounts").select("id, item_type, item_id, month, amount").order("month"),
  ]);
  // Read below; meanwhile an early failure is not an unhandled one (and without a session it does not matter).
  reads.catch(() => {});
  const {
    data: { user },
  } = await who;
  if (!user) redirect("/login");
  const [accountsRead, txsRead, bills, inbox, goals, deposits, budgets, skips, incomes, purchases, sharing, house, dateSkips, planned] = await reads;
  if (accountsRead.error) throw new Error(`No se pudieron leer las cuentas: ${accountsRead.error.message}`);
  if (txsRead.error) throw new Error(`No se pudieron leer los movimientos: ${txsRead.error.message}`);
  const accounts = accountsRead.data;
  const txs = txsRead.rows;

  // Card purchases in instalments arrived with migration 0009.
  const purchasesReady = !purchases.error;
  // Budgets, skips and incomes arrived with migration 0007.
  const planMissing = Boolean(budgets.error || skips.error || incomes.error);
  // Goals arrived with migration 0006: until it runs, the rest of the app keeps working.
  const goalsMissing = Boolean(goals.error || deposits.error);
  if (bills.error) throw new Error(`No se pudieron leer los recibos: ${bills.error.message}`);
  if (inbox.error) throw new Error(`No se pudo leer la bandeja de Wallet: ${inbox.error.message}`);

  const today = todayInBogota();
  // Bills and incomes in another currency count in pesos at today's rate (kept six hours in memory).
  const ownIncomes = planMissing ? [] : (incomes.data as Income[]);
  // Accounts in another currency are valued at it too.
  const foreignAccounts = (accounts as Account[]).some((a) => accountForeign(a));
  const rates = foreignAccounts || needsRates([...(bills.data as Bill[]), ...ownIncomes]) ? await todayRates().catch(() => NO_RATES) : NO_RATES;
  return {
    supabase,
    user,
    accounts: (accounts as Account[]).map((a) => {
      const code = accountForeign(a);
      return code && rates[code] ? { ...a, fx_rate: rates[code] } : a;
    }),
    // Today's rates (or none): the balance's detail says which one it used and from when.
    rates,
    txs,
    // Balances read `txs`; totals of what came in or was spent read `flows` (see flowTxs).
    flows: flowTxs(txs, sharing.shared, user.id),
    shared: sharing.shared,
    sharedReady: sharing.ready,
    position: myPosition(sharing.shared, user.id),
    bills: atTodayRate(bills.data as Bill[], rates),
    inbox: inbox.data as InboxItem[],
    goals: goalsMissing ? [] : (goals.data as Goal[]),
    deposits: goalsMissing ? [] : deposits.rows,
    goalsReady: !goalsMissing,
    budgets: planMissing ? [] : (budgets.data as Budget[]),
    // By month (monthly) and by date (the rest; none before migration 0017).
    skips: [...(planMissing ? [] : (skips.data as Skip[])), ...(dateSkips.error ? [] : dateSkips.rows.map((s) => ({ ...s, month: s.for_date!.slice(0, 7) })))],
    incomes: atTodayRate(ownIncomes, rates),
    planned: planned.error ? [] : (planned.data as Planned[]),
    plannedReady: !planned.error,
    planReady: !planMissing,
    purchases: purchasesReady ? (purchases.data as CardPurchase[]) : [],
    purchasesReady,
    house,
    // What of the houses is in the person's own list: this month's and the next.
    houseNow: houseChecklist(house, sharing.shared, user.id, today.slice(0, 7), today),
    houseNext: houseChecklist(house, sharing.shared, user.id, shiftMonth(today.slice(0, 7), 1), today),
    today,
  };
}
