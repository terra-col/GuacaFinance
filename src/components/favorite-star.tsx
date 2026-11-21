"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFavorite } from "@/app/actions";

/**
 * The star on a savings or cash card: gold and filled for the favourite account for payments,
 * grey and hollow otherwise. Tapping it marks or unmarks that account without opening it; the
 * star changes at once and the server confirms (the previous favourite loses its star).
 */
export function FavoriteStar({ id, name, on, light }: { id: string; name: string; on: boolean; light: boolean }) {
  const [star, setStar] = useOptimistic(on);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setStar(!star);
          const form = new FormData();
          form.set("id", id);
          await toggleFavorite(form).catch(() => {});
        })
      }
      disabled={pending}
      aria-pressed={star}
      aria-label={star ? `${name} es tu favorita para pagos. Quitarla` : `Hacer ${name} tu favorita para pagos`}
      title={star ? "Favorita para pagos" : "Hacer favorita para pagos"}
      className="favorite-star flex size-9 items-center justify-center rounded-full transition-transform active:scale-90"
      style={{ background: light ? "rgba(255,255,255,0.18)" : "rgba(20,17,46,0.1)" }}
    >
      <svg viewBox="0 0 24 24" className={`size-5 ${star ? "favorite-star-on" : ""}`} aria-hidden="true">
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
          fill={star ? "#FFC83D" : "none"}
          stroke={star ? "#E0A100" : light ? "rgba(255,255,255,0.6)" : "rgba(20,17,46,0.4)"}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
