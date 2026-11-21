/**
 * The advisor's mark: a speech bubble holding the logo's gesture (what you have meeting what you
 * owe, two bars at a centre line). With `alive`, the balance keeps weighing: the centre line drifts
 * from side to side as one bar grows and the other gives way, the AI reading your accounts.
 */
export function AdvisorMark({ className = "size-5", alive = true }: { className?: string; alive?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} ${alive ? "advisor-alive" : ""}`} fill="none" aria-hidden="true">
      <path
        d="M8 3.75h8a4.75 4.75 0 0 1 4.75 4.75v4A4.75 4.75 0 0 1 16 17.25h-4.4l-4.1 3.3v-3.32A4.75 4.75 0 0 1 3.25 12.5v-4A4.75 4.75 0 0 1 8 3.75z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <rect className="advisor-have" x="7.2" y="9.6" width="4.55" height="1.9" rx="0.95" fill="currentColor" />
      <rect className="advisor-owe" x="12.25" y="9.6" width="4.55" height="1.9" rx="0.95" fill="currentColor" opacity="0.45" />
      <path className="advisor-pivot" d="M12 7.4v6.3" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}
