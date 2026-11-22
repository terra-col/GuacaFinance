import Link from "next/link";

const VIEWS = [
  { href: "/movimientos", label: "Personales" },
  { href: "/compartidos", label: "Compartidos" },
];

/** Personales | Compartidos: the two halves of Movimientos. */
export function MovesSwitch({ active }: { active: "/movimientos" | "/compartidos" }) {
  return (
    <div className="flex justify-center">
      <nav className="segmented" aria-label="Qué movimientos ver" style={{ "--n": VIEWS.length, "--i": VIEWS.findIndex((v) => v.href === active) } as React.CSSProperties}>
        <span aria-hidden="true" className="segmented-thumb" />
        {VIEWS.map((v) => (
          <Link key={v.href} href={v.href} scroll={false} aria-current={v.href === active ? "page" : undefined} data-on={v.href === active ? "" : undefined} className="segment">
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
