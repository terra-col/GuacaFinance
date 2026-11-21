"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { calendarWeeks } from "@/lib/calendar";
import { formatDate, shiftMonth, todayInBogota } from "@/lib/finance";
import { Icon } from "./icons";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// A mouse or trackpad: the browser's own date popup there cannot be styled (and speaks the
// browser's language), so Guaca draws its own. Phones keep their native wheels.
const finePointer = (onChange: () => void) => {
  const query = window.matchMedia("(pointer: fine)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/**
 * A date field: Spanish, Monday-first, in the brand's look on computers; the phone's native
 * picker on touch screens. Submits 'YYYY-MM-DD' under `name`, like `<input type="date">`.
 */
export function DateField({
  name,
  defaultValue = "",
  value: controlled,
  onChange,
  min,
  max,
  required,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const fine = useSyncExternalStore(finePointer, () => window.matchMedia("(pointer: fine)").matches, () => false);
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const set = (date: string) => {
    if (controlled === undefined) setOwn(date);
    onChange?.(date);
  };

  const [open, setOpen] = useState(false);
  // The popup goes to the browser's top layer (popover API), above everything and clipped by
  // nothing: not a card, not a sliding panel, not a modal dialog. It is placed inside the open
  // <dialog> when the field is in one (outside it, a modal dialog makes everything inert), else
  // on <body>, and positioned on the screen, on the side with room, never past an edge.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const today = todayInBogota();
  const [view, setView] = useState((value || today).slice(0, 7));
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const showPop = (el: HTMLDivElement | null) => {
    pop.current = el;
    if (el && typeof el.showPopover === "function" && !el.matches(":popover-open")) el.showPopover();
  };

  useEffect(() => {
    if (!open) return;
    setHost(box.current?.closest<HTMLElement>("dialog[open]") ?? document.body);
    const position = () => {
      const rect = box.current?.getBoundingClientRect();
      if (!rect) return;
      const height = pop.current?.offsetHeight || 360;
      const width = Math.min(304, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const goBelow = below >= height + 16 || below >= above;
      const wanted = goBelow ? rect.bottom + 8 : rect.top - height - 8;
      const top = Math.min(Math.max(8, wanted), window.innerHeight - height - 8);
      setPlace({ left, width, top });
    };
    position();
    // Once drawn, its real height decides the side.
    const frame = requestAnimationFrame(position);
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !pop.current?.contains(target)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the calendar, not the dialog it may be in.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    // Follows the field when the page or a scrolling panel moves.
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  if (!fine) {
    return <input className="input" type="date" name={name} value={value} onChange={(e) => set(e.target.value)} min={min} max={max} required={required} />;
  }

  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);
  const canPrev = !min || shiftMonth(view, -1) >= min.slice(0, 7);
  const canNext = !max || shiftMonth(view, 1) <= max.slice(0, 7);

  function toggle() {
    if (!open) setView((value || (max && today > max ? max : today)).slice(0, 7));
    setOpen(!open);
  }

  function pick(date: string) {
    set(date);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={value} />
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value ? "" : "text-ink-3"}>{value ? formatDate(value) : "Elige una fecha"}</span>
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h16V20H4zM4 10.5h16M8.5 4v4M15.5 4v4" />
        </svg>
      </button>
      {/* Keeps the browser's own "fill this in" check on an empty required date. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
          required
          value={value}
          onChange={() => {}}
          onInvalid={() => setOpen(true)}
        />
      )}

      {open &&
        host &&
        createPortal(
        <div
          ref={showPop}
          popover="manual"
          role="dialog"
          aria-label="Elegir fecha"
          style={place}
          className="date-pop rise fixed z-[90] m-0 rounded-2xl p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex size-9 items-center justify-center rounded-xl hover:bg-brand/10 disabled:opacity-30" onClick={() => setView(shiftMonth(view, -1))} disabled={!canPrev} aria-label="Mes anterior">
              ‹
            </button>
            <p className="display text-base first-letter:uppercase">
              {MONTHS[Number(view.slice(5, 7)) - 1]} {view.slice(0, 4)}
            </p>
            <button type="button" className="flex size-9 items-center justify-center rounded-xl hover:bg-brand/10 disabled:opacity-30" onClick={() => setView(shiftMonth(view, 1))} disabled={!canNext} aria-label="Mes siguiente">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-3" aria-hidden="true">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarWeeks(view)
              .flat()
              .map((date, i) =>
                date ? (
                  <button
                    key={date}
                    type="button"
                    disabled={!allowed(date)}
                    onClick={() => pick(date)}
                    aria-pressed={date === value}
                    aria-label={formatDate(date)}
                    className={`num flex h-9 items-center justify-center rounded-lg text-sm transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                      date === value ? "bg-brand font-semibold text-white" : date === today ? "font-semibold text-brand ring-1 ring-brand ring-inset hover:bg-brand/10" : "hover:bg-brand/10"
                    }`}
                  >
                    {Number(date.slice(8))}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
            {!required && value ? (
              <button type="button" className="font-medium text-ink-3 hover:text-ink" onClick={() => pick("")}>
                Borrar
              </button>
            ) : (
              <span />
            )}
            {allowed(today) && (
              <button type="button" className="flex items-center gap-1 font-semibold text-brand" onClick={() => pick(today)}>
                <Icon name="target" className="size-4" />
                Hoy
              </button>
            )}
          </div>
        </div>,
          host,
        )}
    </div>
  );
}
