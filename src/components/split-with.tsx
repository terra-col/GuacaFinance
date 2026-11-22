"use client";

import { useEffect, useRef, useState } from "react";
import { loadSplitTargets } from "@/app/shared-actions";
import { PENDING_ME, PENDING_OTHER, type SplitTarget } from "@/lib/people";
import { Icon } from "./icons";
import { PeopleFields } from "./people-fields";
import { Avatar, newDraft, splitSummary, type SplitDraft } from "./split-panel";
import { Spinner } from "./submit-button";

/** With whom a movement being recorded is divided, and how. */
export interface Dividing {
  target: SplitTarget;
  draft: SplitDraft;
}

const NEW_PERSON = "new";

/**
 * «¿Con quién?», inside «Registrar movimiento»: the people, the groups, or someone new. Nothing is
 * created until the movement is saved.
 */
export function SplitWith({
  value,
  onChange,
  amount,
  onOpenSplit,
}: {
  value: Dividing | null;
  onChange: (value: Dividing | null) => void;
  amount: number;
  onOpenSplit: () => void;
}) {
  const [found, setFound] = useState<{ targets: SplitTarget[]; name: string; social: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const box = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    let on = true;
    loadSplitTargets().then(
      (result) => on && setFound(result),
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, [round]);

  // What opens below the button would stay out of sight at the foot of the sheet.
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [found]);

  const choose = (target: SplitTarget) => onChange({ target, draft: newDraft(target.members, target.me) });
  const chosen = value?.target;
  const summary = value && splitSummary(value.draft, amount, value.target.members, value.target.me);

  return (
    <fieldset ref={box} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line-strong p-3" data-split-with>
      <legend className="px-1 text-sm font-semibold text-ink">¿Con quién lo divides?</legend>
      {failed ? (
        <p className="text-sm text-ink-2">
          No pudimos cargar tus personas.{" "}
          <button
            type="button"
            className="font-semibold text-brand"
            onClick={() => {
              setFailed(false);
              setRound(round + 1);
            }}
          >
            Intentar de nuevo
          </button>
        </p>
      ) : !found ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-3">
          <Spinner /> Buscando tus personas y grupos…
        </p>
      ) : chosen ? (
        <>
          <div className="flex items-center gap-2.5">
            <Avatar name={chosen.key === NEW_PERSON ? "+" : chosen.name} index={chosen.kind === "group" ? 6 : 1} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{chosen.name}</p>
            <button type="button" className="shrink-0 text-sm font-semibold text-brand" onClick={() => onChange(null)}>
              Cambiar
            </button>
          </div>
          {chosen.key === NEW_PERSON && <PeopleFields known={[]} single />}
          <button type="button" data-split-open className="flex w-full items-center gap-3 rounded-2xl bg-brand/8 p-3 text-left" onClick={onOpenSplit}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{summary?.title}</span>
              <span className="num block text-sm text-ink-2" style={summary?.style}>
                {summary?.detail}
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-brand">
              ›
            </span>
          </button>
        </>
      ) : (
        <ul className="-my-1 max-h-64 divide-y divide-line overflow-y-auto">
          {found.targets.map((target) => (
            <li key={target.key}>
              <button type="button" data-target={target.name} className="flex w-full items-center gap-3 py-2 text-left" onClick={() => choose(target)}>
                <Avatar name={target.name} index={target.kind === "group" ? 6 : 1} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{target.name}</span>
                  <span className="block text-xs text-ink-3">{target.kind === "group" ? `Grupo de ${target.members.length}` : "Solo ustedes dos"}</span>
                </span>
                <span aria-hidden="true" className="pr-1 text-brand">
                  ›
                </span>
              </button>
            </li>
          ))}
          {found.social && (
            <li>
              <button
                type="button"
                data-target-new
                className="flex w-full items-center gap-3 py-2 text-left text-sm font-semibold text-brand"
                onClick={() =>
                  choose({
                    key: NEW_PERSON,
                    kind: "person",
                    name: "Otra persona",
                    group: null,
                    person: null,
                    members: [
                      { id: PENDING_ME, name: found.name },
                      { id: PENDING_OTHER, name: "Esa persona" },
                    ],
                    me: PENDING_ME,
                  })
                }
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-brand">
                  <Icon name="plus" className="size-4" />
                </span>
                Otra persona
              </button>
            </li>
          )}
          {!found.social && found.targets.length === 0 && <li className="py-2 text-sm text-ink-2">Primero crea un grupo en Movimientos, en Compartidos.</li>}
        </ul>
      )}
    </fieldset>
  );
}
