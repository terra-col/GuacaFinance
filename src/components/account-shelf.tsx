import Link from "next/link";
import { cardColor, cardInk } from "@/lib/banks";
import { balanceAt, holdsMoney, shelfOrder, type Account, type AccountKind, type Tx } from "@/lib/finance";
import { AccountCard } from "./account-card";
import { AddTile } from "./add-tile";
import { Slide } from "./carousel";
import { SortableCarousel } from "./sortable-carousel";
import { FavoriteStar } from "./favorite-star";
import { LinkPending } from "./link-pending";
import { UsageBar } from "./usage-bar";

export const SHELF_TITLE: Record<AccountKind, string> = {
  savings: "Cuentas bancarias",
  cash: "Efectivo",
  credit_card: "Tarjetas de crédito",
  loan: "Préstamos",
};

/** One kind of account as a sideways carousel of cards, ending in a «+» tile for another of the same kind. */
export function AccountShelf({
  kinds,
  accounts,
  txs,
  title = SHELF_TITLE[kinds[0]],
  showTitle = true,
}: {
  kinds: AccountKind[];
  accounts: Account[];
  txs: Tx[];
  title?: string;
  showTitle?: boolean;
}) {
  // The favourite account for payments goes first, then the order the person chose by dragging.
  const group = shelfOrder(accounts.filter((a) => kinds.includes(a.kind)));
  return (
    <section aria-label={title}>
      {showTitle && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="display text-2xl">{title}</h2>
          {group.length > 1 && <p className="text-sm text-ink-3">{group.length} · desliza para ver más; mantén oprimida una para moverla</p>}
        </div>
      )}
      <div>
        <SortableCarousel
          label={title}
          favorite={group.find((a) => a.favorite)?.id ?? null}
          items={group.map((account) => {
            const balance = balanceAt(account, txs);
            return {
              id: account.id,
              node: (
                <div className="relative transition-transform hover:-translate-y-1">
                  <Link href={`/cuentas/${account.id}`} draggable={false} className="relative block active:scale-[0.98]" aria-label={`Ver ${account.name}`}>
                    <LinkPending />
                    <AccountCard account={account} balance={Math.max(0, balance)} caption={holdsMoney(account) ? "Saldo" : "Lo que debes"} morph={account.id}>
                      {account.kind === "credit_card" && account.credit_limit ? <UsageBar usage={Math.max(0, balance) / account.credit_limit} onCard /> : null}
                    </AccountCard>
                  </Link>
                  {/* Beside the link, not inside it: tapping the star does not open the account. */}
                  {holdsMoney(account) && (
                    <span className="absolute right-4 top-14 z-10">
                      <FavoriteStar id={account.id} name={account.name} on={Boolean(account.favorite)} light={cardInk(cardColor(account)) === "#FFFFFF"} />
                    </span>
                  )}
                </div>
              ),
            };
          })}
          tail={kinds.map((kind, i) => (
            <Slide key={kind} index={group.length + i}>
              <AddTile kind={kind} />
            </Slide>
          ))}
        />
      </div>
    </section>
  );
}
