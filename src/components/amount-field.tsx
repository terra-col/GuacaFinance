"use client";

import { useEffect, useState } from "react";
import { CURRENCIES, formatRate, parseHundredths, parseRate, toPesos, type Currency } from "@/lib/currency";
import { formatCOP, formatDate } from "@/lib/finance";
import { useCurrenciesReady, useRates } from "./currency-context";
import { MoneyInput } from "./money-input";

/**
 * An amount in pesos, or in dollars, euros or dirhams with the rate it is turned into pesos at.
 * Sends `amount` in pesos always; in another currency also `currency`, `original` and `rate`
 * (the server works the pesos out again from those). Before migration 0026, pesos only.
 */
export function AmountField({
  label,
  defaultValue,
  currency: initialCurrency = "COP",
  original,
  rate: initialRate,
  onValue,
  required,
  placeholder,
  hero = false,
}: {
  label: string;
  /** In pesos. */
  defaultValue?: number | null;
  currency?: Currency;
  original?: number | null;
  rate?: number | null;
  onValue?: (pesos: number) => void;
  required?: boolean;
  placeholder?: string;
  /** The main figure of the form: large and centred at the top. */
  hero?: boolean;
}) {
  const ready = useCurrenciesReady();
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const foreign = currency !== "COP";
  const rates = useRates(foreign);
  const [typed, setTyped] = useState(original ? String(original).replace(".", ",") : "");
  // null: today's rate, as soon as it arrives. Editing keeps the one it was written with.
  const [rateText, setRateText] = useState<string | null>(initialRate ? formatRate(initialRate) : null);
  const today = foreign ? rates[currency] : null;
  const shownRate = rateText ?? (today ? formatRate(today) : "");
  const rate = parseRate(shownRate);
  const hundredths = parseHundredths(typed);
  const pesos = foreign && rate && hundredths ? toPesos(hundredths, rate) : 0;

  // The pesos follow the amount, the rate and today's rate when it arrives.
  useEffect(() => {
    if (foreign) onValue?.(pesos);
  }, [foreign, pesos, onValue]);

  function pick(next: Currency) {
    setCurrency(next);
    setRateText(initialCurrency === next && initialRate ? formatRate(initialRate) : null);
  }

  const picker = ready && (
    <div className="flex gap-1" role="group" aria-label="Moneda">
      {CURRENCIES.map((c) => (
        <button key={c.code} type="button" className="chip h-9 px-2.5 text-xs" aria-pressed={currency === c.code} title={c.name} data-currency={c.code} onClick={() => pick(c.code)}>
          {c.code}
        </button>
      ))}
    </div>
  );

  const big = "figure-input num px-1 pb-1 text-6xl";
  if (!foreign) {
    if (hero) {
      return (
        <div className="flex flex-col items-center gap-2 pb-1" data-hero-amount>
          {ready && <input type="hidden" name="currencies" value="1" />}
          <span className="eyebrow">{label}</span>
          <MoneyInput key="cop" name="amount" label={label} defaultValue={defaultValue} onValue={onValue} required={required} placeholder="$ 0" className={big} />
          {picker}
        </div>
      );
    }
    return (
      <div className="field">
        {ready && <input type="hidden" name="currencies" value="1" />}
        <span className="flex flex-wrap items-center justify-between gap-2">
          {label}
          {picker}
        </span>
        <MoneyInput key="cop" name="amount" label={label} defaultValue={defaultValue} onValue={onValue} required={required} placeholder={placeholder} />
      </div>
    );
  }
  const symbol = CURRENCIES.find((c) => c.code === currency)!.symbol;
  const fromToday = today !== null && rateText === null;
  return (
    <div className={hero ? "flex flex-col items-center gap-2 pb-1 text-center" : "field"} data-foreign={currency} data-hero-amount={hero || undefined}>
      {hero ? (
        <span className="eyebrow">
          {label} · en {CURRENCIES.find((c) => c.code === currency)!.name.toLowerCase()}
        </span>
      ) : (
        <span className="flex flex-wrap items-center justify-between gap-2">
          {label}
          {picker}
        </span>
      )}
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="currencies" value="1" />
      <input type="hidden" name="amount" value={pesos || ""} />
      <div className={hero ? "flex w-full items-baseline justify-center gap-2" : "grid grid-cols-[1fr_auto] items-center gap-2"}>
        <input
          className={hero ? big : "input num"}
          name="original"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} en ${symbol}`}
          placeholder={`${symbol} 0,00`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required={required}
        />
        {!hero && <span className="text-sm font-semibold text-ink-2">{symbol}</span>}
      </div>
      {hero && picker}
      <span className={`grid grid-cols-[auto_1fr] items-center gap-2 text-xs font-normal text-ink-3 ${hero ? "w-full max-w-xs" : ""}`}>
        <span>1 {symbol} = $</span>
        <input
          className="input num h-9 py-1 text-sm"
          name="rate"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Pesos por cada ${symbol}`}
          placeholder={today === null ? "Cargando la tasa…" : "Escribe la tasa"}
          value={shownRate}
          onChange={(e) => setRateText(e.target.value)}
          required
        />
      </span>
      <span className="num text-sm font-normal text-ink-2" data-pesos>
        {pesos ? (
          <>
            Son <strong className="text-ink">{formatCOP(pesos)}</strong>
            {fromToday ? (currency === "USD" && rates.date ? ` · TRM del ${formatDate(rates.date)}` : " · tasa de referencia de hoy") : " · con tu tasa"}
          </>
        ) : (
          "Escribe el valor para verlo en pesos. Si no aparece la tasa, escríbela."
        )}
      </span>
    </div>
  );
}
