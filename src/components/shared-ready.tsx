"use client";

import { createContext, useContext } from "react";

const SharedReady = createContext(false);
const SocialReady = createContext(false);

/** Whether Compartidos exists in this database (migration 0016): only then is «Dividir» offered. */
export function SharedReadyProvider({ ready, social, children }: { ready: boolean; social: boolean; children: React.ReactNode }) {
  return (
    <SharedReady.Provider value={ready}>
      <SocialReady.Provider value={social}>{children}</SocialReady.Provider>
    </SharedReady.Provider>
  );
}

/** Invitations by phone, accounts between two and notices (migration 0023). */
export const useSocialReady = () => useContext(SocialReady);

export const useSharedReady = () => useContext(SharedReady);
