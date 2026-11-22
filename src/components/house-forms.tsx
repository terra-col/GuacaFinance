"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { endHouseBill, mergeHouseBill, saveHouseBill, setUpHouse, stopHouse } from "@/app/house-actions";
import type { Known } from "@/lib/contacts";
import { todayInBogota, type Bill } from "@/lib/finance";
import type { HouseBill } from "@/lib/house";
import { BillForm } from "./bill-forms";
import { EveryFields, type EveryValue } from "./every-fields";
import { useCloseModal } from "./modal";
import { MoneyInput } from "./money-input";
import { PeopleFields } from "./people-fields";
import { CategoryField, SelectField } from "./pickers";
import { Problem, RenameGroupForm, Send, useSave } from "./shared-forms";

/** A house to add receipts to. */
export interface HouseOption {
  id: string;
  name: string;
  me: string;
  members: { id: string; name: string }[];
}

/** What setting up a house starts from. */
export interface HouseSetup {
  myName: string;
  known: Known[];
  /** Groups that could be one. */
  groups: { id: string; name: string }[];
}

const NEW_HOUSE = "new";
const NOBODY = { value: "", label: "Sin responsable fijo" };

export function HouseSetupForm({ setup }: { setup: HouseSetup }) {
  const router = useRouter();
  const close = useCloseModal();
  const [existing, setExisting] = useState("");
  const { pending, error, submit } = useSave(setUpHouse, ({ id }) => {
    close();
    router.push(`/pagos/casa/${id}`);
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Los recibos que comparten (arriendo, luz, internet): todos ven cuáles van pagados, quién los pagó y cuánto. Nadie ve tus cuentas, y solo se divide lo que tú digas.
      </p>
      <input type="hidden" name="existing" value={existing} />
      {setup.groups.length > 0 && (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-ink-2">Empezar con</legend>
          <button type="button" className="chip" aria-pressed={!existing} onClick={() => setExisting("")}>
            Una casa nueva
          </button>
          {setup.groups.map((g) => (
            <button key={g.id} type="button" className="chip max-w-full truncate" aria-pressed={existing === g.id} onClick={() => setExisting(g.id)}>
              {g.name}
            </button>
          ))}
        </fieldset>
      )}
      {existing ? (
        <p className="text-sm text-ink-2">Ese grupo queda también como casa, con las mismas personas. Sus gastos no cambian.</p>
      ) : (
        <>
          <label className="field">
            Nombre
            <input className="input" name="name" defaultValue="La casa" maxLength={60} autoComplete="off" required />
          </label>
          <label className="field">
            Tu nombre ahí
            <input className="input" name="me" defaultValue={setup.myName} maxLength={60} autoComplete="given-name" required />
          </label>
          <PeopleFields known={setup.known} optional />
        </>
      )}
      <Problem error={error} />
      <Send pending={pending}>{existing ? "Usar como casa" : "Crear la casa"}</Send>
    </form>
  );
}

const scheduleOf = (from?: { every?: Bill["every"]; due_day: number; starts_on?: string | null }): EveryValue => ({
  every: from?.every ?? "monthly",
  day: from?.due_day ?? "",
  start: from?.every && from.every !== "monthly" ? (from.starts_on ?? "") : "",
});

/** A receipt of a house: new (also from a fixed payment one already had) or edited. */
export function HouseBillForm({ house, bill, ownBills = [] }: { house: HouseOption; bill?: HouseBill; ownBills?: Bill[] }) {
  const close = useCloseModal();
  const [from, setFrom] = useState("");
  const own = ownBills.find((b) => b.id === from);
  const [schedule, setSchedule] = useState<EveryValue>(() => scheduleOf(bill));
  const { pending, error, submit } = useSave(saveHouseBill, () => close());

  function pickOwn(id: string) {
    setFrom(id);
    setSchedule(scheduleOf(ownBills.find((b) => b.id === id)));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="group" value={house.id} />
      {bill && <input type="hidden" name="bill" value={bill.id} />}
      {!bill && ownBills.length > 0 && (
        <label className="field">
          ¿Ya lo tienes como pago fijo tuyo?
          <SelectField
            name="from"
            value={from}
            onChange={pickOwn}
            options={[{ value: "", label: "No, es nuevo" }, ...ownBills.map((b) => ({ value: b.id, label: b.name }))]}
          />
          {own && <span className="text-xs font-normal text-ink-3">Pasa a la casa para que no cuente dos veces. Tus meses anteriores y tus movimientos quedan iguales.</span>}
        </label>
      )}
      <div key={from} className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Nombre
          <input className="input" name="name" defaultValue={bill?.name ?? own?.name} maxLength={80} placeholder="Arriendo, luz, internet…" autoComplete="off" required />
        </label>
        <label className="field">
          {schedule.every === "monthly" ? "Valor" : "Valor cada vez"}
          <MoneyInput name="amount" defaultValue={bill?.amount ?? own?.amount} placeholder="$ 90.000" />
          <span className="text-xs font-normal text-ink-3">Vacío si cambia (servicios).</span>
        </label>
        <EveryFields value={schedule} onChange={setSchedule} today={todayInBogota()} names={{ every: "every", day: "due_day", start: "starts_on" }} editing={Boolean(bill)} what="pago" />
        <label className="field">
          Responsable habitual
          <SelectField
            name="responsible"
            options={[...house.members.map((m) => ({ value: m.id, label: m.id === house.me ? `${m.name} (tú)` : m.name })), NOBODY]}
            defaultValue={bill ? (bill.responsible ?? "") : house.me}
          />
          <span className="text-xs font-normal text-ink-3">Le sale en su lista y cuenta en su mes. Al pagar pueden decir que pagó otra persona.</span>
        </label>
        <label className="field">
          Categoría
          <CategoryField name="category" defaultValue={bill ? (bill.category ?? "") : own ? (own.category ?? "") : "Hogar"} />
        </label>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input type="checkbox" name="split" className="mt-1" defaultChecked={bill?.split ?? false} />
        <span>
          <span className="block font-semibold text-ink">Dividirlo al pagarlo</span>
          Si no lo marcas, solo se ve quién pagó y nadie queda debiendo.
        </span>
      </label>
      <Problem error={error} />
      <Send pending={pending}>{bill ? "Guardar cambios" : "Agregar a la casa"}</Send>
    </form>
  );
}

/** «+ Agregar» in Pagos: only mine, or of the house. */
export function AddPayment({ houses, setup, ownBills }: { houses: HouseOption[]; setup: HouseSetup; ownBills: Bill[] }) {
  const [shared, setShared] = useState(false);
  const [chosen, setChosen] = useState(houses[0]?.id ?? NEW_HOUSE);
  const house = houses.find((h) => h.id === chosen);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="De quién es">
        <button type="button" className="chip h-11" aria-pressed={!shared} onClick={() => setShared(false)} data-kind="mine">
          Solo mío
        </button>
        <button type="button" className="chip h-11" aria-pressed={shared} onClick={() => setShared(true)} data-kind="house">
          De la casa
        </button>
      </div>
      {!shared ? (
        <BillForm inModal />
      ) : (
        <>
          {houses.length > 0 && (
            <label className="field">
              En cuál casa
              <SelectField name="house" value={chosen} onChange={setChosen} options={[...houses.map((h) => ({ value: h.id, label: h.name })), { value: NEW_HOUSE, label: "+ Configurar otra casa" }]} />
            </label>
          )}
          {house ? <HouseBillForm key={house.id} house={house} ownBills={ownBills} /> : <HouseSetupForm setup={setup} />}
        </>
      )}
    </div>
  );
}

