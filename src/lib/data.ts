import { redirect } from "next/navigation";
import { houseChecklist } from "./house";
import { loadHouse } from "./house-data";
import { knownCategories, shiftMonth, todayInBogota, type Account, type Bill, type Skip, type Tx } from "./finance";
import type { Budget, Income } from "./budget";
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

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** What every screen's frame needs: accounts for the quick «new movement» sheet and the Wallet inbox count. */
export async function loadShell() {
  const supabase = await createClient();
  const [session, inbox, withFavorite, usedInTxs, usedInBills, groups, dated, datedIncomes, periods, waiting] = await Promise.all([
    // Read from the cookie, no network: only to tell this person's things apart on the device (the
    // advisor's saved conversation), never to authorize anything.
    supabase.auth.getSession(),
    supabase.from("wallet_inbox").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id, name, kind, favorite").order("created_at"),
    // The categories the person has used, newest first, to offer next to the app's own.
    supabase.from("transactions").select("category").not("category", "is", null).order("created_at", { ascending: false }).limit(1000),
    supabase.from("bills").select("category").not("category", "is", null),
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
  ]);
  // Until migration 0012 runs there is no favourite column: ask again without it.
  const accounts = withFavorite.error ? await supabase.from("accounts").select("id, name, kind").order("created_at") : withFavorite;
  return {
    pending: inbox.count ?? 0,
    accounts: (accounts.data ?? []) as Pick<Account, "id" | "name" | "kind" | "favorite">[],
    userId: session.data.session?.user.id ?? null,
    // The welcome tour starts by itself until it is seen once (see markTourSeen).
    tourSeen: Boolean(session.data.session?.user.user_metadata?.tour_seen),
    categories: knownCategories([...(usedInTxs.data ?? []), ...(usedInBills.data ?? [])].map((r) => r.category as string)),
    sharedReady: !groups.error,
    socialReady: !waiting.error,
    noticeCount: Number(waiting.data) || 0,
    recurrenceReady: !dated.error,
    incomeRecurrenceReady: !datedIncomes.error,
    customPeriodsReady: !periods.error,
    today: todayInBogota(),
  };
}

/** Everything the signed-in user has recorded. Row Level Security scopes both queries to them. */
export async function loadData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts, error } = await supabase.from("accounts").select("*").order("created_at");
  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);

  // Balances are sums over every movement, so a silently truncated page would
  // show wrong numbers: keep reading until a short page comes back.
  const txs: Tx[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (txError) throw new Error(`No se pudieron leer los movimientos: ${txError.message}`);
    txs.push(...(data as Tx[]));
    if (data.length < PAGE) break;
  }

  const [bills, inbox, goals, deposits, budgets, skips, incomes, purchases, sharing, house, dateSkips] = await Promise.all([
    supabase.from("bills").select("*").order("due_day"),
    supabase.from("wallet_inbox").select("*").order("received_at", { ascending: false }),
    supabase.from("goals").select("*").order("target_date"),
    // Daily savings pass 1000 rows: every page.
    allPages<GoalDeposit>((from, to) => supabase.from("goal_deposits").select("*").order("occurred_on", { ascending: false }).order("id").range(from, to)),
    supabase.from("budgets").select("*").order("category"),
    supabase.from("checklist_skips").select("*"),
    supabase.from("incomes").select("*").order("day"),
    supabase.from("card_purchases").select("*").order("first_due_month"),
    loadShared(supabase, user.id),
    loadHouse(supabase),
    allPages<Skip>((from, to) => supabase.from("date_skips").select("*").order("for_date").order("id").range(from, to)),
  ]);
  // Card purchases in instalments arrived with migration 0009.
  const purchasesReady = !purchases.error;
  // Budgets, skips and incomes arrived with migration 0007.
  const planMissing = Boolean(budgets.error || skips.error || incomes.error);
  // Goals arrived with migration 0006: until it runs, the rest of the app keeps working.
  const goalsMissing = Boolean(goals.error || deposits.error);
  if (bills.error) throw new Error(`No se pudieron leer los recibos: ${bills.error.message}`);
  if (inbox.error) throw new Error(`No se pudo leer la bandeja de Wallet: ${inbox.error.message}`);

  const today = todayInBogota();
  return {
    supabase,
    user,
    accounts: accounts as Account[],
    txs,
    // Balances read `txs`; totals of what came in or was spent read `flows` (see flowTxs).
    flows: flowTxs(txs, sharing.shared, user.id),
    shared: sharing.shared,
    sharedReady: sharing.ready,
    position: myPosition(sharing.shared, user.id),
    bills: bills.data as Bill[],
    inbox: inbox.data as InboxItem[],
    goals: goalsMissing ? [] : (goals.data as Goal[]),
    deposits: goalsMissing ? [] : deposits.rows,
    goalsReady: !goalsMissing,
    budgets: planMissing ? [] : (budgets.data as Budget[]),
    // By month (monthly) and by date (the rest; none before migration 0017).
    skips: [...(planMissing ? [] : (skips.data as Skip[])), ...(dateSkips.error ? [] : dateSkips.rows.map((s) => ({ ...s, month: s.for_date!.slice(0, 7) })))],
    incomes: planMissing ? [] : (incomes.data as Income[]),
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
