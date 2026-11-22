"use client";

import { useActionState, useState } from "react";
import { FormSplash } from "@/components/splash";
import { SubmitButton } from "@/components/submit-button";
import { authenticate, type FormState } from "../actions";

/**
 * Entrar, or create an account (which asks for the name the app greets you by). Signing in can
 * keep the session (the default) or end it when the browser closes.
 */
export function LoginForm({ startWithSignup = false }: { startWithSignup?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(authenticate, {});
  const [mode, setMode] = useState<"login" | "signup">(startWithSignup ? "signup" : "login");
  const signup = mode === "signup";

  return (
    <form action={action} className="card flex flex-col gap-4">
      <input type="hidden" name="intent" value={mode} />
      <div className="flex justify-center">
        <div className="segmented" role="tablist" aria-label="Entrar o crear cuenta" style={{ "--n": 2, "--i": signup ? 1 : 0 } as React.CSSProperties}>
          <span aria-hidden="true" className="segmented-thumb" />
          {(
            [
              ["login", "Entrar"],
              ["signup", "Crear cuenta"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} data-on={mode === value ? "" : undefined} className="segment" onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {signup && (
        <label className="field rise">
          Tu nombre
          <input className="input" name="name" autoComplete="given-name" placeholder="Así te saludamos en la app" maxLength={60} required />
        </label>
      )}
      <label className="field">
        Correo
        <input className="input" type="email" name="email" autoComplete="email" required />
      </label>
      <label className="field">
        Contraseña
        <input className="input" type="password" name="password" autoComplete={signup ? "new-password" : "current-password"} minLength={6} required />
      </label>
      {!signup && (
        <label className="check-row">
          <input type="checkbox" name="remember" defaultChecked />
          <span>
            <span className="font-medium text-ink">Mantener la sesión iniciada</span>
            <span className="block text-xs text-ink-3">Desmárcalo en un computador prestado: la sesión se cierra al cerrar el navegador.</span>
          </span>
        </label>
      )}
      {state.error && <p role="alert" className="alert">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-ink-2">{state.message}</p>}
      <SubmitButton className="btn h-11">{signup ? "Crear cuenta" : "Entrar"}</SubmitButton>
      {/* Stays up through the redirect, until the first screen of the app arrives. */}
      <FormSplash text={signup ? "Creando tu cuenta…" : "Abriendo tus finanzas…"} />
    </form>
  );
}
