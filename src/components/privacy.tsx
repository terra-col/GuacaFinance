"use client";

import { useEffect, useState } from "react";
import { MASK, PRIVACY_COOKIE, maskMoney } from "@/lib/privacy";

const EVENT = "guaca:privacy";
const isOn = () => document.documentElement.dataset.privacy === "on";

/**
 * Modo privado at work: while it is on, every amount of money in the page's text becomes
 * "$ •••••", also what arrives later (a new screen, an animated number, a chart's tooltip). The
 * real text is kept aside and comes back when it is turned off. Fields where amounts are typed
 * are left alone.
 */
export function PrivacyMask() {
  useEffect(() => {
    const originals = new Map<Text, string>();
    const skip = (node: Node) => Boolean(node.parentElement?.closest("input, textarea, script, style, [data-no-mask]"));

    const mask = (t: Text) => {
      if (skip(t)) return;
      const value = t.nodeValue ?? "";
      const masked = maskMoney(value);
      if (masked === null) return;
      originals.set(t, value);
      t.nodeValue = masked;
    };
    const maskTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return mask(root as Text);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) mask(n as Text);
    };
    const restore = () => {
      for (const [t, value] of originals) if (t.isConnected) t.nodeValue = value;
      originals.clear();
    };

    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") r.addedNodes.forEach(maskTree);
        else if (r.type === "characterData") {
          const t = r.target as Text;
          // A masked node the page itself rewrote (an animated number): mask the new value.
          if (!(t.nodeValue ?? "").includes(MASK)) mask(t);
        }
      }
      observer.takeRecords(); // our own rewrites above
    });

    const apply = () => {
      observer.disconnect();
      if (isOn()) {
        maskTree(document.body);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      } else restore();
      // The first paint was blurred until now (see globals.css).
      document.documentElement.dataset.masked = "";
    };
    apply();
    window.addEventListener(EVENT, apply);
    return () => {
      window.removeEventListener(EVENT, apply);
      observer.disconnect();
      restore();
    };
  }, []);
  return null;
}

/** The eye in the header: shows or hides every amount. Remembered on this device. */
export function PrivacyToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  function toggle() {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.dataset.privacy = "on";
    else delete document.documentElement.dataset.privacy;
    document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mostrar saldos" : "Ocultar saldos"}
      title={on ? "Mostrar saldos" : "Ocultar saldos (modo privado)"}
      className={`flex size-10 items-center justify-center rounded-xl ${on ? "fab" : "liquid"}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {on ? (
          <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.6 8 3.4 9.8 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        ) : (
          <>
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
