"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteAccount, toggleFavorite, updateAccount, type FormState } from "@/app/actions";
import { CARD_COLORS, bankColor, bankKey, cardColor } from "@/lib/banks";
import type { Account } from "@/lib/finance";
import { installmentsPaid } from "@/lib/installments";
import { AccountCard } from "./account-card";
import { CreditDetailFields } from "./credit-detail-fields";
import { BalanceAdjuster } from "./balance-adjuster";
import { Icon } from "./icons";
import { DateField } from "./date-field";
import { MoneyInput } from "./money-input";
import { SubmitButton } from "./submit-button";
import { UsageBar } from "./usage-bar";

const MAX_SIDE = 160;

/** Shrinks an uploaded image to a small square-ish data URL that fits in the database. */
async function toSmallDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.86);
  // Browsers that cannot encode WebP silently return PNG; both are accepted.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

/** «Personalizar» changes how the card looks; «Datos» holds the numbers: balance, limit, dates, rate. */
type Mode = "look" | "data";

/** What «Datos» covers for each kind of account, under its button. */
const DATA_HINT: Record<Account["kind"], string> = {
  credit_card: "Saldo, cupo, fechas y tasa",
  loan: "Saldo, cuota, plazo y tasa",
  savings: "Actualizar el saldo",
  cash: "Actualizar el saldo",
};

/**
 * The account's card and, right under it, two clearly different actions. «Personalizar» turns
 * the same card into a live preview: colour, image and name change on it as you edit. «Datos»
 * gathers the numbers: the balance first, then limit, dates, rate and term.
 *
 * One form saves both (the server rewrites every field), so each view keeps the other's fields
 * in the form, just hidden.
 */
