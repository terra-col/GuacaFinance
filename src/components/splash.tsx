"use client";

import { useEffect } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { APP_NAME } from "@/lib/brand";

/**
 * Full-screen brand moment for the big jumps (signing in, signing out, a new password): the
 * logo's two bars breathe while the next screen is on its way, so the wait reads as intended.
 */
export function Splash({ text }: { text: string }) {
  // Into <body>: inside a glass card, backdrop-filter would trap a fixed overlay in the card.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="splash" role="status" aria-live="polite">
      <span aria-hidden="true" className="splash-mark">
        <span className="breathe h-2.5 w-[58%] origin-right rounded-l-full bg-white" />
        <span className="breathe h-2.5 flex-1 origin-left rounded-r-full bg-white/55 [animation-delay:-0.6s]" />
        <span className="absolute left-1/2 top-3.5 h-7 w-0.5 bg-white/80" />
      </span>
      <p className="display text-3xl">{APP_NAME}</p>
      <p className="text-sm font-medium text-ink-2">{text}</p>
    </div>,
    document.body,
  );
}

/**
 * The splash while the surrounding form is being sent, and through the redirect that follows.
 * With `intent`, only when that button was the one pressed (Entrar, not Crear cuenta).
 */
export function FormSplash({ text, intent }: { text: string; intent?: string }) {
  const { pending, data } = useFormStatus();
  if (!pending || (intent && data?.get("intent") !== intent)) return null;
  return <Splash text={text} />;
}

/**
 * Inside the sign-out form: when it is sent, what this person kept on the device (the advisor's
 * saved conversations) is forgotten, so the next person on this browser does not see it.
 */
export function ForgetOnSignOut() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form[data-sign-out]");
    const forget = () => {
      try {
        for (const key of Object.keys(localStorage)) if (key.startsWith("guaca-asesor-")) localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    };
    form?.addEventListener("submit", forget);
    return () => form?.removeEventListener("submit", forget);
  }, []);
  return null;
}

/**
 * iOS Safari only shows :active styles when the page listens for touches. With this, every button
 * gives under the finger the moment it is touched instead of looking frozen.
 */
export function TouchFeedback() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
