"use client";

import { useEffect, useRef, useState } from "react";
import { formatCOP } from "@/lib/finance";
import {
  SPLIT_MODES,
  computeShares,
  formatHundredths,
  matchingQuick,
  outcome,
  parseHundredths,
  quickSplits,
  splitTitle,
  type QuickSplit,
  type Share,
  type Split,
  type SplitMode,
} from "@/lib/split";
import { useModalBack } from "./modal";
import { MoneyInput } from "./money-input";
import { SelectField } from "./pickers";

type Person = { id: string; name: string };

/** What is on screen for each way, so moving between them loses nothing typed. */
export interface SplitDraft {
  paidBy: string;
  mode: SplitMode;
  /** The order of the split: the pesos that do not divide go to the first. */
  order: string[];
  included: string[];
  exact: Record<string, number>;
  percent: Record<string, string>;
  weight: Record<string, string>;
  adjust: Record<string, number>;
  minus: Record<string, boolean>;
}

export function newDraft(members: Person[], paidBy: string, from?: Split): SplitDraft {
  const ids = members.map((m) => m.id);
  const inSplit = from?.parts.map((p) => p.id) ?? ids;
  const values = (mode: SplitMode) => (from?.mode === mode ? from.parts : []);
  return {
    paidBy,
    mode: from?.mode ?? "equal",
    order: [...inSplit, ...ids.filter((id) => !inSplit.includes(id))],
    included: from && (from.mode === "equal" || from.mode === "adjust") ? inSplit : ids,
    exact: Object.fromEntries(values("exact").map((p) => [p.id, p.value])),
    percent: Object.fromEntries(values("percent").map((p) => [p.id, formatHundredths(p.value)])),
    // Everyone starts with one part; someone left out of a saved split, with none.
    weight: Object.fromEntries(
      ids.map((id) => [id, from?.mode === "shares" ? formatHundredths(from.parts.find((p) => p.id === id)?.value ?? 0) : "1"]),
    ),
    adjust: Object.fromEntries(values("adjust").map((p) => [p.id, Math.abs(p.value)])),
    minus: Object.fromEntries(values("adjust").map((p) => [p.id, p.value < 0])),
  };
}

/** The split a draft means, or null while a number in it cannot be read. */
export function draftSplit(d: SplitDraft): Split | null {
  const chosen = d.order.filter((id) => d.included.includes(id));
  if (d.mode === "equal") return { mode: d.mode, parts: chosen.map((id) => ({ id, value: 0 })) };
  if (d.mode === "adjust") return { mode: d.mode, parts: chosen.map((id) => ({ id, value: (d.minus[id] ? -1 : 1) * (d.adjust[id] ?? 0) })) };
  const parts: Split["parts"] = [];
  for (const id of d.order) {
    const value = d.mode === "exact" ? (d.exact[id] ?? 0) : parseHundredths((d.mode === "percent" ? d.percent[id] : d.weight[id]) ?? "");
    if (value === null) return null;
    if (value > 0) parts.push({ id, value });
  }
  return { mode: d.mode, parts };
}

/** The pesos of each person now; none while it does not add up. */
export function draftShares(d: SplitDraft, amount: number): Share[] | null {
  const split = draftSplit(d);
  const result = split && computeShares(amount, split);
  return result?.ok ? result.shares : null;
}

const COLORS = 7;

/** A person's colour: theirs in the group, the same in the bar and on their initials. */
const colorOf = (index: number) => (index < COLORS ? `var(--cat-${index + 1})` : "var(--cat-other)");

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return [words[0], words.length > 1 ? words[words.length - 1] : ""].map((w) => Array.from(w)[0] ?? "").join("").toLocaleUpperCase("es");
}

