/** The product's name, in one place so renaming it is a one-line change. */
/** The name the person gave (when signing up or in Ajustes), or "" when there is none yet. */
export function profileName(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): string {
  const name = user?.user_metadata?.name;
  return typeof name === "string" ? name.trim() : "";
}

export const APP_NAME = "Guaca";
export const APP_TAGLINE = "Tu plata, clara y en movimiento.";
