/**
 * The advisor's mark: a speech bubble holding the logo's gesture (what you have meeting what you
 * owe, two bars meeting in the middle) as a balance on a fulcrum. With `alive`, the beam tips from
 * side to side like a balance weighing: the AI reading your accounts.
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
      {/* A balance: the beam (what you have, what you owe) resting on a small fulcrum, tipping. */}
      <g className="advisor-beam">
        <rect x="6.8" y="8.75" width="5" height="1.9" rx="0.95" fill="currentColor" />
        <rect x="12.2" y="8.75" width="5" height="1.9" rx="0.95" fill="currentColor" opacity="0.45" />
      </g>
      <path d="M12 10.9l1.75 2.75h-3.5z" fill="currentColor" stroke="currentColor" strokeWidth={0.6} strokeLinejoin="round" />
    </svg>
  );
}
