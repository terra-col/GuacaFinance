"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdvisorChat } from "./advisor-chat";
import { AdvisorMark } from "./advisor-mark";
import { Icon } from "./icons";

/**
 * Computers: the advisor as a floating chat. The button bottom right unfolds a panel over the
 * screen instead of leaving it, and the conversation stays while you move between sections, so
 * you can look at your numbers while you ask. Esc or the button closes it. Phones use the page.
 */
export function AdvisorDock({ provider }: { provider: "gemini" | "claude" | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Mounted on first open, then kept (only hidden) so the conversation survives closing it.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Its own screen already is the advisor.
  if (pathname.startsWith("/asesor")) return null;

  function toggle() {
    setStarted(true);
    setOpen(!open);
  }

  return (
    <div className="hidden lg:block">
      {started && (
        <div
          role="dialog"
          aria-label="Asesor IA"
          aria-hidden={!open}
          inert={!open}
          className={`advisor-panel fixed bottom-24 right-6 z-40 flex h-[min(40rem,calc(100dvh-8.5rem))] w-[26rem] flex-col overflow-hidden rounded-3xl ${
            open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="fab flex size-10 shrink-0 items-center justify-center rounded-2xl" aria-hidden="true">
              <AdvisorMark className="size-6" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-semibold">Asesor IA</p>
              <p className="truncate text-xs text-ink-3">Lee tus cuentas, deudas y metas</p>
            </div>
            <Link
              href="/asesor"
              onClick={() => setOpen(false)}
              className="liquid flex size-9 shrink-0 items-center justify-center rounded-xl"
              aria-label="Abrir en pantalla completa"
              title="Abrir en pantalla completa"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
              </svg>
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="liquid flex size-9 shrink-0 items-center justify-center rounded-xl" aria-label="Cerrar">
              <Icon name="close" className="size-4" />
            </button>
          </div>
          {provider ? (
            <AdvisorChat panel autoFocus={open} />
          ) : (
            <div className="flex flex-1 flex-col items-start justify-center gap-3 p-5 text-sm text-ink-2">
              <p className="font-semibold text-ink">El asesor con IA aún no está encendido.</p>
              <p>Falta configurar la clave de Gemini o de Claude en el servidor.</p>
              <Link href="/asesor" onClick={() => setOpen(false)} className="btn">
                Ver cómo encenderlo
              </Link>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Cerrar el asesor" : "Abrir el asesor IA"}
        title={open ? "Cerrar" : "Pregúntale a tu asesor con IA: responde a partir de tus cuentas, deudas y metas"}
        className={`fab advisor-fab fixed bottom-6 right-6 z-40 flex h-[3.75rem] items-center rounded-full ${open ? "w-[3.75rem] justify-center" : "gap-3 pl-4 pr-6"}`}
      >
        {open ? (
          <Icon name="close" className="size-6" strokeWidth={2.2} />
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-white/18 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
              <AdvisorMark className="size-6" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[15px] font-semibold">Asesor IA</span>
              <span className="text-xs font-medium text-white/80">según tus cuentas</span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}
