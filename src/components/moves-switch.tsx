import Link from "next/link";

interface View {
  href: string;
  label: string;
}

function Switch({ views, active, label, className = "" }: { views: View[]; active: string; label: string; className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <nav className="segmented" aria-label={label} style={{ "--n": views.length, "--i": views.findIndex((v) => v.href === active) } as React.CSSProperties}>
        <span aria-hidden="true" className="segmented-thumb" />
        {views.map((v) => (
          <Link key={v.href} href={v.href} scroll={false} aria-current={v.href === active ? "page" : undefined} data-on={v.href === active ? "" : undefined} className="segment">
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const MOVES = [
  { href: "/movimientos", label: "Personales" },
  { href: "/compartidos", label: "Compartidos" },
];

/** Personales | Compartidos: the two halves of Movimientos. */
export function MovesSwitch({ active }: { active: "/movimientos" | "/compartidos" }) {
  return <Switch views={MOVES} active={active} label="Qué movimientos ver" />;
}

const CREDITS = [
  { href: "/deudas", label: "Créditos" },
  { href: "/metas", label: "Metas" },
];

/** Créditos | Metas: the two halves of the phone's «Créditos y metas» tab. Computers have a tab for each. */
export function CreditsSwitch({ active }: { active: "/deudas" | "/metas" }) {
  return <Switch views={CREDITS} active={active} label="Qué ver: créditos o metas" className="lg:hidden" />;
}
