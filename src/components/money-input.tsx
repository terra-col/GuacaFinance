"use client";

import { useState } from "react";
import { formatPesosInput, parsePesos } from "@/lib/finance";

/**
 * A peso amount that formats itself as you type: "$ 1.500.000". The formatted
 * text is submitted as is: the server's parsePesos reads it, without cents.
 */
export function MoneyInput({
  name,
  defaultValue,
  required,
  placeholder = "$ 0",
  autoFocus,
  label,
  onValue,
  className = "input num",
}: {
  name: string;
  defaultValue?: number | string | null;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
  /** Called with the amount in pesos as the person types. */
  onValue?: (pesos: number) => void;
  className?: string;
}) {
  const [value, setValue] = useState(() => formatPesosInput(defaultValue));
  return (
    <input
      className={className}
      name={name}
      value={value}
      onChange={(e) => {
        const next = formatPesosInput(e.target.value);
        setValue(next);
        onValue?.(parsePesos(next) ?? 0);
        // Keep the caret at the end: the dots move as digits are typed.
        const el = e.target;
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
      }}
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="done"
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      aria-label={label}
    />
  );
}
