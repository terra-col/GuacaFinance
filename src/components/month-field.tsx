"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { monthName, todayInBogota } from "@/lib/finance";
import { Icon } from "./icons";
import { useAnchoredPopover, useFinePointer } from "./use-anchored-popover";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (month: string) => `${monthName(month)} de ${month.slice(0, 4)}`;

/**
 * A month field: Spanish and in the brand's look on computers (a year with its twelve months);
 * the phone's native picker on touch screens. Submits 'YYYY-MM' under `name`, like `<input type="month">`.
 */
export function MonthField({ name, defaultValue = "", min, max, required }: { name: string; defaultValue?: string; min?: string; max?: string; required?: boolean }) {
  const fine = useFinePointer();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const current = todayInBogota().slice(0, 7);
  const [year, setYear] = useState(Number((value || current).slice(0, 4)));
  const { box, popRef, host, place } = useAnchoredPopover({ open, onClose: () => setOpen(false), width: 288 });

  if (!fine) {
    return <input className="input" type="month" name={name} value={value} onChange={(e) => setValue(e.target.value)} min={min} max={max} required={required} />;
  }

  const allowed = (m: string) => (!min || m >= min) && (!max || m <= max);
  const canPrev = !min || year - 1 >= Number(min.slice(0, 4));
  const canNext = !max || year + 1 <= Number(max.slice(0, 4));

  function toggle() {
    if (!open) setYear(Number((value || current).slice(0, 4)));
    setOpen(!open);
  }

  function pick(month: string) {
    setValue(month);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={value} />
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span className={`first-letter:uppercase ${value ? "" : "text-ink-3"}`}>{value ? label(value) : "Elige un mes"}</span>
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M4 6.5h16V20H4zM4 10.5h16M8.5 4v4M15.5 4v4" />
        </svg>
      </button>
      {/* Keeps the browser's own "fill this in" check on an empty required month. */}
      {required && (
        <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" required value={value} onChange={() => {}} onInvalid={() => setOpen(true)} />
      )}

      {open &&
        host &&
        createPortal(
          <div ref={popRef} popover="manual" role="dialog" aria-label="Elegir mes" style={place} className="date-pop rise fixed z-[90] m-0 rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className="flex size-9 items-center justify-center rounded-xl hover:bg-brand/10 disabled:opacity-30" onClick={() => setYear(year - 1)} disabled={!canPrev} aria-label="Año anterior">
                ‹
              </button>
              <p className="display num text-base">{year}</p>
              <button type="button" className="flex size-9 items-center justify-center rounded-xl hover:bg-brand/10 disabled:opacity-30" onClick={() => setYear(year + 1)} disabled={!canNext} aria-label="Año siguiente">
                ›
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {SHORT.map((short, i) => {
                const month = `${year}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={month}
                    type="button"
                    disabled={!allowed(month)}
                    onClick={() => pick(month)}
                    aria-pressed={month === value}
                    aria-label={label(month)}
                    className={`flex h-10 items-center justify-center rounded-xl text-sm capitalize transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                      month === value
                        ? "bg-brand font-semibold text-white"
                        : month === current
                          ? "font-semibold text-brand ring-1 ring-brand ring-inset hover:bg-brand/10"
                          : "hover:bg-brand/10"
                    }`}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
            {allowed(current) && (
              <div className="mt-2 flex justify-end border-t border-line pt-2 text-sm">
                <button type="button" className="flex items-center gap-1 font-semibold text-brand" onClick={() => pick(current)}>
                  <Icon name="target" className="size-4" />
                  Este mes
                </button>
              </div>
            )}
          </div>,
          host,
        )}
    </div>
  );
}
