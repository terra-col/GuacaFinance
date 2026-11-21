"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const [above, setAbove] = useState(false);
  const today = todayInBogota();
  const [view, setView] = useState((value || today).slice(0, 7));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!fine) {
    return <input className="input" type="date" name={name} value={value} onChange={(e) => set(e.target.value)} min={min} max={max} required={required} />;
  }

  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);
  const canPrev = !min || shiftMonth(view, -1) >= min.slice(0, 7);
  const canNext = !max || shiftMonth(view, 1) <= max.slice(0, 7);

  function toggle() {
    if (!open) {
      setView((value || (max && today > max ? max : today)).slice(0, 7));
      // Open upwards when the field sits low on the screen.
      const rect = box.current?.getBoundingClientRect();
      setAbove(Boolean(rect && window.innerHeight - rect.bottom < 360 && rect.top > 360));
    }
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

      {open && (
        <div
          role="dialog"
          aria-label="Elegir fecha"
          // Inside a <label>, a click on an empty spot would "activate" the field and close this.
          onClick={(e) => e.preventDefault()}
          className={`date-pop rise absolute left-0 z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl p-3 ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
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
        </div>
      )}
    </div>
  );
}
