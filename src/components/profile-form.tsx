"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateProfile, type FormState } from "@/app/actions";
import { formatPhone } from "@/lib/phone";
import { SubmitButton } from "./submit-button";

/** «Tu perfil» in Ajustes: the name the app greets you by, your email and phone, and changing the password. */
export function ProfileForm({ name, email, phone }: { name: string; email: string; phone: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Tu nombre
          <input className="input" name="name" defaultValue={name} autoComplete="given-name" placeholder="Así te saludamos" maxLength={60} required />
        </label>
        <label className="field">
          <span>
            Celular <span className="font-normal text-ink-3">(opcional)</span>
          </span>
          <input className="input num" type="tel" name="phone" inputMode="tel" defaultValue={formatPhone(phone)} autoComplete="tel-national" placeholder="300 123 4567" maxLength={20} />
          <span className="text-xs font-normal text-ink-3">Con este número te llegan las invitaciones a dividir gastos.</span>
        </label>
        <label className="field sm:col-span-2">
          Correo
          <input className="input" type="email" name="email" defaultValue={email} autoComplete="email" required />
        </label>
      </div>
      <p className="text-xs text-ink-3">Si cambias el correo, te enviamos un enlace al nuevo para confirmarlo; hasta entonces sigues entrando con el actual.</p>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm font-medium text-ink-2">
          ✓ {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton className="btn">Guardar</SubmitButton>
        <Link href="/nueva-clave" className="text-sm font-medium text-brand">
          Cambiar contraseña
        </Link>
      </div>
    </form>
  );
}
