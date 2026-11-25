"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSharedReady } from "./shared-ready";

interface View {
  href: string;
  label: string;
  icon: string;
}

const SECTIONS = {
  moves: {
    label: "Qué movimientos ver",
    views: [
      { href: "/movimientos", label: "Personales", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0" },
      { href: "/compartidos", label: "Compartidos", icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8" },
    ],
    // Computers have no other way between the two halves.
    className: "",
  },
  credits: {
    label: "Qué ver: créditos o metas",
    views: [
      { href: "/deudas", label: "Créditos", icon: "M3 6l6 6 4-4 8 8M21 11v5h-5" },
      { href: "/metas", label: "Metas", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" },
    ],
    // Computers have a tab for each.
    className: "lg:hidden",
  },
} satisfies Record<string, { label: string; views: View[]; className: string }>;

/**
 * The big switch at the top of a two-part section (Personales | Compartidos, Créditos | Metas).
 * It lives in the section's layout, so it stays while the other half loads: the pill slides
 * over at the tap, stretching toward where it goes, and the screen arrives under it.
 */
export function SectionSwitch({ section }: { section: keyof typeof SECTIONS }) {
  const pathname = usePathname();
  const shared = useSharedReady();
  const { label, views, className } = SECTIONS[section];
  const here = views.findIndex((v) => v.href === pathname);
  // The tapped half, until the address catches up.
  const [picked, setPicked] = useState<{ at: string; index: number } | null>(null);
  const [dir, setDir] = useState<"l" | "r">("r");
  const index = picked && picked.at === pathname ? picked.index : here;

  // Only on the two screens themselves, not on a group or a goal.
  if (here < 0 || (section === "moves" && !shared)) return null;
  return (
    <div className={`flex justify-center pt-1 ${className}`}>
      <nav
        className="segmented segmented-lg"
        aria-label={label}
        data-dir={dir}
        style={{ "--n": views.length, "--i": index, viewTransitionName: "section-switch" } as React.CSSProperties}
      >
        <span aria-hidden="true" className="segmented-thumb" />
        {views.map((v, i) => (
          <Link
            key={v.href}
            href={v.href}
            scroll={false}
            onClick={() => {
              if (i === index) return;
              setDir(i > index ? "r" : "l");
              setPicked({ at: pathname, index: i });
            }}
            aria-current={i === here ? "page" : undefined}
            data-on={i === index ? "" : undefined}
            className="segment"
          >
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={v.icon} />
            </svg>
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
