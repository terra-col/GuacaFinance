// What every action of Compartidos and of the house reads and answers the same way.
import { contactPhone } from "./contacts";

export interface PersonInput {
  name: string;
  phone: string | null;
  known: string | null;
}

/** The functions raise in Spanish (P0001); anything else gets a plain answer. */
export function problem(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") return "Ya hay alguien con ese nombre en el grupo, o eso ya quedó registrado.";
  if (error.code === "PGRST202") return "Falta ejecutar en Supabase una migración de Compartidos (0016, 0020, 0023, 0024 o 0025).";
  if (error.code === "23514") return "Revisa los datos: hay un nombre, monto o texto que no es válido.";
  return "No se pudo guardar. Intenta de nuevo.";
}

/** The people of a form: `person`, `phone` and `known`, once for each. */
export function readPeople(form: FormData, { optional = false } = {}): { error: string } | { people: PersonInput[] } {
  const all = (name: string) => form.getAll(name).map((v) => String(v).trim());
  const [names, phones, known] = [all("person"), all("phone"), all("known")];
  const people: PersonInput[] = [];
  for (const [i, name] of names.entries()) {
    if (!name) {
      if (phones[i]) return { error: "Escribe el nombre de cada persona." };
      continue;
    }
    const phone = contactPhone(phones[i] ?? "");
    if (phone === "invalid") return { error: `Revisa el celular de ${name}: 10 dígitos que empiecen por 3, o con + y el código del país.` };
    if (phone && people.some((p) => p.phone === phone)) return { error: `El celular de ${name} está repetido.` };
    people.push({ name, phone, known: known[i] || null });
  }
  return people.length || optional ? { people } : { error: "Agrega al menos una persona." };
}
