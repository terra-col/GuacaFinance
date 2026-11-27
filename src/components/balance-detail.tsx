import { CURRENCIES, PESOS, formatForeign, formatMain, formatRate, showsForeign, type MainCurrency } from "@/lib/currency";
import { formatCOP, formatDate, type CurrencyBalance } from "@/lib/finance";
import { Modal } from "./modal";

const nameOf = (code: string) => CURRENCIES.find((c) => c.code === code)!.name;
const symbolOf = (code: string) => CURRENCIES.find((c) => c.code === code)!.symbol;

/**
 * «Por moneda»: when there are accounts in more than one currency, what one has and owes in each,
 * there and in pesos today, with the rate used. The total above is the sum of those pesos.
 */
export function BalanceDetail({ groups, rateDate, main = PESOS }: { groups: CurrencyBalance[]; rateDate: string | null; main?: MainCurrency }) {
  const total = groups.reduce((sum, g) => sum + g.haveValue - g.oweValue, 0);
  return (
    <Modal label="Ver por moneda" title="Tu balance por moneda" buttonClass="text-sm font-semibold text-brand">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {groups.map((g) => {
            const own = (n: number) => (g.currency === "COP" ? formatCOP(n) : formatForeign(n, g.currency));
            const net = g.have - g.owe;
            return (
              <li key={g.currency} className="rounded-2xl bg-line/30 p-4" data-currency-group={g.currency}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    {nameOf(g.currency)} <span className="text-sm font-medium text-ink-3">{g.currency}</span>
                  </p>
                  <p className="display num text-xl">{own(net)}</p>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink-3">Tienes</dt>
                  <dd className="num text-right font-medium">{own(g.have)}</dd>
                  <dt className="text-ink-3">Debes</dt>
                  <dd className="num text-right font-medium">{own(g.owe)}</dd>
                </dl>
                {g.currency !== "COP" && (
                  <p className="mt-2 text-xs text-ink-3">
                    ≈ <span className="num font-semibold text-ink-2">{formatCOP(g.haveValue - g.oweValue)}</span> hoy
                    {g.rate ? (
                      <>
                        {" "}
                        · 1 {symbolOf(g.currency)} = $ {formatRate(g.rate)}
                        {rateDate && g.currency === "USD" ? ` (TRM del ${formatDate(rateDate)})` : ""}
                      </>
                    ) : null}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <p className="font-semibold">Total en pesos</p>
          <p className="display num shrink-0 whitespace-nowrap text-2xl">≈ {formatCOP(total)}</p>
        </div>
        {showsForeign(main) && (
          <div className="-mt-2 flex items-baseline justify-between gap-3" data-main-total>
            <p className="font-semibold">En {nameOf(main.code).toLowerCase()}, tu moneda principal</p>
            <p className="display num shrink-0 whitespace-nowrap text-xl">≈ {formatMain(total, main)}</p>
          </div>
        )}
        <p className="text-xs text-ink-3">
          Lo que está en otra moneda se suma con la tasa de hoy. Si la tasa sube o baja, tu balance en pesos cambia aunque no hayas movido nada.
        </p>
      </div>
    </Modal>
  );
}
