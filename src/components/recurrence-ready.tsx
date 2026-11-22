"use client";

import { createContext, useContext } from "react";

const RecurrenceReady = createContext(false);
const IncomeRecurrenceReady = createContext(false);

/** Whether periodicity exists in this database (migration 0017): only then is it offered. */
export function RecurrenceReadyProvider({ ready, incomes, children }: { ready: boolean; incomes: boolean; children: React.ReactNode }) {
  return (
    <RecurrenceReady.Provider value={ready}>
      <IncomeRecurrenceReady.Provider value={incomes}>{children}</IncomeRecurrenceReady.Provider>
    </RecurrenceReady.Provider>
  );
}

/** The same for incomes (migration 0019). */
export const useIncomeRecurrenceReady = () => useContext(IncomeRecurrenceReady);

export const useRecurrenceReady = () => useContext(RecurrenceReady);
