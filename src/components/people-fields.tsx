"use client";

import { useState, useSyncExternalStore } from "react";
import { fromContact, knownByPhone, type Known } from "@/lib/contacts";
import { formatPhone } from "@/lib/phone";
import { Icon } from "./icons";
import { useSocialReady } from "./shared-ready";

interface ContactsManager {
  select(properties: ("name" | "tel")[], options?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
}

const contactsManager = () => (navigator as Navigator & { contacts?: ContactsManager }).contacts;
const never = () => () => {};
/** The phone's contact picker exists in Chrome for Android; Safari on iPhone keeps it off. */
const useCanPickContacts = () => useSyncExternalStore(never, () => typeof contactsManager()?.select === "function", () => false);

interface Person {
  key: number;
  name: string;
  phone: string;
  /** Chosen from «Con quienes ya divides». */
  known?: Known;
}

/**
 * Who to divide with: from the phone's contacts where the browser allows it, from the people one
 * already divides with, or typed. Sends `person`, `phone` and `known` once for each.
 */
export function PeopleFields({ known, single = false, optional = false }: { known: Known[]; single?: boolean; optional?: boolean }) {
  const canPick = useCanPickContacts();
  const social = useSocialReady();
  const [people, setPeople] = useState<Person[]>([{ key: 0, name: "", phone: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);

  function add(found: Omit<Person, "key">[]) {
    if (found.length === 0) return;
    const fresh = found.map((p, i) => ({ ...p, key: nextKey + i }));
    setNextKey(nextKey + found.length);
    setPeople((old) => {
      if (single) return fresh.slice(0, 1);
      const filled = old.filter((p) => p.name.trim() || p.phone.trim());
      const isNew = fresh.filter((p) => !p.phone || !filled.some((o) => o.phone === p.phone));
      return [...filled, ...isNew].slice(0, 29);
    });
  }

  async function pick() {
    setProblem(null);
    try {
      const found = (await contactsManager()!.select(["name", "tel"], { multiple: !single })).map(fromContact).filter((p) => p.name);
      add(found.map(({ name, phone }) => ({ name, phone: formatPhone(phone) })));
    } catch {
      setProblem("No pudimos abrir tus contactos. Escribe el nombre y el número.");
    }
  }

  const edit = (key: number, change: Partial<Person>) => setPeople((old) => old.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const offered = known.filter((k) => !people.some((p) => p.known?.member === k.member)).slice(0, 24);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-ink-2">{single ? "A quién agregas" : optional ? "Quiénes viven ahí (opcional: también después)" : "Con quién divides"}</legend>
      {canPick && (
        <button type="button" className="btn-quiet h-11 gap-2 self-start" onClick={pick}>
          <Icon name="plus" className="size-4" />
          Elegir de mis contactos
        </button>
      )}
      {offered.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-3">Con quienes ya divides</p>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((k) => (
              <button key={k.member} type="button" className="chip max-w-full truncate" onClick={() => add([{ name: k.name, phone: formatPhone(k.phone), known: k }])}>
                + {k.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {people.map((person, i) => {
          const account = person.known?.userId ? person.known : knownByPhone(known, person.phone);
          return (
            <li key={person.key} className="flex flex-col gap-1.5">
              <input type="hidden" name="known" value={account?.member ?? ""} />
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <input
                    className="input"
                    name="person"
                    value={person.name}
                    onChange={(e) => edit(person.key, { name: e.target.value })}
                    placeholder="Nombre, como lo tienes en contactos"
                    aria-label={`Nombre de la persona ${i + 1}`}
                    maxLength={60}
                    autoComplete="off"
                    required={i === 0 && !optional}
                  />
                  <input
                    className="input num"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={person.phone}
                    // Another number is another person.
                    onChange={(e) => edit(person.key, { phone: e.target.value, known: undefined })}
                    placeholder="Celular"
                    aria-label={`Celular de la persona ${i + 1}`}
                    maxLength={22}
                    autoComplete="off"
                  />
                </div>
                {!single && people.length > 1 && (
                  <button type="button" className="flex size-11 shrink-0 items-center justify-center text-ink-3 hover:text-ink" onClick={() => setPeople(people.filter((p) => p.key !== person.key))} aria-label={`Quitar a ${person.name || `la persona ${i + 1}`}`}>
                    <Icon name="close" className="size-4" />
                  </button>
                )}
              </div>
              {account && <p className="text-xs font-medium text-brand">Ya está en Guaca: le llega la invitación en la app.</p>}
            </li>
          );
        })}
      </ul>
      {!single && people.length < 29 && (
        <button
          type="button"
          className="self-start py-1 text-sm font-semibold text-brand"
          onClick={() => {
            setPeople([...people, { key: nextKey, name: "", phone: "" }]);
            setNextKey(nextKey + 1);
          }}
        >
          + Agregar otra persona
        </button>
      )}
      <p className="text-xs text-ink-3">
        {single ? "La otra persona" : "El grupo"} ve el nombre; el celular solo lo ves tú.
        {social && " Si esa persona tiene ese celular en su perfil de Guaca le aparece la invitación, y tú confirmas antes de que entre."}
        {!canPick && " Este navegador no deja abrir tus contactos: copia el número desde tu agenda. La próxima vez la persona te aparece aquí."}
      </p>
      {problem && (
        <p role="alert" className="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}
