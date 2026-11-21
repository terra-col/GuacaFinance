import { formatCOP, formatDate } from "@/lib/finance";
import type { GoalStatus, GoalView } from "@/lib/goals";
import { Ring } from "./ring";

export const GOAL_STATUS: Record<GoalStatus, { label: string; pill: string }> = {
  done: { label: "¡Lograda! 🎉", pill: "pill-idea" },
  ahead: { label: "Vas adelantado", pill: "pill-idea" },
  on_track: { label: "Vas al día", pill: "pill-idea" },
  behind: { label: "Vas atrasado", pill: "pill-warn" },
  overdue: { label: "Se pasó la fecha", pill: "pill-urgent" },
  scheduled: { label: "Sin plan", pill: "bg-line/60" },
};

/** The status pill's text: a goal with no pace says what it is instead of how it is going. */
export function goalStatusLabel(view: GoalView): string {
  if (view.status === "scheduled") return view.goal.plan_once ? "Pago único" : "Sin plan";
  return GOAL_STATUS[view.status].label;
}

export function daysText(days: number) {
  if (days < 0) return `venció hace ${-days} días`;
  if (days === 0) return "es hoy";
  if (days < 60) return `faltan ${days} días`;
  return `faltan ${Math.round(days / 30.44)} meses`;
}

/** The goal at a glance: its ring, name, date and status, and the bar of what is achieved. */
export function GoalSummary({ view, large = false }: { view: GoalView; large?: boolean }) {
  const { goal } = view;
  const save = goal.kind === "save";
  const pct = Math.round(view.progress * 100);
  return (
    <>
      <div className="flex items-start gap-4">
        <Ring value={view.progress} label={`${pct}%`} sub={save ? "ahorrado" : "pagado"} gradient={save ? "brand" : "have"} />
        <div className="min-w-0 flex-1">
          <p className={`${large ? "text-4xl" : "text-3xl"} leading-none`} aria-hidden="true">
            {goal.emoji ?? (save ? "🎯" : "💳")}
          </p>
          {large ? <h1 className="display mt-1 text-3xl leading-tight">{goal.name}</h1> : <h3 className="display mt-1 text-xl leading-tight">{goal.name}</h3>}
          <p className="text-sm text-ink-3">
            {formatDate(goal.target_date)} · {daysText(view.daysLeft)}
          </p>
          <span className={`pill mt-2 ${GOAL_STATUS[view.status].pill}`}>{goalStatusLabel(view)}</span>
        </div>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="whitespace-nowrap">
            <span className="display num text-lg">{formatCOP(view.achieved)}</span> <span className="text-ink-3">de {formatCOP(view.target)}</span>
          </span>
          {view.remaining > 0 && <span className="whitespace-nowrap text-ink-3">faltan {formatCOP(view.remaining)}</span>}
        </div>
        <div className="track mt-1.5 h-3">
          <div className={`fill ${save ? "fill-brand" : "fill-have"}`} style={{ width: `${Math.max(view.progress > 0 ? 2 : 0, pct)}%` }} />
        </div>
      </div>
    </>
  );
}
