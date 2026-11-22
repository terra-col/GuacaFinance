"use client";

import { useEffect } from "react";
import { readNotices } from "@/app/shared-actions";
import { NOTICES_READ } from "./notice-bell";

/** Seeing Avisos is reading them: up to the newest shown, not those that arrive meanwhile. */
export function MarkRead({ until }: { until: string }) {
  useEffect(() => {
    readNotices(until).then(
      () => window.dispatchEvent(new Event(NOTICES_READ)),
      () => {},
    );
  }, [until]);
  return null;
}
