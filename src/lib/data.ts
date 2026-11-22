import { redirect } from "next/navigation";
import { knownCategories, todayInBogota, type Account, type Bill, type Skip, type Tx } from "./finance";
import type { Budget, Income } from "./budget";
import type { Goal, GoalDeposit } from "./goals";
import type { CardPurchase } from "./installments";

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
  const [session, inbox, withFavorite, usedInTxs, usedInBills] = await Promise.all([
    // Read from the cookie, no network: only to tell this person's things apart on the device (the
    // advisor's saved conversation), never to authorize anything.
    supabase.auth.getSession(),
    supabase.from("wallet_inbox").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id, name, kind, favorite").order("created_at"),
    // The categories the person has used, newest first, to offer next to the app's own.
    supabase.from("transactions").select("category").not("category", "is", null).order("created_at", { ascending: false }).limit(1000),
    supabase.from("bills").select("category").not("category", "is", null),
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

  const [bills, inbox, goals, deposits, budgets, skips, incomes, purchases] = await Promise.all([
    supabase.from("bills").select("*").order("due_day"),
    supabase.from("wallet_inbox").select("*").order("received_at", { ascending: false }),
    supabase.from("goals").select("*").order("target_date"),
    supabase.from("goal_deposits").select("*").order("occurred_on", { ascending: false }),
    supabase.from("budgets").select("*").order("category"),
    supabase.from("checklist_skips").select("*"),
    supabase.from("incomes").select("*").order("day"),
    supabase.from("card_purchases").select("*").order("first_due_month"),
  ]);
  // Card purchases in instalments arrived with migration 0009.
  const purchasesReady = !purchases.error;
  // Budgets, skips and incomes arrived with migration 0007.
  const planMissing = Boolean(budgets.error || skips.error || incomes.error);
  // Goals arrived with migration 0006: until it runs, the rest of the app keeps working.
  const goalsMissing = Boolean(goals.error || deposits.error);
  if (bills.error) throw new Error(`No se pudieron leer los recibos: ${bills.error.message}`);
  if (inbox.error) throw new Error(`No se pudo leer la bandeja de Wallet: ${inbox.error.message}`);

  return {
    supabase,
    user,
    accounts: accounts as Account[],
    txs,
    bills: bills.data as Bill[],
    inbox: inbox.data as InboxItem[],
    goals: goalsMissing ? [] : (goals.data as Goal[]),
    deposits: goalsMissing ? [] : (deposits.data as GoalDeposit[]),
    goalsReady: !goalsMissing,
    budgets: planMissing ? [] : (budgets.data as Budget[]),
    skips: planMissing ? [] : (skips.data as Skip[]),
    incomes: planMissing ? [] : (incomes.data as Income[]),
    planReady: !planMissing,
    purchases: purchasesReady ? (purchases.data as CardPurchase[]) : [],
    purchasesReady,
    today: todayInBogota(),
  };
}
