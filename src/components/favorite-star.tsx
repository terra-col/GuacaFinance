"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions";
import { FAVORITE_EVENT, type FavoriteDetail } from "./sortable-carousel";

/**
 * The star on a savings or cash card: gold and filled for the favourite account for payments,
 * grey and hollow otherwise. Tapping it marks or unmarks that account without opening it; the
 * star changes at once and the server confirms (the previous favourite loses its star).
 */
export function FavoriteStar({ id, name, on, light }: { id: string; name: string; on: boolean; light: boolean }) {
  const [star, setStar] = useState(on);
  const [seen, setSeen] = useState(on);
  if (seen !== on) {
    setSeen(on);
    setStar(on);
  }
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Another account became the favourite: this star goes out at once, like the server will say.
  useEffect(() => {
    const other = (e: Event) => {
      const detail = (e as CustomEvent<FavoriteDetail>).detail;
      if (detail.on && detail.id !== id) setStar(false);
    };
    window.addEventListener(FAVORITE_EVENT, other);
    return () => window.removeEventListener(FAVORITE_EVENT, other);
  }, [id]);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !star;
        setStar(next);
        // The carousel moves the card first at once; the server confirms.
        window.dispatchEvent(new CustomEvent<FavoriteDetail>(FAVORITE_EVENT, { detail: { id, on: next } }));
        startTransition(async () => {
          const form = new FormData();
          form.set("id", id);
          await toggleFavorite(form).catch(() => {
            // Not saved: the star and the order go back to what the server has.
            setStar(!next);
            router.refresh();
          });
        });
      }}
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
