import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectButton } from "@/components/shared-forms";
import { loadData } from "@/lib/data";
import { formatCOP } from "@/lib/finance";
import { formatPhone } from "@/lib/phone";
import { peopleWith } from "@/lib/people";

/** One person: what is pending with them in all, and where it comes from. */
export default async function PersonPage({ params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const { shared, user } = await loadData();
  const person = peopleWith(shared, user.id).find((p) => p.members.includes(member));
  if (!person) notFound();

  return (
    <>
      <div className="flex flex-col gap-3 pt-2">
        <Link href="/compartidos" className="text-sm font-medium text-brand">
          ‹ Compartidos
        </Link>
        <div>
          <h1 className="display break-words text-3xl">{person.name}</h1>
          {person.phone && <p className="num text-sm text-ink-3">{formatPhone(person.phone)}</p>}
        </div>
      </div>

      <section className="card" aria-label={`Saldo con ${person.name}`}>
        <p className="eyebrow">{person.total > 0 ? "Te debe en total" : person.total < 0 ? "Le debes en total" : "Están al día"}</p>
        <p className="display text-3xl">{formatCOP(Math.abs(person.total))}</p>
      </section>

      {shared.social && !person.direct && <DirectButton member={person.member}>+ Gasto solo entre ustedes dos</DirectButton>}

      <section className="card" aria-labelledby="where-title">
        <h2 id="where-title" className="display text-2xl">
          De dónde viene
        </h2>
        <ul className="mt-1 divide-y divide-line">
          {person.places.map(({ group, net }) => (
            <li key={group.id}>
              <Link href={`/compartidos/${group.id}`} className="flex items-center justify-between gap-3 py-3.5">
                <span className="min-w-0 truncate font-semibold">{group.direct ? "Solo ustedes dos" : group.name}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs text-ink-3">{net > 0 ? "te debe" : net < 0 ? "le debes" : "al día"}</span>
                  {net !== 0 && <span className="num block font-semibold">{formatCOP(Math.abs(net))}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {person.places.some((p) => !p.group.direct) && (
          <p className="mt-2 text-xs text-ink-3">En los grupos es lo que sale en «Para quedar al día». Cada cuenta se salda por aparte.</p>
        )}
      </section>
    </>
  );
}
