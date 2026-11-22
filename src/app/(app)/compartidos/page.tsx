import Link from "next/link";
import { Modal } from "@/components/modal";
import { MovesSwitch } from "@/components/moves-switch";
import { GroupForm } from "@/components/shared-forms";
import { profileName } from "@/lib/brand";
import { loadData } from "@/lib/data";
import { formatCOP, isAdjustment } from "@/lib/finance";

export default async function SharedPage({ searchParams }: { searchParams: Promise<{ dividir?: string }> }) {
  const { shared, sharedReady, position, txs, user } = await loadData();
  const { dividir } = await searchParams;
  const linked = shared.links.some((l) => l.tx_id === dividir);
  const tx = dividir && !linked ? txs.find((t) => t.id === dividir && t.kind === "expense" && !isAdjustment(t)) : undefined;
  const me = profileName(user);
  const query = tx ? `?dividir=${tx.id}` : "";

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="display text-3xl">Movimientos</h1>
        {sharedReady && (
          <Modal label="+ Grupo" title="Nuevo grupo o persona" buttonClass="btn h-11 rounded-2xl px-4 text-sm">
            <GroupForm me={me} tx={tx?.id} />
          </Modal>
        )}
      </div>
      <MovesSwitch active="/compartidos" />

      {!sharedReady ? (
        <p className="card text-sm text-ink-2">Los gastos compartidos todavía no están activos.</p>
      ) : (
        <>
          {tx && (
            <p role="status" className="card text-sm text-ink-2">
              Vas a dividir <strong className="num text-ink">{formatCOP(tx.amount)}</strong>
              {tx.description ? ` de «${tx.description}»` : ""}. {shared.groups.length ? "Elige con quién, o crea un grupo." : "Crea un grupo o agrega una persona con «+ Grupo»."}
            </p>
          )}
          {shared.groups.length > 0 && !tx && (
            <section className="card grid grid-cols-2 gap-4" aria-label="Tus saldos compartidos">
              <div>
                <p className="eyebrow">Te deben</p>
                <p className="display text-2xl">{formatCOP(position.owedToMe)}</p>
              </div>
              <div className="text-right">
                <p className="eyebrow">Debes</p>
                <p className="display text-2xl">{formatCOP(position.iOwe)}</p>
              </div>
            </section>
          )}
          {shared.groups.length === 0 ? (
            <section className="card flex flex-col items-start gap-3">
              <h2 className="display text-2xl">Divide gastos con quien quieras</h2>
              <p className="text-sm text-ink-2">
                Una cena, el arriendo, un viaje. Anota quién pagó y Guaca lleva quién le debe a quién. De lo que pagues por otros, solo tu parte cuenta como gasto.
              </p>
              <p className="text-sm text-ink-3">El grupo ve solo sus gastos: nunca tus cuentas, saldos ni otros movimientos.</p>
              <Modal label="Empezar" title="Nuevo grupo o persona">
                <GroupForm me={me} tx={tx?.id} />
              </Modal>
            </section>
          ) : (
            <ul className="card divide-y divide-line py-1 sm:py-2" aria-label="Tus grupos">
              {shared.groups.map((group) => {
                const net = position.byGroup.get(group.id) ?? 0;
                const people = shared.members.filter((m) => m.group_id === group.id).length;
                return (
                  <li key={group.id}>
                    <Link href={`/compartidos/${group.id}${query}`} className="flex items-center justify-between gap-3 py-4">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{group.name}</span>
                        <span className="block text-sm text-ink-3">{people === 2 ? "Solo ustedes dos" : `${people} personas`}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs text-ink-3">{net > 0 ? "te deben" : net < 0 ? "debes" : "al día"}</span>
                        {net !== 0 && <span className="display num block text-lg">{formatCOP(Math.abs(net))}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
