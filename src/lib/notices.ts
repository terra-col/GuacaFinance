// Avisos: what others did in one's groups, as a sentence. The trigger of migration 0023 writes them.
import { formatCOP } from "./finance.ts";

export interface Notice {
  id: string;
  kind: "expense" | "payment" | "edited" | "removed" | "joined" | "you_joined" | "group_deleted" | "member_removed" | "you_removed";
  group_id: string | null;
  group_name: string | null;
  actor_name: string | null;
  detail: string | null;
  amount: number | null;
  created_at: string;
  read_at: string | null;
}

/** `where` is the group as the reader calls it. */
export function noticeText(notice: Notice, where: string): string {
  const who = notice.actor_name ?? "Alguien";
  const what = `«${notice.detail ?? ""}»`;
  const worth = notice.amount ? ` (${formatCOP(notice.amount)})` : "";
  switch (notice.kind) {
    case "expense":
      return `${who} agregó ${what}${worth} en ${where}.`;
    case "payment":
      return `${who} registró un pago${worth} en ${where}.`;
    case "edited":
      return `${who} cambió ${what}${worth} en ${where}.`;
    case "removed":
      return `${who} borró ${what}${worth} de ${where}.`;
    case "joined":
      return `${notice.detail ?? "Alguien"} se unió a ${where}.`;
    case "you_joined":
      return `Ya estás en ${where}.`;
    case "member_removed":
      return `${who} sacó a ${notice.detail ?? "alguien"} de ${where}.`;
    case "you_removed":
      return `Ya no estás en ${where}. Lo que compartiste ahí se conserva en tus totales.`;
    case "group_deleted":
      return `${who} eliminó ${where}.`;
  }
}
