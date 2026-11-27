"use client";

import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES } from "@/lib/finance";
import { useAnchoredPopover, useFinePointer } from "./use-anchored-popover";

export interface PickOption {
  value: string;
  label: string;
  /** Options with the same group are listed under that heading. */
  group?: string;
  /** The favourite account, marked with a star. */
  star?: boolean;
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-label="Favorita">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="#FFC83D" stroke="#E0A100" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The phone's own select. After a form is sent React resets it, and a select then goes back to
 * its default option (the first one) while the state still holds the choice: the next try would
 * save another account. Keeping the choice as the default makes the reset harmless.
 */
function NativeSelect({ value, onPick, children, ...rest }: { value: string; onPick: (value: string) => void; children: React.ReactNode; name?: string; required?: boolean }) {
  const select = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    const el = select.current;
    if (!el) return;
    for (const option of el.options) option.defaultSelected = option.value === value;
    if ([...el.options].some((option) => option.value === value)) el.value = value;
  });
  return (
    <select ref={select} className="input" value={value} onChange={(e) => onPick(e.target.value)} {...rest}>
      {children}
    </select>
  );
}

/**
 * A select in Guaca's look on computers (grouped options, the favourite starred, the chosen one
 * ticked, arrows / Enter / Esc); the phone's native picker on touch screens. Submits `value`
 * under `name`, like `<select>`.
 */
