/**
 * Under a section's big switch: what the screen is for and its main button. The switch above
 * already says where you are, so the title is only for screen readers (when there is one).
 */
export function SectionHead({ title, text, children }: { title?: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-36 flex-1 basis-0">
        {title && <h1 className="sr-only">{title}</h1>}
        <p className="text-sm text-ink-2">{text}</p>
      </div>
      {children}
    </div>
  );
}

/** The size every section's main button has (+ Nueva meta, + Nuevo crédito, + Grupo…). */
export const HEAD_BUTTON = "h-12 gap-2 rounded-2xl px-5 text-base";
