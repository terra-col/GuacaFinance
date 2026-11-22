import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookieOptions } from "./supabase/session-cookies.ts";

test("session cookies: kept long by default, browser-session only without «mantener la sesión»", () => {
  const options = { path: "/", maxAge: 34560000, sameSite: "lax" as const };
  assert.deepEqual(sessionCookieOptions(options, true), options);
  assert.deepEqual(sessionCookieOptions({ ...options, expires: new Date(0) }, false), { path: "/", sameSite: "lax" });
});
