import Link from "next/link";
import { MarkRead } from "@/components/mark-read";
import { PendingCards } from "@/components/pending-cards";
import { loadData } from "@/lib/data";
import { formatDate, todayInBogota } from "@/lib/finance";
import { noticeText, type Notice } from "@/lib/notices";
import { loadPending, pendingCount } from "@/lib/pending";
import { groupTitle } from "@/lib/people";

const LATEST = 60;

export default async function NoticesPage() {
  const { supabase, shared, user } = await loadData();
  if (!shared.social) {
    return (
      <>
        <h1 className="display pt-2 text-3xl">Avisos</h1>
        <p className="card text-sm text-ink-2">Los avisos todavía no están activos.</p>
      </>
    );
  }
  const [pending, found] = await Promise.all([
    loadPending(supabase, shared, user.id),
    supabase.from("shared_notices").select("*").order("created_at", { ascending: false }).limit(LATEST),
  ]);
  if (found.error) throw new Error(`No se pudieron leer los avisos: ${found.error.message}`);
  const notices = found.data as Notice[];

  return (
    <>
      <h1 className="display pt-2 text-3xl">Avisos</h1>
      <PendingCards pending={pending} />
      {notices.length === 0 ? (
        pendingCount(pending) === 0 && <p className="card text-sm text-ink-2">No tienes avisos. Aquí te llegan las invitaciones y lo que otros anoten en tus cuentas compartidas.</p>
      ) : (
        <ul className="card divide-y divide-line py-1 sm:py-2" aria-label="Lo que ha pasado">
          {notices.map((notice) => {
            const group = shared.groups.find((g) => g.id === notice.group_id);
            const where = group?.direct ? `tu cuenta con ${groupTitle(group, shared, user.id)}` : `«${group?.name ?? notice.group_name ?? "un grupo"}»`;
            const body = (
              <>
                <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${notice.read_at ? "bg-transparent" : "bg-brand"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`num block break-words text-sm ${notice.read_at ? "text-ink-2" : "font-semibold text-ink"}`}>{noticeText(notice, where)}</span>
                  <span className="block text-xs text-ink-3">
                    {formatDate(todayInBogota(new Date(notice.created_at)))}
                    {!notice.read_at && " · nuevo"}
                  </span>
                </span>
              </>
            );
            return (
              <li key={notice.id}>
                {group ? (
                  <Link href={`/compartidos/${group.id}`} className="flex gap-3 py-3">
                    {body}
                  </Link>
                ) : (
                  <p className="flex gap-3 py-3">{body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notices.some((n) => !n.read_at) && <MarkRead until={notices[0].created_at} />}
    </>
  );
}
