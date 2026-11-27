import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupExit } from "@/components/group-exit";
import { GroupPeople } from "@/components/group-people";
import { EndHouseBillForm, HouseBillForm, HouseSettingsForm, MergeHouseBill, type HouseOption } from "@/components/house-forms";
import { HouseReceiptRow } from "@/components/house-receipt";
import { Modal } from "@/components/modal";
import { PaidGroup } from "@/components/paid-group";
import { loadData } from "@/lib/data";
import { currentBills, favoriteFirst, formatCOP, monthName, shiftMonth } from "@/lib/finance";
import { houseBillSchedule, houseMonth, type HouseReceipt } from "@/lib/house";
import { cadenceText, isFrequent } from "@/lib/recurrence";
import { groupNets, memberOf } from "@/lib/shared";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ARROW = "liquid flex size-10 shrink-0 items-center justify-center rounded-full text-lg";

export default async function HousePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const { mes } = await searchParams;
  const { shared, house, accounts, bills, user, today } = await loadData();
  const group = shared.groups.find((g) => g.id === id && g.house);
  const me = memberOf(id, shared, user.id);
  if (!group || !me) notFound();

  const current = today.slice(0, 7);
  const last = shiftMonth(current, 1);
  const month = mes && MONTH.test(mes) && mes <= last ? mes : current;
  // This month and the next can be ticked; earlier ones are a record.
  const editable = month === current || month === last;

  const members = shared.members.filter((m) => m.group_id === id);
  const option: HouseOption = { id, name: group.name, me: me.id, members: members.filter((m) => !m.removed_at).map(({ id, name }) => ({ id, name })) };
  const spendable = favoriteFirst(accounts.filter((a) => a.kind !== "loan")).map(({ id, name }) => ({ id, name }));
  // A one-time payment is not one a house takes over.
  const own = currentBills(bills).filter((b) => !b.once_month);
  const payments = house.payments.filter((p) => p.group_id === id);

  const receipts = houseMonth(house, shared, user.id, id, month, today);
  const counted = receipts.filter((r) => !r.skip);
  const paid = counted.filter((r) => r.settled).length;
  const open = receipts.filter((r) => !r.settled).sort((a, b) => Number(Boolean(a.skip)) - Number(Boolean(b.skip)));
  const missing = counted.filter((r) => !r.settled);
  const missingAmount = missing.reduce((sum, r) => sum + (r.left ?? 0), 0);
  const variable = missing.filter((r) => r.left === null).length;
  // What repeats every day or two: up to today and the next one.
  const later = new Set<HouseReceipt>();
  const nextShown = new Set<string>();
  for (const r of open) {
    if (!isFrequent(r.every) || r.due <= today) continue;
    if (nextShown.has(r.bill)) later.add(r);
    else nextShown.add(r.bill);
  }

  const active = house.bills.filter((b) => b.group_id === id && !b.ended_month);
  const same = (a: string, b: string) => a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");
  const twins = active.flatMap((bill) => own.filter((b) => same(b.name, bill.name)).slice(0, 1).map((mine) => ({ bill, mine })));
  const nameOf = new Map(members.filter((m) => !m.removed_at).map((m) => [m.id, m.id === me.id ? "tú" : m.name]));
  const net = groupNets(id, shared).get(me.id) ?? 0;
  const row = (r: HouseReceipt) => <HouseReceiptRow key={`${r.bill}-${r.date ?? ""}`} receipt={r} today={today} editable={editable} accounts={spendable} />;

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href={month === current ? "/pagos" : `/pagos?mes=${month}`} className="text-sm font-medium text-brand">
          ‹ Pagos
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display break-words text-3xl">{group.name}</h1>
            <Modal label="Configurar" title="Configurar la casa" buttonClass="text-xs font-semibold text-brand">
              <HouseSettingsForm group={id} name={group.name} canStop={group.created_by === null || group.created_by === user.id} />
            </Modal>
          </div>
          <Modal label="+ Recibo" title="Recibo de la casa" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
            <HouseBillForm house={option} ownBills={own} />
          </Modal>
        </div>
      </div>

      <GroupPeople group={group} shared={shared} userId={user.id} paidHere={new Set(payments.map((p) => p.paid_by))} />

      {twins.map(({ bill, mine }) => (
        <MergeHouseBill key={`${bill.id}-${mine.id}`} own={mine.id} bill={bill.id} name={mine.name} />
      ))}

      <section className="card" aria-labelledby="house-month">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/pagos/casa/${id}?mes=${shiftMonth(month, -1)}`} className={ARROW} aria-label="Mes anterior">
            ‹
          </Link>
          <h2 id="house-month" className="display text-2xl first-letter:uppercase">
            {monthName(month)}
            {month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ""}
          </h2>
          {month < last ? (
            <Link href={`/pagos/casa/${id}?mes=${shiftMonth(month, 1)}`} className={ARROW} aria-label="Mes siguiente">
              ›
            </Link>
          ) : (
            <span className={`${ARROW} opacity-35`} aria-hidden="true">
              ›
            </span>
          )}
        </div>
        {receipts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">{active.length ? "No hay recibos en ese mes." : "Todavía no hay recibos. Agrega el primero con «+ Recibo»."}</p>
        ) : (
          <>
            <p className="num mt-3 text-sm text-ink-2" data-house-count>
              <strong className="text-ink">
                {paid} de {counted.length} pagados
              </strong>
              {missingAmount > 0 && ` · faltan ${formatCOP(missingAmount)}`}
              {variable > 0 && ` · ${variable} de valor variable`}
            </p>
            <div className="track mt-2 h-3" role="img" aria-label={`${paid} de ${counted.length} pagados`}>
              <div className="fill fill-have" style={{ width: `${counted.length ? (paid / counted.length) * 100 : 100}%` }} />
            </div>
            <ul className="mt-2 divide-y divide-line">{open.filter((r) => !later.has(r)).map(row)}</ul>
            <PaidGroup id="casa-despues" label="Más adelante este mes" count={later.size}>
              {open.filter((r) => later.has(r)).map(row)}
            </PaidGroup>
            <PaidGroup id="casa" label="Ya pagados" count={receipts.filter((r) => r.settled).length}>
              {receipts.filter((r) => r.settled).map(row)}
            </PaidGroup>
          </>
        )}
      </section>

      {active.length > 0 && (
        <details className="card py-3.5 sm:py-4" data-all-receipts>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Editar los recibos · {active.length}</span>
            <span className="text-xs text-brand">Ver ▾</span>
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {active.map((bill) => {
              const cadence = cadenceText(houseBillSchedule(bill));
              return (
                <li key={bill.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{bill.name}</span>
                    <span className="num block text-xs text-ink-3">
                      {bill.amount ? formatCOP(bill.amount) : "Valor variable"} · {cadence}
                      {bill.responsible && nameOf.has(bill.responsible) ? ` · responsable: ${nameOf.get(bill.responsible)}` : " · sin responsable"}
                      {bill.split && " · se divide"}
                    </span>
                  </span>
                  <span className="ml-auto flex gap-3">
                    <Modal label="Editar" title="Editar recibo" buttonClass="text-xs font-semibold text-brand">
                      <HouseBillForm house={option} bill={bill} />
                    </Modal>
                    <Modal label="Eliminar" title="Eliminar recibo" buttonClass="text-xs font-medium text-ink-3 hover:text-debt">
                      <EndHouseBillForm bill={bill.id} name={bill.name} />
                    </Modal>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <Link href={`/compartidos/${id}`} className="card flex items-center justify-between gap-3 py-3.5 text-sm sm:py-4">
        <span className="text-ink-2">
          {net ? (
            <>
              {net > 0 ? "De lo dividido te deben " : "De lo dividido debes "}
              <strong className="num text-ink">{formatCOP(Math.abs(net))}</strong>
            </>
          ) : (
            "Lo que dividan queda en Compartidos"
          )}
        </span>
        <span className="shrink-0 font-semibold text-brand">Ver ›</span>
      </Link>

      <GroupExit group={group} shared={shared} userId={user.id} hasPayments={payments.length > 0} canLeave={house.ready} house />
    </>
  );
}
