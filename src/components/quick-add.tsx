"use client";

import { useCallback, useEffect, useState } from "react";
import type { Account } from "@/lib/finance";
import { Sheet } from "./modal";
import { TxForm } from "./tx-form";

const OPEN_EVENT = "quick-add";

/** Opens the «Nuevo movimiento» sheet from anywhere. */
export function openQuickAdd() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The «Registrar» sheet, available on every screen: a floating button on
 * phones, a header button on wide screens, and any link to #nuevo.
 */
export function QuickAdd({ accounts, today }: { accounts: Pick<Account, "id" | "name" | "kind">[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const show = useCallback(() => {
    setRound((r) => r + 1);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    // Old links and the home-screen shortcut point at #nuevo.
    const fromHash = () => {
      if (window.location.hash !== "#nuevo") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      show();
    };
    const id = requestAnimationFrame(fromHash);
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("hashchange", fromHash);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        data-tour="register"
        className="fab register fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded-full pl-4 pr-5 text-sm font-semibold lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Registrar movimiento
      </button>

      <Sheet open={open} onClose={close} title="Nuevo movimiento">
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-2">Primero agrega una cuenta en Inicio: el movimiento necesita de dónde sale o a dónde llega la plata.</p>
        ) : (
          <TxForm
            key={round}
            accounts={accounts}
            today={today}
            onDone={(message) => {
              setOpen(false);
              setToast(message);
            }}
          />
        )}
      </Sheet>

      {toast && (
        <p role="status" className="card rise fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap px-5 py-3 text-sm font-semibold sm:p-4 lg:bottom-8">
          ✓ {toast}
        </p>
      )}
    </>
  );
}

/** The same action in the header on wide screens. */
export function QuickAddButton() {
  return (
    <button type="button" onClick={openQuickAdd} data-tour="register" className="btn register hidden h-10 gap-1.5 rounded-xl px-4 text-sm lg:inline-flex">
      <span aria-hidden="true" className="text-lg leading-none">
        +
      </span>
      Registrar movimiento
    </button>
  );
}

/** A visible «Nuevo movimiento» on the Movimientos screen, for every screen size. */
export function NewMovementButton() {
  return (
    <button type="button" onClick={openQuickAdd} className="btn register h-11 gap-1.5 rounded-2xl px-4 text-sm">
      <span aria-hidden="true" className="text-lg leading-none">
        +
      </span>
      Nuevo
    </button>
  );
}
