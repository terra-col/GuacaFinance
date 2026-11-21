import Anthropic from "@anthropic-ai/sdk";
import { ADVISOR_SYSTEM, advisorContext } from "@/lib/advisor-context";
import { advisorStream, aiProvider, geminiModels, geminiRequest, geminiStreamUrl, retryable, type ChatTurn } from "@/lib/ai-provider";
import { loadData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Only applies on Vercel; on Easypanel the limit is GEMINI_LIMIT_MS below.
export const maxDuration = 300;

type ChatMessage = ChatTurn;

const MAX_TURNS = 30;
const MAX_CHARS = 4000;
/** The longest a streamed Gemini answer may run. */
const GEMINI_LIMIT_MS = 3 * 60_000;

/**
 * One turn of the advisor chat. The conversation lives in the browser; each
 * question rebuilds the snapshot of the person's finances from the database
 * (with their session, so Row Level Security applies) and sends it to Gemini
 * or Claude, whichever has a key.
 */
export async function POST(request: Request) {
  const provider = aiProvider();
  if (!provider) return Response.json({ error: "El asesor no está configurado." }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión de nuevo." }, { status: 401 });

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = (body?.messages ?? []).slice(-MAX_TURNS);
  } catch {
    return Response.json({ error: "Mensaje no válido." }, { status: 400 });
  }
  const valid =
    messages.length > 0 &&
    messages.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= MAX_CHARS) &&
    messages[0].role === "user" &&
    messages[messages.length - 1].role === "user";
  if (!valid) return Response.json({ error: "Mensaje no válido." }, { status: 400 });

  // Always answer JSON: an uncaught error would send Next's HTML error page, which the chat cannot read.
  let system: string[];
  try {
    system = [ADVISOR_SYSTEM, advisorContext(await loadData())];
  } catch (error) {
    console.error("asesor: loading the snapshot failed", error);
    return Response.json({ error: "No pude leer tus datos para responder. Recarga la página e intenta de nuevo." }, { status: 500 });
  }
  const fallback = "No pude armar una respuesta. Intenta preguntarlo de otra forma.";

  if (provider === "gemini") {
    // Long answers (a month-by-month plan) take Gemini more than a minute, so the answer is streamed
    // as it is written. The request stops if the person leaves the page, or after GEMINI_LIMIT_MS.
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(GEMINI_LIMIT_MS)]);
    const body = JSON.stringify(geminiRequest(system, messages, 6000));
    const ask = (model: string) =>
      fetch(geminiStreamUrl(model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body,
        signal,
      }).catch((error) => {
        console.error(`asesor: Gemini ${model} request failed`, error);
        return null;
      });

    // Google's models get overloaded at times (503). One more try after a second, then the next
    // model in the list, which has its own capacity. Errors that would repeat stop at once.
    let upstream: Response | null = null;
    let status: number | null = null;
    let mainStatus: number | null = null;
    const models = geminiModels();
    attempts: for (const [index, model] of models.entries()) {
      for (const wait of [0, 1000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        upstream = await ask(model);
        status = upstream?.status ?? null;
        if (upstream?.ok && upstream.body) break attempts;
        if (upstream) console.error(`asesor: Gemini ${model} answered`, status, (await upstream.text().catch(() => "")).slice(0, 300));
        if (index === 0) mainStatus = status;
        if (signal.aborted) break attempts;
        // A fallback that no longer exists is skipped; the main model's errors are the ones to report.
        if (index > 0 && status === 404) break;
        if (!retryable(status)) break attempts;
        if (status !== 503) break; // a spent quota or a hiccup: straight to the next model
      }
    }
    if (!upstream?.ok || !upstream.body) {
      // Report the main model's problem when a fallback only failed for being gone.
      if (status === 404 && mainStatus !== null && mainStatus !== 404) status = mainStatus;
      const message =
        status === 400 || status === 403
          ? "La clave de Gemini no es válida o el modelo no está disponible."
          : status === 404
            ? "Ese modelo de Gemini ya no existe; cambia GUACA_GEMINI_MODEL."
            : status === 429
              ? "Llegaste al límite gratis de Gemini por ahora; espera un momento."
              : status === 503
                ? "Gemini está saturado en este momento. Intenta de nuevo en un minuto."
                : `El asesor no respondió (Gemini ${status ? `respondió ${status}` : "no contestó"}). Intenta de nuevo.`;
      return Response.json({ error: message }, { status: 502 });
    }

    const stream = advisorStream(upstream.body, {
      fallback,
      errorMessage(error) {
        console.error("asesor: Gemini stream broke off", error);
        return error instanceof Error && error.name === "TimeoutError"
          ? "La respuesta tardó demasiado y se cortó. Pide una parte más concreta del plan."
          : "La respuesta se cortó. Intenta de nuevo.";
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        // no-transform keeps Next from gzipping it (gzip holds pieces back); X-Accel-Buffering is for nginx-style proxies.
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: process.env.GUACA_AI_MODEL || "claude-sonnet-5-5",
      max_tokens: 6000,
      system: system.map((text) => ({ type: "text" as const, text })),
      messages,
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return Response.json({ text: text || fallback });
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : 500;
    const message = status === 401 ? "La clave de la API no es válida." : status === 429 ? "Demasiadas preguntas seguidas; espera un momento." : "El asesor no respondió. Intenta de nuevo.";
    return Response.json({ error: message }, { status: 502 });
  }
}
