"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const CloseContext = createContext<() => void>(() => {});

/** Lets content inside a Modal close it (for example after saving). */
export const useCloseModal = () => useContext(CloseContext);

type Back = () => void;
const BackContext = createContext<((back: Back) => () => void) | null>(null);

/**
 * While it is on screen, the ✕, Esc and a tap outside do this instead of closing: for a second
 * view inside a modal, where closing would lose everything typed in the first.
 */
export function useModalBack(back: Back) {
  const register = useContext(BackContext);
  useEffect(() => register?.(back), [register, back]);
}

/** Closing as the person asks for it: back first, when there is a view to go back from. */
function useDismiss(dialog: React.RefObject<HTMLDialogElement | null>) {
  const back = useRef<Back | null>(null);
  useEffect(() => {
    const el = dialog.current;
    // Esc, and Android's back.
    const onCancel = (e: Event) => {
      if (e.target !== el || !back.current) return;
      e.preventDefault();
      back.current();
    };
    el?.addEventListener("cancel", onCancel);
    return () => el?.removeEventListener("cancel", onCancel);
  }, [dialog]);
  const dismiss = () => (back.current ? back.current() : dialog.current?.close());
  const register = useCallback((fn: Back) => {
    back.current = fn;
    return () => {
      if (back.current === fn) back.current = null;
    };
  }, []);
  return { register, dismiss };
}

/**
 * A button that opens a modal: centred window on wide screens, bottom sheet on
 * phones. Its content is mounted fresh each time it opens.
 */
export function Modal({
  label,
  title,
  buttonClass = "btn h-12 gap-2 rounded-2xl px-5 text-base",
  children,
}: {
  label: React.ReactNode;
  title: string;
  buttonClass?: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => dialog.current?.close(), []);
  const { register, dismiss } = useDismiss(dialog);

  useEffect(() => {
    const el = dialog.current;
    const onClose = () => setIsOpen(false);
    el?.addEventListener("close", onClose);
    return () => el?.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          setRound((r) => r + 1);
          setIsOpen(true);
          dialog.current?.showModal();
        }}
      >
        {label}
      </button>
      <dialog ref={dialog} aria-label={title} className="sheet" onClick={(e) => e.target === e.currentTarget && dismiss()}>
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-2xl">{title}</h2>
            <button type="button" onClick={dismiss} className="btn-quiet size-10 p-0 text-lg" aria-label="Cerrar">
              ✕
            </button>
          </div>
          <BackContext.Provider value={register}>
            <CloseContext.Provider value={close}>{isOpen && <div key={round}>{children}</div>}</CloseContext.Provider>
          </BackContext.Provider>
        </div>
      </dialog>
    </>
  );
}

/** The same sheet, opened by its parent: for actions started from a list row (edit, details). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => dialog.current?.close(), []);
  const { register, dismiss } = useDismiss(dialog);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialog.current;
    el?.addEventListener("close", onClose);
    return () => el?.removeEventListener("close", onClose);
  }, [onClose]);

  return (
    <dialog ref={dialog} aria-label={title} className="sheet" onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" onClick={dismiss} className="btn-quiet size-10 p-0 text-lg" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <BackContext.Provider value={register}>
          <CloseContext.Provider value={close}>{open && children}</CloseContext.Provider>
        </BackContext.Provider>
      </div>
    </dialog>
  );
}