/** «Configurar»: its name, and whether it goes on being a house. */
export function HouseSettingsForm({ group, name, canStop }: { group: string; name: string; canStop: boolean }) {
  const [sure, setSure] = useState(false);
  const { pending, error, submit } = useSave(stopHouse);
  return (
    <div className="flex flex-col gap-4">
      <RenameGroupForm group={group} name={name} />
      {canStop && (
        <form onSubmit={submit} className="flex flex-col items-start gap-2 border-t border-line pt-3">
          <input type="hidden" name="group" value={group} />
          {sure ? (
            <>
              <p className="text-sm text-ink-2">Sus recibos salen de Pagos para todos. El grupo sigue en Compartidos, y si lo vuelves a usar como casa todo reaparece.</p>
              <Send pending={pending} className="btn">
                Sí, dejar de usarlo
              </Send>
            </>
          ) : (
            <button type="button" className="text-sm font-medium text-ink-3 hover:text-debt" onClick={() => setSure(true)}>
              Dejar de usarlo como casa
            </button>
          )}
          <Problem error={error} />
        </form>
      )}
    </div>
  );
}

export function EndHouseBillForm({ bill, name }: { bill: string; name: string }) {
  const close = useCloseModal();
  const { pending, error, submit } = useSave(endHouseBill, () => close());
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="bill" value={bill} />
      <p className="text-sm text-ink-2">{name} sale de la casa para todos desde este mes. Lo que ya se pagó se conserva.</p>
      <Problem error={error} />
      <Send pending={pending}>Sí, eliminar</Send>
    </form>
  );
}

/** The same receipt twice, as the house's and as one's own: one tap joins them. */
export function MergeHouseBill({ own, bill, name }: { own: string; bill: string; name: string }) {
  const { pending, error, submit } = useSave(mergeHouseBill);
  return (
    <form onSubmit={submit} className="card flex flex-col items-start gap-2 text-sm text-ink-2" data-merge>
      <input type="hidden" name="own" value={own} />
      <input type="hidden" name="bill" value={bill} />
      <p>
        También tienes <strong className="text-ink">{name}</strong> como pago fijo tuyo. Si es el mismo, únelo para que no cuente dos veces. Tus movimientos no cambian.
      </p>
      <Problem error={error} />
      <Send pending={pending} className="btn-quiet">
        Es el mismo: unirlo
      </Send>
    </form>
  );
}
