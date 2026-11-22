"use client";

import { createContext, useContext } from "react";

const RecurrenceReady = createContext(false);

/** Whether periodicity exists in this database (migration 0017): only then is it offered. */
export function RecurrenceReadyProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return <RecurrenceReady.Provider value={ready}>{children}</RecurrenceReady.Provider>;
}

export const useRecurrenceReady = () => useContext(RecurrenceReady);
