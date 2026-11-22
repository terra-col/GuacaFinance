"use client";

import { createContext, useContext } from "react";

const SharedReady = createContext(false);

/** Whether Compartidos exists in this database (migration 0016): only then is «Dividir» offered. */
export function SharedReadyProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return <SharedReady.Provider value={ready}>{children}</SharedReady.Provider>;
}

export const useSharedReady = () => useContext(SharedReady);
