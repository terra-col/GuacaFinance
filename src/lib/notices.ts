// Avisos: what others did in one's groups, as a sentence. The trigger of migration 0023 writes them.
import { formatCOP } from "./finance.ts";

export interface Notice {
  id: string;
  kind:
    | "expense"
    | "payment"
    | "edited"
    | "removed"
    | "joined"
    | "you_joined"
    | "group_deleted"
    | "member_removed"
    | "you_removed"
    | "member_left"
    | "house_on"
    | "house_bill"
    | "house_bill_edited"
    | "house_bill_ended"
    | "house_paid"
    | "house_unpaid"
    | "house_skipped";
  group_id: string | null;
  group_name: string | null;
  actor_name: string | null;
  detail: string | null;
  amount: number | null;
  created_at: string;
  read_at: string | null;
}

/** Those that open the house rather than the group. */
export const isHouseNotice = (kind: Notice["kind"]) => kind.startsWith("house_");

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
    case "member_left":
      return `${notice.detail ?? "Alguien"} salió de ${where}.`;
    case "house_on":
      return `${who} puso ${where} como casa: sus recibos salen en Pagos.`;
    case "house_bill":
      return `${who} agregó el recibo ${what}${worth} en ${where}.`;
    case "house_bill_edited":
      return `${who} cambió el recibo ${what} de ${where}.`;
    case "house_bill_ended":
      return `${who} quitó el recibo ${what} de ${where}.`;
    case "house_paid":
      return `${who} anotó el pago de ${what}${worth} en ${where}.`;
    case "house_unpaid":
      return `${who} desmarcó el pago de ${what}${worth} en ${where}.`;
    case "house_skipped":
      return `${who} marcó que ${what} no aplica esta vez en ${where}.`;
    case "group_deleted":
      return `${who} eliminó ${where}.`;
  }
}
