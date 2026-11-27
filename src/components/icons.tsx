import { ADJUSTMENT, type AccountKind, type Tx } from "@/lib/finance";

// One line-icon set for the whole app: same 24 px grid, rounded joins and
// stroke as the tab bar, so accounts, categories and actions read as a family.
const PATHS = {
  bank: "M3 10h18M5 10v7m4.67-7v7m4.66-7v7M19 10v7M3 20h18M12 3.5l8.5 4.5h-17z",
  cash: "M3 6.5h18v11H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 9.5v.01M17.5 14.5v.01",
  card: "M3 5.5h18v13H3zM3 10h18M7 15h4",
  loan: "M6.5 3h8l4 4v14h-12zM14.5 3v4h4M9.5 11.5h5M9.5 15.5h3",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  close: "M6 6l12 12M18 6 6 18",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  leisure: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v2.5M14 14.5V17",
  groceries: "M3 4h2.2l2.3 10.5h10.7L20.5 8H6.3M9.5 19.5v.01M17 19.5v.01",
  food: "M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.2 1.4-3.2 4.2-3.2 7.5H17",
  transport: "M5 16.5V11l2-5h10l2 5v5.5M3.5 16.5h17V19h-17zM7 11h10M7 19v1.5M17 19v1.5",
  home: "M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20",
  health: "M20.5 8.8c0 5.2-8.5 11-8.5 11s-8.5-5.8-8.5-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.5 2.6zM7.5 12h2.5l1.3-2.5 1.9 5 1.3-2.5h2",
  subscriptions: "M3.5 5.5h17v11h-17zM10.5 8.5v5l4-2.5zM8 20h8",
  bills: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  interest: "M18.5 5.5l-13 13M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  other: "M12 3.5l1.9 4.6L18.5 9.5l-4.6 1.4L12 15.5l-1.9-4.6L5.5 9.5l4.6-1.4zM18.5 15.5l.8 1.9 1.7.6-1.7.6-.8 1.9-.8-1.9-1.7-.6 1.7-.6z",
  income: "M12 3.5v11m0 0-4-4m4 4 4-4M4 16.5v4h16v-4",
  payment: "M12 20.5v-11m0 0-4 4m4-4 4 4M4 3.5h16",
  adjust: "M4 7h10m4 0h2M4 17h2m4 0h10M16 5v4M8 15v4",
  // Two arrows passing each other: money between one's own accounts.
  transfer: "M4 8h14m0 0-3.5-3.5M18 8l-3.5 3.5M20 16H6m0 0 3.5-3.5M6 16l3.5 3.5",
  palette:
    "M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.8 1.7-1.6 0-1.1-.9-1.5-.9-2.5 0-.9.7-1.5 1.6-1.5h2.2a3.9 3.9 0 0 0 3.9-3.9C20.5 6.8 16.7 3.5 12 3.5zM7.5 12.5v.01M9 8.5v.01M13 7v.01M16.5 9.5v.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5", strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export const KIND_ICON: Record<AccountKind, IconName> = { savings: "bank", cash: "cash", credit_card: "card", loan: "loan" };

const CATEGORY: Record<string, IconName> = {
  ocio: "leisure",
  mercado: "groceries",
  restaurantes: "food",
  transporte: "transport",
  hogar: "home",
  salud: "health",
  suscripciones: "subscriptions",
  recibos: "bills",
  "intereses y cargos": "interest",
  otros: "other",
};

/** The icon for a movement: its kind for income and debt payments, its category for spending. */
export function txIconName(tx: Pick<Tx, "kind" | "category">): IconName {
  if (tx.category === ADJUSTMENT) return "adjust";
  if (tx.kind === "income") return "income";
  if (tx.kind === "payment") return "payment";
  if (tx.kind === "transfer") return "transfer";
  return CATEGORY[(tx.category ?? "").toLowerCase()] ?? "other";
}
