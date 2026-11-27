"use client";

import { useEffect, useRef, useState } from "react";
import { formatCOP } from "@/lib/finance";
import { formatMain, type MainCurrency } from "@/lib/currency";

/**
 * Shows a peso amount that counts from `from` to `value` when it appears or
 * changes, so a balance visibly moves up or down. The real value is always in
 * the DOM for assistive tech; reduced-motion users get it immediately.
 */
export function AnimatedNumber({ value, from, main }: { value: number; from: number; /** Shown in the main currency (Ajustes); pesos when absent. */ main?: MainCurrency }) {
  const format = (n: number) => (main ? formatMain(n, main) : formatCOP(n));
  const [shown, setShown] = useState(from);
  const last = useRef(from);

  useEffect(() => {
    const start = last.current;
    last.current = value;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