export function AccountHero({
  account,
  balance,
  debt,
  today,
  movements,
}: {
  account: Account;
  balance: number;
  debt: boolean;
  today: string;
  /** How many movements deleting the account would remove. */
  movements: number;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [round, setRound] = useState(0);
  const [state, action] = useActionState<FormState, FormData>(async (prev: FormState, form: FormData) => {
    const result = await updateAccount(prev, form);
    if (!result.error) {
      setMode(null);
      setSaved(true);
    }
    return result;
  }, {});
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? "");
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [color, setColor] = useState<string | null>(account.color ?? null);
  const [logo, setLogo] = useState<string | null>(account.logo ?? null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoLogo = bankKey(institution);
  const styling = mode === "look";

  const suggested = bankColor(institution);
  const swatches = [...new Set([suggested, ...CARD_COLORS].filter(Boolean) as string[])];
  const preview = {
    kind: account.kind,
    name: name || account.name,
    institution: institution || null,
    color,
    last4: last4.length === 4 ? last4 : null,
    logo,
  };
  const shown = cardColor(preview);
  const isCard = account.kind === "credit_card";
  const isLoan = account.kind === "loan";
  const usage = isCard && account.credit_limit ? Math.max(0, balance) / account.credit_limit : null;
  const noun = isCard ? "la tarjeta" : isLoan ? "el préstamo" : "la cuenta";

  function open(next: Mode, withBalance = false) {
    setSaved(false);
    setBalanceOpen(withBalance);
    setMode(next);
  }

  function close() {
    // Back to what is stored; the fields remount with their saved values.
    setName(account.name);
    setInstitution(account.institution ?? "");
    setLast4(account.last4 ?? "");
    setColor(account.color ?? null);
    setLogo(account.logo ?? null);
    setImageError(null);
    setRound((r) => r + 1);
    setMode(null);
  }

  async function pickImage(file: File | undefined | null) {
    setImageError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|heic|heif|gif)$/.test(file.type)) return setImageError("Usa una imagen PNG, JPG o WebP.");
    try {
      setLogo(await toSmallDataUrl(file));
    } catch {
      setImageError("No se pudo leer esa imagen. Prueba con otra.");
    }
  }

  // Links land straight in the right view, also from a link on this same screen:
  // #editar → Datos, #saldo → Datos with the balance form open, #personalizar → Personalizar.
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const hash = window.location.hash;
      const target = hash === "#editar" ? (["data", false] as const) : hash === "#saldo" ? (["data", true] as const) : hash === "#personalizar" ? (["look", false] as const) : null;
      if (!target) return;
      frame = requestAnimationFrame(() => {
        setSaved(false);
        setBalanceOpen(target[1]);
        setMode(target[0]);
      });
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", follow);
    };
  }, []);

  // While personalising, pasting an image anywhere uses it as the card's image.
  useEffect(() => {
    if (!styling) return;
    function onPaste(e: ClipboardEvent) {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        pickImage(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [styling]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  const panelTitle = (title: string, hint: string) => (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="display text-2xl">{title}</h2>
        <p className="text-sm text-ink-3">{hint}</p>
      </div>
      <button type="button" className="liquid flex size-10 shrink-0 items-center justify-center rounded-xl" onClick={close} aria-label="Cerrar sin guardar">
        <Icon name="close" className="size-4" />
      </button>
    </div>
  );

  // The single form: the look fields and the data fields, the other view's half hidden.
  const form = (
    <form key={round} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="color" value={color ?? ""} />
      <input type="hidden" name="logo" value={logo ?? ""} />

      <div hidden={mode !== "look"} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            Nombre
            <input className="input" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {account.kind !== "cash" && (
            <label className="field">
              Banco o entidad
              <input className="input" name="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
            </label>
          )}
          {(account.kind === "savings" || isCard) && (
            <label className="field">
              Últimos 4 dígitos (opcional)
              <input
                className="input num"
                name="last4"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder="4417"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink-2">Color</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de la tarjeta">
            {swatches.map((hex) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={shown.toUpperCase() === hex.toUpperCase()}
                aria-label={hex === suggested ? `Color del banco ${hex}` : `Color ${hex}`}
                onClick={() => setColor(hex === suggested ? null : hex)}
                className="size-9 rounded-full ring-offset-2 ring-offset-bg transition-transform hover:scale-110 active:scale-95 aria-checked:ring-2 aria-checked:ring-brand"
                style={{ background: hex }}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-ink-2">Imagen</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic"
              className="sr-only"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            <button type="button" className="btn-quiet" onClick={() => fileRef.current?.click()}>
              {logo ? "Cambiar imagen" : "Subir mi imagen"}
            </button>
            {logo && (
              <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={() => setLogo(null)}>
                {autoLogo ? "Volver al logo automático" : "Quitar imagen"}
              </button>
            )}
          </div>
          {imageError && (
            <p role="alert" className="alert">
              {imageError}
            </p>
          )}
          <p className="text-xs text-ink-3">
            {suggested ? `El primer color es el sugerido para ${institution}. ` : ""}
            {autoLogo && !logo ? "El logo de tu banco se pone solo. " : ""}
            Para otra imagen, toca el logo de la tarjeta, arrástrala encima o pégala.
          </p>
        </div>
      </div>

      <div hidden={mode !== "data"} className="flex flex-col gap-5">
        {/* The balance, open like the other numbers: saved with them, as an adjustment if it changed. */}
        {debt && (
          // key: a movement saved meanwhile refreshes the typed field along with `balance_shown`.
          // Out of step, saving the other fields would record an adjustment undoing that movement.
          <div key={balance} className="grid gap-4 rounded-2xl bg-brand/6 p-4 sm:grid-cols-2">
            <input type="hidden" name="balance_shown" value={Math.max(0, balance)} />
            <label className="field">
              Saldo de la deuda hoy
              <MoneyInput name="balance" defaultValue={Math.max(0, balance)} autoFocus={mode === "data" && balanceOpen} />
            </label>
            <label className="field">
              Según el banco a la fecha
              <DateField name="occurred_on" defaultValue={today} max={today} />
            </label>
            <p className="text-xs text-ink-3 sm:col-span-2">
              Si no coincide con el extracto, escribe lo que dice el banco: la cuenta sigue desde ese número, y la diferencia no es gasto ni pago. Lo de días anteriores que registres después ya no lo mueve. Lo de hoy que registres después sí.
            </p>
          </div>
        )}
        {(isCard || isLoan) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {isCard && (
              <>
                <label className="field">
                  Cupo total
                  <MoneyInput name="credit_limit" defaultValue={account.credit_limit} />
                </label>
                <label className="field">
                  Pago mínimo o cuota fija
                  <MoneyInput name="monthly_payment" defaultValue={account.monthly_payment} />
                </label>
                <label className="field">
                  Día de corte
                  <input className="input" type="number" name="statement_day" min={1} max={31} defaultValue={account.statement_day ?? ""} />
                </label>
              </>
            )}
            {isLoan && (
              <>
                <label className="field">
                  Cuota mensual
                  <MoneyInput name="monthly_payment" defaultValue={account.monthly_payment} />
                </label>
                <label className="field">
                  Monto original del préstamo
                  <MoneyInput name="original_amount" defaultValue={account.original_amount} />
                </label>
              </>
            )}
            <label className="field">
              Día límite de pago
              <input className="input" type="number" name="due_day" min={1} max={31} defaultValue={account.due_day ?? ""} />
            </label>
            <label className="field">
              Tasa efectiva anual (%)
              <input className="input" name="annual_rate" inputMode="decimal" defaultValue={account.annual_rate !== null ? String(account.annual_rate).replace(".", ",") : ""} />
            </label>
          </div>
        )}
        {(isCard || isLoan) && (
          <CreditDetailFields
            kind={isCard ? "credit_card" : "loan"}
            termMonths={account.term_months}
            paid={account.term_months && account.first_due_month ? installmentsPaid(account.first_due_month, account.term_months, account.due_day, today) : null}
            rateType={account.rate_type}
            rateReference={account.rate_reference}
            refinanced={account.refinanced}
          />
        )}
      </div>

      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {/* Savings and cash have nothing to save in «Datos» beyond the balance, which has its own form. */}
      {(mode === "look" || debt) && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-quiet h-11" onClick={close}>
            Cancelar
          </button>
          <SubmitButton className="btn h-11">Guardar cambios</SubmitButton>
        </div>
      )}
    </form>
  );

  return (
    <div id="editar" className="flex scroll-mt-4 flex-col gap-3">
      {/* While personalising, the card is the preview and the drop target; its logo spot opens the file picker. */}
      <div
        className={`relative w-full max-w-md rounded-3xl transition ${dragging ? "scale-[1.02] ring-4 ring-brand" : ""}`}
        onDragOver={(e) => {
          if (!styling) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!styling) return;
          e.preventDefault();
          setDragging(false);
          pickImage(e.dataTransfer.files?.[0]);
        }}
      >
        <AccountCard
          account={styling ? preview : account}
          balance={Math.max(0, balance)}
          caption={debt ? "Lo que debes hoy" : "Lo que tienes hoy"}
          size="lg"
          morph={account.id}
        >
          {usage !== null ? <UsageBar usage={usage} onCard /> : null}
        </AccountCard>
        {styling && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rise absolute left-4 top-4 flex size-[3.25rem] items-end justify-end rounded-2xl ring-2 ring-white/70 transition hover:bg-white/10"
            aria-label="Cambiar la imagen de la tarjeta"
          >
            <span aria-hidden="true" className="flex size-6 translate-x-1.5 translate-y-1.5 items-center justify-center rounded-full bg-white text-[#14112E] shadow">
              <Icon name="edit" className="size-3.5" strokeWidth={2.2} />
            </span>
          </button>
        )}
        {dragging && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-brand/70 text-sm font-semibold text-white">
            Suelta la imagen aquí
          </p>
        )}
      </div>

      {mode === null && (
        <>
          <div className="grid w-full max-w-md grid-cols-2 gap-2">
            <button type="button" className="liquid flex items-center gap-3 rounded-2xl p-3 text-left" onClick={() => open("look")}>
              <span className="icon-tile tone-brand" aria-hidden="true">
                <Icon name="palette" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Personalizar</span>
                <span className="block text-xs text-ink-3">Color, imagen y nombre</span>
              </span>
            </button>
            <button type="button" className="liquid flex items-center gap-3 rounded-2xl p-3 text-left" onClick={() => open("data", !debt)}>
              <span className={`icon-tile ${debt ? "tone-owe" : "tone-have"}`} aria-hidden="true">
                <Icon name="adjust" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{debt ? "Datos" : "Saldo"}</span>
                <span className="block text-xs text-ink-3">{DATA_HINT[account.kind]}</span>
              </span>
            </button>
          </div>
          {/* Savings and cash: the favourite account payments come from by default. */}
          {!debt && (
            <form action={toggleFavorite} className="w-full max-w-md">
              <input type="hidden" name="id" value={account.id} />
              <SubmitButton className={`w-full rounded-2xl p-3 text-left text-sm ${account.favorite ? "fab" : "liquid"}`}>
                <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill={account.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
                </svg>
                <span className="ml-1.5 flex flex-col">
                  <span className="font-semibold">{account.favorite ? "Favorita para pagos" : "Hacerla favorita para pagos"}</span>
                  <span className={`text-xs ${account.favorite ? "text-white/80" : "text-ink-3"}`}>
                    {account.favorite ? "Los pagos salen de aquí por defecto. Toca para quitarla." : "Aparece de primera al marcar un pago o registrar un gasto."}
                  </span>
                </span>
              </SubmitButton>
            </form>
          )}
          {saved && (
            <p role="status" className="rise text-sm font-medium text-ink-2">
              ✓ Cambios guardados
            </p>
          )}
          {/* Apart from the balance and the data: deleting is its own decision, asked twice. */}
          <details className="group w-full max-w-md text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1 py-2 font-medium text-ink-3 hover:text-debt [&::-webkit-details-marker]:hidden">
              <Icon name="trash" className="size-4" />
              Eliminar {noun}
            </summary>
            <form action={deleteAccount} className="rise mt-1 flex flex-col gap-3 rounded-2xl border border-debt/30 bg-debt/8 p-4">
              <input type="hidden" name="id" value={account.id} />
              <p className="text-ink-2">
                Se borran también sus {movements} movimientos y deja de contar en tu balance.
                {debt ? " Lo que le pagaste desde tus cuentas sigue descontado de ellas." : ""} No se puede deshacer.
              </p>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="btn-quiet border-debt/50 text-ink">Sí, eliminar</SubmitButton>
              </div>
            </form>
          </details>
        </>
      )}

      {mode === "look" && (
        <div className="card rise flex flex-col gap-5">
          {panelTitle("Personalizar", `Cómo se ve ${noun}. Los cambios se ven en la tarjeta mientras editas.`)}
          {form}
        </div>
      )}

      {mode === "data" && (
        <div className="card rise flex flex-col gap-5">
          {panelTitle(debt ? "Datos" : "Saldo", debt ? `Los números de ${noun}: con ellos se calculan intereses, cupo y cuotas.` : "Cuadra el saldo con lo que ves en el banco.")}
          {/* A debt's balance is one more field of the form; savings and cash have only the balance form. */}
          {debt ? (
            form
          ) : (
            <BalanceAdjuster id={account.id} current={balance} debt={false} today={today} defaultOpen onCancel={close} />
          )}
        </div>
      )}
    </div>
  );
}
