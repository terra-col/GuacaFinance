/**
 * Loading placeholders shaped like the screen that is coming, with a light
 * sweeping across them, and the logo's two bars breathing at the top.
 */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`shine ${className}`} />;
}

export function LoadingMark({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 pt-2" role="status">
      <span
        aria-hidden="true"
        className="relative flex size-9 items-center gap-0.5 rounded-xl px-1.5 shadow-lg"
        style={{ background: "linear-gradient(135deg, #6d4aff, #9a34e6)" }}
      >
        <span className="breathe h-1.5 w-[58%] origin-right rounded-l-full bg-white" />
        <span className="breathe h-1.5 flex-1 origin-left rounded-r-full bg-white/55 [animation-delay:-0.6s]" />
      </span>
      <span className="text-sm font-medium text-ink-2">{text}</span>
    </div>
  );
}

function Tile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card flex flex-col gap-3 ${className}`}>{children}</div>;
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <LoadingMark text="Sumando tus cuentas…" />
      <div className="grid gap-4 lg:grid-cols-6 lg:gap-5">
        <Tile className="lg:col-span-4">
          <Bar className="h-4 w-28" />
          <Bar className="h-16 w-3/4" />
          <Bar className="mt-6 h-6 w-full rounded-full" />
        </Tile>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2 lg:grid-cols-1 lg:gap-5">
          {[0, 1].map((i) => (
            <Tile key={i} className="items-start max-sm:p-4 sm:flex-row sm:items-center">
              <Bar className="size-[5.25rem] shrink-0 rounded-full sm:size-28" />
              <div className="flex w-full flex-1 flex-col gap-2">
                <Bar className="h-3 w-3/4" />
                <Bar className="h-6 w-full" />
              </div>
            </Tile>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Tile key={i}>
            <Bar className="h-4 w-20 rounded-full" />
            <Bar className="h-5 w-4/5" />
            <Bar className="h-4 w-3/5" />
          </Tile>
        ))}
      </div>
      <Tile>
        <Bar className="h-6 w-48" />
        <Bar className="h-56 w-full" />
      </Tile>
    </div>
  );
}

export function CardsSkeleton({ text, count = 4 }: { text: string; count?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <LoadingMark text={text} />
      <Tile>
        <Bar className="h-4 w-32" />
        <Bar className="h-14 w-2/3" />
        <Bar className="h-4 w-full rounded-full" />
      </Tile>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <Tile key={i}>
            <Bar className="aspect-[1.586] w-full rounded-3xl" />
            <Bar className="h-3 w-full rounded-full" />
            <Bar className="h-4 w-1/2" />
          </Tile>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ text, rows = 6 }: { text: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <LoadingMark text={text} />
      <Tile>
        <Bar className="h-7 w-40" />
        <Bar className="h-3 w-full rounded-full" />
        <div className="mt-2 flex flex-col gap-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar className="size-11 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Bar className="h-4 w-2/5" />
                <Bar className="h-3 w-3/5" />
              </div>
              <Bar className="h-5 w-20" />
            </div>
          ))}
        </div>
      </Tile>
    </div>
  );
}

/** An account's own screen: its card, the trend chart and the facts. */
export function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <LoadingMark text="Abriendo la cuenta…" />
      <Bar className="aspect-[1.586] w-full max-w-md rounded-3xl" />
      <Tile>
        <Bar className="h-6 w-48" />
        <Bar className="h-48 w-full" />
      </Tile>
      <Tile>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bar className="h-3 w-24" />
              <Bar className="h-4 w-40" />
            </div>
          ))}
        </div>
      </Tile>
    </div>
  );
}
