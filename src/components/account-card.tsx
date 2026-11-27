import { ViewTransition } from "react";
import { bankKey, bankLogoUrl, cardColor, cardInk, initials, shade } from "@/lib/banks";
import { BankLogo } from "./bank-logo";
import { Icon } from "./icons";
import { KIND_LABEL, accountForeign, formatCOP, type Account } from "@/lib/finance";
import { formatForeign } from "@/lib/currency";

type CardAccount = Pick<Account, "kind" | "name" | "institution" | "color" | "last4" | "logo" | "currency" | "fx_rate">;

/**
 * An account drawn as a card, in its bank's colour (or the one chosen), with
 * the bank image the user uploaded or a monogram. Text colour is picked for
 * contrast against the card. `children` sits at the bottom (a usage bar, for example).
 */
export function AccountCard({
  account,
  balance,
  caption,
  size = "md",
  morph,
  children,
}: {
  /** Account id: the card morphs between list and detail when both pages name it the same. */
  morph?: string;
  account: CardAccount;
  balance?: number;
  caption?: string;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  const color = cardColor(account);
  const ink = cardInk(color);
  const light = ink === "#FFFFFF";
  const mark = account.institution || account.name;
  const big = size === "lg";
  // In another currency: its balance there first, and about how much in pesos today.
  const code = accountForeign(account);
  const native = code && balance !== undefined && account.fx_rate ? formatForeign(balance / account.fx_rate, code) : null;
  // Uploaded image first; then the bank's own icon when the bank is known; else initials.
  const bank = bankKey(account.institution);
  const monogram = (
    <span
      aria-hidden="true"
      className="display flex size-10 shrink-0 items-center justify-center rounded-xl text-sm"
      style={{ background: light ? "rgba(255,255,255,0.22)" : "rgba(20,17,46,0.12)" }}
    >
      {account.kind === "cash" ? <Icon name="cash" className="size-5" /> : initials(mark)}
    </span>
  );

  const card = (
    <div
      // The card keeps a card's proportions but grows when its content needs more room.
      // It must not clip: with overflow hidden, aspect-ratio would cut the bottom (balance, usage bar).
      className={`relative isolate flex flex-col justify-between rounded-3xl shadow-[0_18px_40px_-18px_rgba(30,20,90,0.55)] ${
        size === "sm" ? "min-h-36 gap-3 p-4" : big ? "aspect-[1.586] w-full max-w-md gap-4 p-6" : "aspect-[1.586] gap-4 p-5"
      }`}
      style={{ background: `linear-gradient(135deg, ${color} 0%, ${shade(color, 0.28)} 100%)`, color: ink }}
    >
      {/* Decoration lives in its own clipped layer: light sweeping across and two soft rings. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <span className="absolute -right-16 -top-20 size-56 rounded-full border-[28px] opacity-15" style={{ borderColor: ink }} />
        <span className="absolute -bottom-24 -left-10 size-56 rounded-full opacity-10" style={{ background: ink }} />
        <span
          className="absolute inset-0"
          style={{ background: `linear-gradient(115deg, ${light ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.4)"} 0%, transparent 38%)` }}
        />
      </span>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {account.logo ? (
            <BankLogo key={account.logo.slice(-32)} src={account.logo} fallback={monogram} />
          ) : bank ? (
            <BankLogo key={bank} src={bankLogoUrl(bank)} fallback={monogram} />
          ) : (
            monogram
          )}
          {account.institution && <span className="truncate text-sm font-semibold">{account.institution}</span>}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: light ? "rgba(255,255,255,0.2)" : "rgba(20,17,46,0.1)" }}
        >
          {KIND_LABEL[account.kind]}
          {code ? ` · ${code}` : ""}
        </span>
      </div>

      {account.kind === "credit_card" && size !== "sm" && (
        <span
          aria-hidden="true"
          className="h-8 w-11 shrink-0 rounded-md"
          style={{ background: "linear-gradient(135deg, #f6e7a8, #c9a74a)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
        />
      )}

      <div className="min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium opacity-90">{account.name}</p>
            {balance !== undefined && <p className={`display leading-tight ${big ? "text-4xl" : "text-2xl"}`}>{native ?? formatCOP(balance)}</p>}
            {caption && <p className="text-xs font-medium opacity-85">{caption}{native ? ` · ≈ ${formatCOP(balance!)} hoy` : ""}</p>}
            {!caption && native && <p className="text-xs font-medium opacity-85">≈ {formatCOP(balance!)} hoy</p>}
          </div>
          {account.last4 && <p className="num shrink-0 text-sm font-semibold tracking-widest opacity-90">•••• {account.last4}</p>}
        </div>
        {children}
      </div>
    </div>
  );
  return morph ? (
    <ViewTransition name={`card-${morph}`} share="morph" default="none">
      {card}
    </ViewTransition>
  ) : (
    card
  );
}
