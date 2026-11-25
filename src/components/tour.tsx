"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "@/app/actions";
import { TRAY_EVENT } from "./header-tray";

/**
 * The welcome tour: the screen dims and a spotlight goes over the real interface (the balance,
 * the accounts, the tabs, the bell, the advisor, the eye, Ajustes), with a card that says what each one is
 * for. It starts by itself the first time someone enters, on Inicio, and the «?» next to the
 * greeting (or Ajustes) plays it again. Nothing is done for the person: it only points.
 */

interface Step {
  /** data-tour of the element to light up; none for a card in the middle of the screen. */
  target?: string;
  title: string;
  text: string;
  /** Inside the header's folded options: the tour unfolds them for this step. */
  tray?: boolean;
}

const STEPS: Step[] = [
  {
    title: "Te damos la bienvenida a Guaca",
    text: "En un minuto te mostramos dónde está cada cosa. Puedes saltar el recorrido y verlo otra vez cuando quieras con el botón «?» de Inicio.",
  },
  {
    target: "balance",
    title: "Tu balance de hoy",
    text: "Lo que tienes menos lo que debes. La barra muestra cuánto de tu plata es tuya y cuánto es deuda; la línea del centro es el punto de equilibrio.",
  },
  {
    target: "accounts",
    title: "Tus cuentas y efectivo",
    text: "Agrega tu banco, Nequi o el efectivo con el saldo de hoy. La estrella marca la cuenta favorita: de ahí salen los pagos por defecto.",
  },
  {
    target: "register",
    title: "Registrar un movimiento",
    text: "Un gasto, un ingreso, una transferencia o un pago a una tarjeta, en segundos. En el celular es el «+» del centro de la barra. Cada movimiento mueve tus saldos.",
  },
  {
    target: "tab/movimientos",
    title: "Movimientos",
    text: "Arriba eliges Personales o Compartidos. En Personales está todo lo que entra y sale, día por día: busca, filtra y toca «Editar» o «Borrar» en cualquiera. En Compartidos, lo que divides con otras personas y quién le debe a quién.",
  },
  {
    target: "tab/pagos",
    title: "Pagos del mes",
    text: "Arriendo, servicios, cuotas e ingresos, cada uno cada cuánto toca. Márcalos al pagarlos, míralos en calendario y adelanta los del mes siguiente. Los recibos de una casa compartida también llegan aquí.",
  },
  {
    target: "tab/deudas",
    title: "Créditos",
    text: "Tus tarjetas y préstamos: cuánto debes, el cupo, las cuotas, la tasa y las compras a cuotas.",
  },
  {
    target: "tab/metas",
    title: "Metas",
    text: "Ahorra para algo con fecha. Con un plan mensual, la cuota aparece en Pagos para que no se te pase.",
  },
  {
    // Phones: Créditos and Metas share one tab.
    target: "tab/creditos-metas",
    title: "Créditos y metas",
    text: "Tus tarjetas y préstamos, y lo que ahorras para algo con fecha. Arriba eliges si ver Créditos o Metas.",
  },
  {
    target: "menu",
    title: "Tus opciones",
    text: "Este botón despliega el asesor, los avisos, el modo privado, el tema y Más ajustes. Un punto rojo encima quiere decir que tienes avisos.",
  },
  {
    target: "advisor",
    tray: true,
    title: "Asesor con IA",
    text: "Pregúntale sobre tu plata: si te alcanza el mes, qué pagar primero o cómo ahorrar. Responde con tus cuentas, pagos y metas.",
  },
  {
    target: "bell",
    tray: true,
    title: "Avisos",
    text: "Cuando alguien te invita a un grupo, anota un gasto contigo o te paga, te llega aquí. El número dice cuántos esperan tu respuesta.",
  },
  {
    target: "privacy",
    tray: true,
    title: "Modo privado",
    text: "Oculta todos los montos con un toque, por si alguien está viendo tu pantalla.",
  },
  {
    target: "settings",
    tray: true,
    title: "Más ajustes",
    text: "Tu perfil y tu celular (para que te lleguen las invitaciones), el tema claro u oscuro, el tamaño del texto, Apple Wallet e invitar a alguien a Guaca.",
  },
  {
    target: "help",
    title: "¡Listo!",
    text: "Este botón repite el recorrido cuando quieras. Ahora sí, a poner en orden esas finanzas.",
  },
];

const START = "guaca:tour";
const PAD = 8;
const seenKey = (userId: string | null) => `guaca-recorrido-${userId ?? "anon"}`;

