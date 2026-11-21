"use client";

import { useState } from "react";

/** Copies a value (a URL, a header) so it does not have to be typed on the phone. */
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet h-8 shrink-0 px-2.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* the text is visible and selectable anyway */
        }
      }}
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}

/** A value to copy, shown in full and selectable, with its copy button. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 p-2 pl-3">
      <code className="min-w-0 flex-1 select-all break-all text-xs">{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
