"use client";

import { useEffect, useId, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "./icons";
import { SwipeRow } from "./swipe-row";

const OPENED = "guaca:entry-swiped";

/**
 * A group's or a person's expense or payment that slides left, as in Movimientos. Its two
 * actions open the row's own Editar and Borrar (Borrar still asks before deleting).
 */
export function EntrySwipe({ canEdit, canDelete, children }: { canEdit: boolean; canDelete: boolean; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  // Only one row stays swiped open at a time.
  useEffect(() => {
    const other = (e: Event) => (e as CustomEvent<string>).detail !== id && setOpen(false);
    window.addEventListener(OPENED, other);
    return () => window.removeEventListener(OPENED, other);
  }, [id]);

  const row = "flex items-start gap-3 py-3";
  if (!canEdit && !canDelete) return <li className={row}>{children}</li>;

  const run = (action: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const item = e.currentTarget.closest("li");
    // Closed first: a swiped row turns taps into «close».
    flushSync(() => setOpen(false));
    item?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click();
  };

  return (
    <SwipeRow
      open={open}
      onOpen={() => {
        setOpen(true);
        window.dispatchEvent(new CustomEvent(OPENED, { detail: id }));
      }}
      onClose={() => setOpen(false)}
      rowClassName={row}
      actions={
        <>
          <button type="button" className="swipe-action bg-brand" disabled={!canEdit} onClick={run("edit")}>
            <Icon name="edit" className="size-5" />
            Editar
          </button>
          <button type="button" className="swipe-action bg-debt" disabled={!canDelete} onClick={run("delete")}>
            <Icon name="trash" className="size-5" />
            Borrar
          </button>
        </>
      }
    >
      {children}
    </SwipeRow>
  );
}
