"use client";

import { createContext, useContext, useState } from "react";
import { NO_RATES, type Rates } from "@/lib/currency";

const Ready = createContext(false);
const AccountsReady = createContext(false);

/** Whether other currencies exist in this database (migration 0026), and accounts in them (0030). */
export function CurrencyProvider({ ready, accounts = false, children }: { ready: boolean; accounts?: boolean; children: React.ReactNode }) {
  return (
    <Ready.Provider value={ready}>
      <AccountsReady.Provider value={ready && accounts}>{children}</AccountsReady.Provider>
    </Ready.Provider>
  );
}

export const useCurrenciesReady = () => useContext(Ready);

/** Whether an account can be in another currency (migration 0030). */
export const useAccountCurrenciesReady = () => useContext(AccountsReady);

// One request for the whole page, made the first time someone picks another currency.
let asked: Promise<Rates> | null = null;
const ask = () =>
  (asked ??= fetch("/api/tasas")
    .then((r) => (r.ok ? (r.json() as Promise<Rates>) : NO_RATES))
    .catch(() => {
      asked = null;
      return NO_RATES;
    }));

/** Today's rates once asked for (`want`), NO_RATES until then. */
export function useRates(want: boolean): Rates {
  const [rates, setRates] = useState<Rates>(NO_RATES);
  const [started, setStarted] = useState(false);
  if (want && !started) {
    setStarted(true);
    ask().then(setRates);
  }
  return rates;
}