/** The element a step points at, if it is on screen (phones and computers each have their own). */
function find(target: string | undefined): HTMLElement | null {
  if (!target) return null;
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Plays the tour from anywhere (Ajustes): it goes to Inicio first. */
export function startTour() {
  window.dispatchEvent(new Event(START));
}

/** «Ver el recorrido» in Ajustes. */
export function TourLink() {
  return (
    <button type="button" onClick={startTour} className="text-sm font-medium text-brand">
      Ver el recorrido por Guaca
    </button>
  );
}

/** The «?» next to the greeting. */
export function TourButton() {
  return (
    <button
      type="button"
      onClick={startTour}
      data-tour="help"
      className="liquid flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-brand"
      aria-label="Ver el recorrido por Guaca"
      title="Ver el recorrido por Guaca"
    >
      ?
    </button>
  );
}

/** `home`: the screen the tour runs on (Inicio). */
export function Tour({ autoStart, userId, home = "/" }: { autoStart: boolean; userId: string | null; home?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [wanted, setWanted] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);

  // Only the steps whose element is on this screen (a new person has no balance yet).
  const begin = useCallback(() => {
    setSteps(STEPS.filter((s) => !s.target || find(s.target)));
    setIndex(0);
  }, []);

  // The first time: once Inicio has drawn its content (it streams in after a skeleton).
  useEffect(() => {
    if (!autoStart || pathname !== home) return;
    try {
      if (localStorage.getItem(seenKey(userId))) return;
    } catch {}
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (find("accounts") || tries > 40) {
        clearInterval(timer);
        if (!document.querySelector("dialog[open]")) begin();
      }
    }, 150);
    return () => clearInterval(timer);
  }, [autoStart, pathname, userId, begin, home]);

  // The «?» or Ajustes: to Inicio first, then the tour.
  useEffect(() => {
    const onStart = () => {
      if (window.location.pathname === home) begin();
      else {
        setWanted(true);
        router.push(home);
      }
    };
    window.addEventListener(START, onStart);
    return () => window.removeEventListener(START, onStart);
  }, [begin, router, home]);
  useEffect(() => {
    if (!wanted || pathname !== home) return;
    const timer = setInterval(() => {
      if (find("accounts")) {
        clearInterval(timer);
        setWanted(false);
        begin();
      }
    }, 150);
    return () => clearInterval(timer);
  }, [wanted, pathname, begin, home]);

  const step = steps?.[index];

  // The header's options unfold for the steps that point inside them, and fold again after.
  const tray = Boolean(step?.tray);
  useEffect(() => {
    if (!steps) return;
    window.dispatchEvent(new CustomEvent(TRAY_EVENT, { detail: tray }));
  }, [tray, steps]);

  // Brings the element into view, then follows it every frame (scrolling, resizing, the page moving).
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step.target);
    if (el && getComputedStyle(el).position !== "fixed") el.scrollIntoView({ block: "center", behavior: "smooth" });
    let frame = 0;
    const follow = () => {
      const now = find(step.target)?.getBoundingClientRect() ?? null;
      setRect((old) => (old && now && old.x === now.x && old.y === now.y && old.width === now.width && old.height === now.height ? old : now));
      frame = requestAnimationFrame(follow);
    };
    follow();
    primary.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const finish = useCallback(() => {
    window.dispatchEvent(new CustomEvent(TRAY_EVENT, { detail: false }));
    setSteps(null);
    setRect(null);
    try {
      localStorage.setItem(seenKey(userId), "1");
    } catch {}
    // Remembered with the profile too, so it does not start again on another device.
    if (autoStart) markTourSeen().catch(() => {});
  }, [autoStart, userId]);

  const last = steps ? index === steps.length - 1 : false;
  const next = useCallback(() => (last ? finish() : setIndex((i) => i + 1)), [last, finish]);
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!step) return;
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [step, next, finish]);

  if (!steps || !step) return null;

  // The card: under the element when it is in the top half of the screen, over it otherwise.
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(360, vw - 32);
  let place: React.CSSProperties;
  if (!rect) place = { left: (vw - width) / 2, top: "50%", transform: "translateY(-50%)" };
  else {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);
    place = rect.top + rect.height / 2 < vh / 2 ? { left, top: Math.min(rect.bottom + PAD + 12, vh - 220) } : { left, bottom: Math.min(vh - rect.top + PAD + 12, vh - 220) };
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      {/* The dim with a hole: one rounded box whose huge shadow covers everything else. */}
      {rect ? (
        <div
          aria-hidden="true"
          className="tour-spot pointer-events-none fixed rounded-2xl"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div aria-hidden="true" className="tour-dim fixed inset-0" />
      )}
      {/* Clicks on the dim do nothing: the tour moves only with its buttons. */}
      <div className="fixed inset-0" />

      <div key={index} className="tour-card rise fixed rounded-3xl p-5" style={{ ...place, width }}>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow num">
            {index + 1} de {steps.length}
          </p>
          {!last && (
            <button type="button" onClick={finish} className="text-sm font-medium text-ink-3 hover:text-ink">
              Saltar
            </button>
          )}
        </div>
        <h2 id="tour-title" className="display mt-1 text-xl">
          {step.title}
        </h2>
        <p id="tour-text" className="mt-1.5 text-sm text-ink-2">
          {step.text}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="flex gap-1" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-brand" : "w-1.5 bg-line-strong"}`} />
            ))}
          </span>
          <span className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back} className="btn-quiet h-10 px-4 text-sm">
                Atrás
              </button>
            )}
            <button ref={primary} type="button" onClick={next} className="btn h-10 px-5 text-sm">
              {last ? "Empezar" : index === 0 ? "Vamos" : "Siguiente"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
