"use client";

import { createContext, useContext } from "react";

const RecurrenceReady = createContext(false);
const IncomeRecurrenceReady = createContext(false);
const CustomPeriodsReady = createContext(false);

/** Whether periodicity exists in this database (migration 0017): only then is it offered. */
export function RecurrenceReadyProvider({ ready, incomes, custom, children }: { ready: boolean; incomes: boolean; custom: boolean; children: React.ReactNode }) {
  return (
    <RecurrenceReady.Provider value={ready}>
      <IncomeRecurrenceReady.Provider value={incomes}>
        <CustomPeriodsReady.Provider value={custom}>{children}</CustomPeriodsReady.Provider>
      </IncomeRecurrenceReady.Provider>
    </RecurrenceReady.Provider>
  );
}

/** The same for incomes (migration 0019). */
export const useIncomeRecurrenceReady = () => useContext(IncomeRecurrenceReady);

/** Any unit and quantity (migration 0022). */
export const useCustomPeriodsReady = () => useContext(CustomPeriodsReady);

export const useRecurrenceReady = () => useContext(RecurrenceReady);
