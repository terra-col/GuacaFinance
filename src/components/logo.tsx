import { APP_NAME } from "@/lib/brand";

/** The mark is the product's signature gesture: what you have meeting what you owe. */
export function Logo({ size = "text-xl", compact = false }: { size?: string; compact?: boolean }) {
  return (
    <span className={`display inline-flex items-center gap-2 ${size}`}>
      <span
        aria-hidden="true"
        className="relative flex size-8 items-center gap-0.5 rounded-xl px-1.5 shadow-lg"
        style={{ background: "linear-gradient(135deg, #6d4aff, #9a34e6)" }}
      >
        <span className="h-1.5 w-[58%] rounded-l-full bg-white" />
        <span className="h-1.5 flex-1 rounded-r-full bg-white/55" />
        <span className="absolute left-1/2 top-2 h-4 w-px bg-white/80" />
      </span>
      {/* In the header with five buttons, the narrowest phones keep only the mark. */}
      <span className={compact ? "max-[379px]:sr-only" : undefined}>{APP_NAME}</span>
    </span>
  );
}