export function SelectField({
  name,
  options,
  defaultValue = "",
  value: controlled,
  onChange,
  required,
  placeholder = "Elige una opción",
}: {
  name: string;
  options: PickOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const fine = useFinePointer();
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const set = (v: string) => {
    if (controlled === undefined) setOwn(v);
    onChange?.(v);
  };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { box, popRef, host, place } = useAnchoredPopover({ open, onClose: () => setOpen(false), width: "anchor" });
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  if (!fine) {
    return (
      <NativeSelect name={name} value={value} onPick={set} required={required}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.star ? `★ ${o.label}` : o.label}
          </option>
        ))}
      </NativeSelect>
    );
  }

  const chosen = options.find((o) => o.value === value);
  const grouped = new Set(options.map((o) => o.group).filter(Boolean)).size > 1;

  function openList() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
    requestAnimationFrame(() => list.current?.focus());
  }

  function pick(v: string) {
    set(v);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="input flex items-center justify-between gap-2 text-left"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
      >
        <span className={`flex min-w-0 items-center gap-1.5 ${chosen ? "" : "text-ink-3"}`}>
          {chosen?.star && <Star />}
          <span className="truncate">{chosen?.label ?? placeholder}</span>
        </span>
        <Chevron />
      </button>
      {required && (
        <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" required value={value} onChange={() => {}} onInvalid={openList} />
      )}
      {open &&
        host &&
        createPortal(
            <div ref={popRef} popover="manual" style={place} className="date-pop rise fixed z-[90] m-0 max-h-[min(22rem,60vh)] overflow-y-auto rounded-2xl p-1.5 outline-none">
              <div
                ref={list}
                id={id}
                role="listbox"
                tabIndex={-1}
                aria-activedescendant={`${id}-${active}`}
                className="outline-none"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
                  else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
                  else if (e.key === "Enter") pick(options[active].value);
                  else return;
                  e.preventDefault();
                }}
              >
                {options.map((o, i) => (
                  <div key={o.value}>
                    {grouped && o.group && o.group !== options[i - 1]?.group && (
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{o.group}</p>
                    )}
                    <div
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={o.value === value}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => pick(o.value)}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${i === active ? "bg-brand/10" : ""} ${o.value === value ? "font-semibold text-ink" : "text-ink-2"}`}
                    >
                      {o.star && <Star />}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.value === value && <Tick />}
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            host,
        )}
    </div>
  );
}

/** The categories to offer: the app's own plus every one the person has used. Filled by the app frame. */
const CategoriesContext = createContext<string[]>(CATEGORIES);

export function CategoriesProvider({ categories, children }: { categories: string[]; children: React.ReactNode }) {
  return <CategoriesContext.Provider value={categories}>{children}</CategoriesContext.Provider>;
}

interface CategoryProps {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  /** Not offered (the categories that already have a budget). */
  exclude?: string[];
}

/** The categories offered: the app's and the person's own, minus the excluded ones. */
function useCategories(exclude?: string[]) {
  const all = useContext(CategoriesContext);
  return useMemo(() => (exclude?.length ? all.filter((c) => !exclude.some((x) => x.toLocaleLowerCase("es") === c.toLocaleLowerCase("es"))) : all), [all, exclude]);
}

/** A category: the combobox with a mouse or trackpad, the phone's own picker on touch screens. */
export function CategoryField(props: CategoryProps) {
  return useFinePointer() ? <CategoryCombobox {...props} /> : <CategorySelect {...props} />;
}

const NEW_CATEGORY = "__nueva__";

/** On touch screens: the native picker, ending in a way to write a category that is not there yet. */
function CategorySelect({ name, defaultValue = "", required, exclude }: CategoryProps) {
  const categories = useCategories(exclude);
  const [value, setValue] = useState(defaultValue);
  const [writing, setWriting] = useState<string | null>(null);

  if (writing !== null) {
    return (
      <>
        <input
          className="input"
          name={name}
          value={writing}
          onChange={(e) => setWriting(e.target.value)}
          placeholder="Nombre de la categoría"
          autoComplete="off"
          autoFocus
          required={required}
        />
        <button type="button" data-category-list className="self-start py-1 text-sm font-semibold text-brand" onClick={() => setWriting(null)}>
          Elegir de la lista
        </button>
      </>
    );
  }
  // One saved before and no longer in the list still shows as chosen.
  const options = !value || categories.includes(value) ? categories : [value, ...categories];
  return (
    <NativeSelect name={name} value={value} required={required} onPick={(v) => (v === NEW_CATEGORY ? setWriting("") : setValue(v))}>
      <option value="">{required ? "Elige una categoría" : "Sin categoría"}</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
    </NativeSelect>
  );
}

/**
 * With a mouse: type to filter the list of existing ones (the app's and the person's own), pick
 * one, or keep a new one with «Agregar».
 */
function CategoryCombobox({ name, defaultValue = "", required, placeholder = "Escribe o elige", exclude }: CategoryProps) {
  const categories = useCategories(exclude);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState<string | null>(null); // null: show all (just opened)
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { box, popRef, host, place } = useAnchoredPopover({ open, onClose: () => setOpen(false), width: "anchor" });
  const id = useId();

  const typed = (query ?? "").trim();
  const shown = useMemo(() => {
    const q = typed.toLocaleLowerCase("es");
    return q ? categories.filter((c) => c.toLocaleLowerCase("es").includes(q)) : categories;
  }, [categories, typed]);
  const isNew = typed !== "" && !categories.some((c) => c.toLocaleLowerCase("es") === typed.toLocaleLowerCase("es"));
  // Typing a new one offers to add it; otherwise the list ends with a way to start a new one.
  const items = [
    ...(isNew ? [{ value: typed, add: true, start: false }] : []),
    ...shown.map((c) => ({ value: c, add: false, start: false })),
    ...(query === null ? [{ value: "", add: false, start: true }] : []),
  ];
  const input = useRef<HTMLInputElement>(null);

  function pick(v: string) {
    setValue(v);
    setQuery(null);
    setOpen(false);
  }

  /** «+ Nueva categoría»: empty the field and keep it open to type the new name. */
  function startNew() {
    setValue("");
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={input}
        className="input pr-9"
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        onFocus={() => {
          setQuery(null);
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setValue(e.target.value);
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
          else if (e.key === "Enter" && items[active]) {
            if (items[active].start) startNew();
            else pick(items[active].value);
          }
          else if (e.key === "Tab") return setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <Chevron />
      </span>
      {open &&
        host &&
        items.length > 0 &&
        createPortal(
            <div ref={popRef} popover="manual" style={place} className="date-pop rise fixed z-[90] m-0 max-h-[min(20rem,55vh)] overflow-y-auto rounded-2xl p-1.5">
              <div id={id} role="listbox">
                {items.map((item, i) => (
                  <div
                    key={item.start ? "+nueva" : `${item.add ? "+" : ""}${item.value}`}
                    role="option"
                    aria-selected={item.value === value}
                    onPointerEnter={() => setActive(i)}
                    // Before the field loses focus, so the pick lands.
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (item.start) startNew();
                      else pick(item.value);
                    }}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${i === active ? "bg-brand/10" : ""} ${item.value === value ? "font-semibold text-ink" : "text-ink-2"}`}
                  >
                    {item.start ? (
                      <span className="font-semibold text-brand">+ Nueva categoría</span>
                    ) : item.add ? (
                      <span className="font-semibold text-brand">+ Agregar «{item.value}»</span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">{item.value}</span>
                        {item.value === value && <Tick />}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>,
            host,
        )}
    </div>
  );
}
