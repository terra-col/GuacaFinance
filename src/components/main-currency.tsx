"use client";

import { useActionState, useState } from "react";
import { setMainCurrency, type FormState } from "@/app/actions";
import { CURRENCIES, type Currency } from "@/lib/currency";

/**
 * «Moneda principal»: the one the balance, Tienes/Debes and «Tu mes» are shown in. Picking one
 * saves it at once; the data stays in pesos and is turned into it at today's rate.
 */
export function MainCurrencyPicker({ initial }: { initial: Currency }) {
  const [chosen, setChosen] = useState<Currency>(initial);
  const [state, action, pending] = useActionState<FormState, FormData>(setMainCurrency, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Moneda principal">
        {CURRENCIES.map((c) => (
          <label key={c.code} className="month-chip px-3.5" data-main={c.code}>
            <input
              className="sr-only"
              type="radio"
              name="main_currency"
              value={c.code}
              checked={chosen === c.code}
              onChange={(e) => {
                setChosen(c.code);
                e.currentTarget.form?.requestSubmit();
              }}
            />
            {c.name} <span className="text-ink-3">{c.code}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-3" role="status">
        {pending
          ? "Guardando…"
          : state.error
            ? state.error
            : chosen === "COP"
              ? "Todo se muestra en pesos."
              : "Tu balance, lo que tienes y debes y «Tu mes» se muestran en esta moneda con la tasa de hoy (≈). Los movimientos, pagos y presupuestos siguen en la moneda en que los registras."}
      </p>
    </form>
  );
}