export function Avatar({ name, index, ring, tone = "have" }: { name: string; index: number; ring?: number; tone?: "have" | "owe" }) {
  const face = (
    // Their colour on the edge, the initials in ink: white on yellow or pink cannot be read.
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] text-sm font-bold text-ink"
      style={{ borderColor: colorOf(index), background: `color-mix(in srgb, ${colorOf(index)} 22%, var(--surface))` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
  if (ring === undefined) return face;
  const color = tone === "have" ? "var(--savings)" : "var(--debt)";
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full p-[3px]" style={{ background: `conic-gradient(${color} ${ring * 360}deg, var(--line) 0)` }} aria-hidden="true">
      <span className="rounded-full bg-surface p-px">{face}</span>
    </span>
  );
}

// Green and orange darkened towards the ink: readable as text in both themes.
const OWED = { color: "color-mix(in oklab, var(--savings) 55%, var(--ink))" };
const OWES = { color: "color-mix(in oklab, var(--debt) 60%, var(--ink))" };

function quickTitle(key: QuickSplit["key"], other: string) {
  if (key === "i-paid-half") return "Pagaste tú, por partes iguales";
  if (key === "i-am-owed-all") return "Te deben el total";
  if (key === "other-paid-half") return `Pagó ${other}, por partes iguales`;
  return `A ${other} le deben el total`;
}

/** How it is being split, in one line, and what it leaves for oneself: the row that opens the panel. */
export function splitSummary(d: SplitDraft, amount: number, members: Person[], me: string) {
  const other = members.length === 2 ? members.find((m) => m.id !== me) : undefined;
  const split = draftSplit(d);
  const quick = other && split ? matchingQuick(quickSplits(me, other.id), d.paidBy, split) : undefined;
  const payer = d.paidBy === me ? "Pagaste tú" : `Pagó ${members.find((m) => m.id === d.paidBy)?.name ?? ""}`;
  const title = quick && other ? quickTitle(quick.key, other.name) : `${payer}, ${splitTitle(d.mode).toLocaleLowerCase("es")}`;
  if (!amount) return { title, detail: "Escribe cuánto fue para ver cuánto le toca a cada quien.", style: undefined };
  const shares = draftShares(d, amount);
  if (!shares) return { title, detail: "No cuadra con el total: toca para revisarlo.", style: OWES };
  return { title, ...result(outcome(amount, d.paidBy, shares, me), other?.name) };
}

function result(net: number, other?: string) {
  if (net > 0) return { detail: other ? `${other} te debe ${formatCOP(net)}` : `Te deben ${formatCOP(net)}`, style: OWED };
  if (net < 0) return { detail: other ? `Le debes ${formatCOP(-net)} a ${other}` : `Debes ${formatCOP(-net)}`, style: OWES };
  return { detail: "No debes ni te deben", style: undefined };
}

const SYMBOL: Record<SplitMode, React.ReactNode> = {
  equal: "=",
  exact: "$",
  percent: "%",
  shares: (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M3 10h5v11H3zM9.5 4h5v17h-5zM16 13h5v8h-5z" />
    </svg>
  ),
  adjust: "+/−",
};

/**
 * «¿Cómo se dividió?»: between two, the four usual answers and «Más opciones»; with more people,
 * straight to the five ways. Changes are live, and «Volver» puts back what there was.
 */
export function SplitPanel({
  amount,
  members,
  me,
  draft,
  onChange,
  onClose,
  fixedPayer,
}: {
  amount: number;
  members: Person[];
  me: string;
  draft: SplitDraft;
  onChange: (draft: SplitDraft) => void;
  onClose: () => void;
  /** Who paid cannot change (one's own movement, or someone else recorded it). */
  fixedPayer: boolean;
}) {
  const other = members.length === 2 ? members.find((m) => m.id !== me) : undefined;
  const [view, setView] = useState<"quick" | "options">(other ? "quick" : "options");
  const [before] = useState(draft);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const sheet = heading.current?.closest("dialog");
    sheet?.scrollTo({ top: 0 });
    // Outside a window (dividing a movement) the page itself has to move up to it.
    heading.current?.focus({ preventScroll: Boolean(sheet) });
  }, [view]);

  const indexOf = new Map(members.map((m, i) => [m.id, i]));

  function back() {
    onChange(before);
    if (view === "options" && other) setView("quick");
    else onClose();
  }
  useModalBack(back);

  const header = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <button type="button" className="justify-self-start py-2 text-sm font-semibold text-brand" onClick={back}>
        ‹ Volver
      </button>
      <h3 ref={heading} tabIndex={-1} className="display text-center text-lg outline-none">
        {view === "quick" ? "¿Cómo se dividió?" : "Opciones de división"}
      </h3>
      <span />
    </div>
  );

  if (view === "quick" && other) {
    const options = quickSplits(me, other.id).filter((o) => !fixedPayer || o.paidBy === draft.paidBy);
    const current = draftSplit(draft);
    const chosen = current ? matchingQuick(options, draft.paidBy, current) : undefined;
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ul role="radiogroup" aria-label="Cómo se dividió" className="divide-y divide-line">
          {options.map((option) => {
            const shares = amount ? computeShares(amount, option.split) : null;
            const net = shares?.ok ? outcome(amount, option.paidBy, shares.shares, me) : null;
            const iPaid = option.paidBy === me;
            const whole = option.split.parts.length === 1;
            const people = [members.find((m) => m.id === me)!, other];
            if (!iPaid) people.reverse();
            const { detail, style } = net === null ? { detail: "", style: undefined } : result(net, other.name);
            return (
              <li key={option.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen === option}
                  data-quick={option.key}
                  className="flex w-full items-center gap-3 py-3.5 text-left"
                  onClick={() => {
                    const ids = option.split.parts.map((p) => p.id);
                    onChange({ ...draft, paidBy: option.paidBy, mode: "equal", included: ids });
                    onClose();
                  }}
                >
                  <span className="flex shrink-0 items-center -space-x-2.5">
                    {/* Who paid wears the ring: as much of it as they are owed. */}
                    <span className="relative z-10">
                      <Avatar name={people[0].name} index={indexOf.get(people[0].id)!} ring={whole ? 1 : 0.5} tone={iPaid ? "have" : "owe"} />
                    </span>
                    <Avatar name={people[1].name} index={indexOf.get(people[1].id)!} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{quickTitle(option.key, other.name)}</span>
                    {detail && (
                      <span className="num block text-sm font-medium" style={style}>
                        {detail}
                      </span>
                    )}
                  </span>
                  {chosen === option && (
                    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-quiet h-11 self-center rounded-full px-6" onClick={() => setView("options")}>
          Más opciones
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Options amount={amount} members={members} me={me} draft={draft} onChange={onChange} onClose={onClose} fixedPayer={fixedPayer} />
    </div>
  );
}

function Options({
  amount,
  members,
  me,
  draft,
  onChange,
  onClose,
  fixedPayer,
}: {
  amount: number;
  members: Person[];
  me: string;
  draft: SplitDraft;
  onChange: (draft: SplitDraft) => void;
  onClose: () => void;
  fixedPayer: boolean;
}) {
  const { mode } = draft;
  const indexOf = new Map(members.map((m, i) => [m.id, i]));
  const payer = members.find((m) => m.id === draft.paidBy);
  const shares = draftShares(draft, amount);
  const shareOf = new Map(shares?.map((s) => [s.member_id, s.amount]));
  const split = draftSplit(draft);
  // Before there is an amount only the numbers can be checked: percentages that add up, some part.
  const valid = amount ? shares !== null : mode !== "exact" && mode !== "adjust" && split !== null && computeShares(1_000_000, split).ok;
  const label = (m: Person) => (m.id === me ? `${m.name} (tú)` : m.name);
  const ordered = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  const picks = mode === "equal" || mode === "adjust";
  const everyone = draft.included.length === members.length;
  const toggle = (id: string) => onChange({ ...draft, included: draft.included.includes(id) ? draft.included.filter((x) => x !== id) : [...draft.included, id] });
  const current = SPLIT_MODES.find((m) => m.mode === mode)!;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line pb-3">
        {payer && <Avatar name={payer.name} index={indexOf.get(payer.id)!} />}
        {fixedPayer ? (
          <p className="text-sm text-ink-2">
            Pagó <strong className="text-ink">{payer ? label(payer) : ""}</strong>
          </p>
        ) : (
          <label className="field min-w-0 flex-1">
            Quién pagó
            <SelectField name="payer" value={draft.paidBy} onChange={(paidBy) => onChange({ ...draft, paidBy })} options={members.map((m) => ({ value: m.id, label: label(m) }))} />
          </label>
        )}
      </div>

      {/* The split drawn: each person's piece in their colour, the same as their initials below. */}
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        {shares &&
          ordered
            .filter((m) => shareOf.has(m.id))
            .map((m) => <span key={m.id} className="h-full min-w-1 transition-[flex-grow] duration-300" style={{ background: colorOf(indexOf.get(m.id)!), flexGrow: shareOf.get(m.id)! / amount, flexBasis: 0 }} />)}
      </div>

      <div className="text-center" aria-live="polite">
        <p className="font-semibold text-ink">{current.title}</p>
        <p className="text-balance text-sm text-ink-2">{current.hint}</p>
      </div>

      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Forma de dividir">
        {SPLIT_MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={mode === m.mode}
            aria-label={m.title}
            title={m.title}
            data-mode={m.mode}
            className={`flex h-12 items-center justify-center rounded-xl border text-lg font-bold transition-colors ${mode === m.mode ? "border-transparent bg-[linear-gradient(135deg,#6d4aff,#9a34e6)] text-white" : "border-line-strong text-ink-2 hover:text-ink"}`}
            onClick={() => onChange({ ...draft, mode: m.mode })}
          >
            {SYMBOL[m.mode]}
          </button>
        ))}
      </div>

      <ul key={mode} className="divide-y divide-line">
        {ordered.map((m) => {
          const on = !picks || draft.included.includes(m.id);
          const who = (
            <>
              <Avatar name={m.name} index={indexOf.get(m.id)!} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${on ? "text-ink" : "text-ink-3"}`}>{label(m)}</span>
                {mode !== "exact" && amount > 0 && shares && <span className="num block text-xs text-ink-3">{formatCOP(shareOf.get(m.id) ?? 0)}</span>}
              </span>
            </>
          );
          const check = (
            <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${on ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
              {on ? "✓" : ""}
            </span>
          );
          return (
            <li key={m.id} className="flex min-h-16 flex-wrap items-center justify-end gap-2 py-2" data-person={m.id === me ? "me" : m.name}>
              {picks ? (
                <button type="button" role="checkbox" aria-checked={on} className="flex min-w-40 flex-1 items-center gap-3 text-left" onClick={() => toggle(m.id)}>
                  {who}
                  {check}
                </button>
              ) : (
                <span className="flex min-w-40 flex-1 items-center gap-3">{who}</span>
              )}

              {mode === "exact" && (
                <span className="w-32 shrink-0">
                  <MoneyInput
                    name={`share-${m.id}`}
                    label={`Cuánto le toca a ${m.name}`}
                    defaultValue={draft.exact[m.id] || ""}
                    onValue={(pesos) => onChange({ ...draft, exact: { ...draft.exact, [m.id]: pesos } })}
                  />
                </span>
              )}
              {mode === "percent" && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="w-20">
                    <input
                      className="input num text-right"
                      name={`percent-${m.id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`Porcentaje de ${m.name}`}
                      value={draft.percent[m.id] ?? ""}
                      onChange={(e) => parseHundredths(e.target.value) !== null && onChange({ ...draft, percent: { ...draft.percent, [m.id]: e.target.value } })}
                    />
                  </span>
                  <span className="text-sm text-ink-3">%</span>
                </span>
              )}
              {mode === "shares" && (
                <span className="flex shrink-0 items-center gap-1">
                  {([-1, 0, 1] as const).map((by) =>
                    by === 0 ? (
                      <span key={by} className="w-14">
                        <input
                          className="input num px-1 text-center"
                          name={`weight-${m.id}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          aria-label={`Partes de ${m.name}`}
                          value={draft.weight[m.id] ?? ""}
                          onChange={(e) => parseHundredths(e.target.value) !== null && onChange({ ...draft, weight: { ...draft.weight, [m.id]: e.target.value } })}
                        />
                      </span>
                    ) : (
                      <button
                        key={by}
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full border border-line-strong text-lg text-ink-2"
                        aria-label={`${by > 0 ? "Una parte más" : "Una parte menos"} para ${m.name}`}
                        onClick={() => {
                          const next = Math.max(0, (parseHundredths(draft.weight[m.id] ?? "") ?? 0) + by * 100);
                          onChange({ ...draft, weight: { ...draft.weight, [m.id]: formatHundredths(next) } });
                        }}
                      >
                        {by > 0 ? "+" : "−"}
                      </button>
                    ),
                  )}
                </span>
              )}
              {mode === "adjust" && on && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full border border-line-strong text-lg text-ink-2"
                    aria-label={`${draft.minus[m.id] ? "Resta" : "Suma"} para ${m.name}. Cambiar`}
                    onClick={() => onChange({ ...draft, minus: { ...draft.minus, [m.id]: !draft.minus[m.id] } })}
                  >
                    {draft.minus[m.id] ? "−" : "+"}
                  </button>
                  <span className="w-28">
                    <MoneyInput
                      name={`adjust-${m.id}`}
                      label={`Ajuste de ${m.name}`}
                      defaultValue={draft.adjust[m.id] || ""}
                      onValue={(pesos) => onChange({ ...draft, adjust: { ...draft.adjust, [m.id]: pesos } })}
                    />
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="split-footer flex items-center justify-between gap-3 border-t border-line py-3">
        <p className="num min-w-0 text-sm text-ink-2" role="status" data-split-total>
          <Total draft={draft} amount={amount} split={split} />
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {mode === "equal" && (
            <button type="button" className="btn-quiet h-11" aria-pressed={everyone} onClick={() => onChange({ ...draft, included: everyone ? [] : members.map((m) => m.id) })}>
              Todos
              <span aria-hidden="true" className={`ml-2 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${everyone ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                {everyone ? "✓" : ""}
              </span>
            </button>
          )}
          <button type="button" className="btn h-11 px-5" disabled={!valid} onClick={onClose}>
            Listo
          </button>
        </span>
      </div>
    </>
  );
}

/** The running count at the foot of each way. */
function Total({ draft, amount, split }: { draft: SplitDraft; amount: number; split: Split | null }) {
  const total = split?.parts.reduce((sum, p) => sum + p.value, 0) ?? 0;
  const people = split?.parts.length ?? 0;
  const strong = (text: string) => <strong className="block text-ink">{text}</strong>;
  const left = (missing: number, show: (n: number) => string) => (missing === 0 ? "✓ Suma el total" : missing > 0 ? `Faltan ${show(missing)}` : `Sobran ${show(-missing)}`);

  if (draft.mode === "percent") {
    const show = (n: number) => `${formatHundredths(n)} %`;
    return (
      <>
        {strong(`${show(total)} de 100 %`)}
        {left(10_000 - total, show)}
      </>
    );
  }
  if (!amount && (draft.mode === "exact" || draft.mode === "adjust")) return <>Vuelve y escribe cuánto fue.</>;
  if (draft.mode === "exact") {
    return (
      <>
        {strong(`${formatCOP(total)} de ${formatCOP(amount)}`)}
        {left(amount - total, formatCOP)}
      </>
    );
  }
  if (draft.mode === "shares") {
    return (
      <>
        {strong(`${formatHundredths(total)} ${total === 100 ? "parte" : "partes"}`)}
        {amount && total ? `${formatCOP(Math.round((amount * 100) / total))} cada parte` : "en total"}
      </>
    );
  }
  if (!people) return <>Elige al menos una persona.</>;
  const each = Math.floor((amount - (draft.mode === "adjust" ? total : 0)) / people);
  if (draft.mode === "adjust") {
    const problem = split && computeShares(amount, split);
    if (problem && !problem.ok) return <>{problem.error}</>;
    return (
      <>
        {strong(`${formatCOP(each)} por persona`)}
        más o menos su ajuste
      </>
    );
  }
  return (
    <>
      {strong(amount ? `${formatCOP(each)} por persona` : "Por partes iguales")}({people} {people === 1 ? "persona" : "personas"})
    </>
  );
}
