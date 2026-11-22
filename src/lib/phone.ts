// The phone number asked at sign-up and in the profile: a Colombian mobile, kept as +57 and ten
// digits. For now it is only saved with the profile; signing in with it needs an SMS provider.

/** "+573001234567" from "300 123 4567", "+57 300-123-4567" or "57 3001234567"; null when empty, "invalid" otherwise. */
export function normalizePhone(raw: string): string | null | "invalid" {
  const digits = raw.replace(/[\s().-]/g, "");
  if (!digits) return null;
  const national = digits.replace(/^(\+57|0057|57)(?=3\d{9}$)/, "");
  return /^3\d{9}$/.test(national) ? `+57${national}` : "invalid";
}

/** "300 123 4567", the way it is written in Colombia (without the +57). */
export function formatPhone(phone: string | null | undefined): string {
  const national = (phone ?? "").replace(/^\+57/, "");
  return /^\d{10}$/.test(national) ? `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}` : (phone ?? "");
}

/** The phone saved with the profile (user_metadata.phone), or "". */
export function profilePhone(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): string {
  const phone = user?.user_metadata?.phone;
  return typeof phone === "string" ? phone : "";
}
