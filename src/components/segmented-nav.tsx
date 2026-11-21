"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * A segmented control whose options are links (Lista | Calendario). A pill in the button colours slides under the
 * chosen one the moment it is tapped, before the new view arrives; the address takes over after.
 * It keeps its own view-transition name, so it stays put while the content cross-fades.
 */
export function SegmentedNav({ label, items, name }: { label: string; items: { href: string; label: string; active: boolean }[]; name: string }) {
  const current = Math.max(0, items.findIndex((i) => i.active));
  const [chosen, setChosen] = useState(current);
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setChosen(current);
  }

  return (
    <nav className="segmented" aria-label={label} style={{ "--n": items.length, "--i": chosen, viewTransitionName: name } as React.CSSProperties}>
      <span aria-hidden="true" className="segmented-thumb" />
      {items.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          data-on={i === chosen ? "" : undefined}
          onClick={() => setChosen(i)}
          className="segment"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
