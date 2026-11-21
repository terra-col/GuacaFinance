// Which AI answers the advisor. Gemini goes first when its key is set because
// Google's free tier covers personal use; Claude is the alternative.

export type Provider = "gemini" | "claude";

export function aiProvider(): Provider | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

/** A free-tier Gemini model; override with GUACA_GEMINI_MODEL if Google renames it. */
export const GEMINI_MODEL = () => process.env.GUACA_GEMINI_MODEL || "gemini-3.8-flash";

/**
 * The models to try, in order: the main one, then the fallbacks (GUACA_GEMINI_FALLBACK, comma
 * separated). Each model has its own capacity, so when one is overloaded another usually answers.
 */
export function geminiModels(env: { main?: string; fallback?: string } = { main: process.env.GUACA_GEMINI_MODEL, fallback: process.env.GUACA_GEMINI_FALLBACK }): string[] {
  const main = env.main || "gemini-3.8-flash";
  const rest = (env.fallback ?? "gemini-3.5-flash,gemini-3.1-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([main, ...rest])];
}

/**
 * Whether a failed answer is worth another try: overloaded (503), a server hiccup (500) or a
 * spent quota (429, per model). A bad key or request (400, 403) or a gone model (404) is not:
 * those fail the same everywhere, or need fixing.
 */
export const retryable = (status: number | null) => status === null || status === 429 || status === 500 || status === 503;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** The same conversation in the shape the Gemini API expects. */
export function geminiRequest(system: string[], messages: ChatTurn[], maxTokens: number) {
  return {
    systemInstruction: { parts: system.map((text) => ({ text })) },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: maxTokens },
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

/** The answer's text, without the model's internal "thought" parts. */
export function geminiText(response: GeminiResponse): string {
  return geminiChunkText(response).trim();
}

/** The text of one streamed piece, untrimmed: the spaces between pieces belong to the answer. */
export function geminiChunkText(response: GeminiResponse): string {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** Gemini's streaming endpoint, as server-sent events. */
export const geminiStreamUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

/**
 * The complete server-sent events in `buffer` (their `data:` payloads) and the
 * unfinished tail to keep for the next read.
 */
export function takeSseData(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n"),
    )
    .filter(Boolean);
  return { events, rest };
}

/**
 * What the advisor route streams to the chat: one JSON object per line,
 * `{"text": "..."}` for each piece of the answer or `{"error": "..."}` if it
 * breaks off. Blank lines are a heartbeat so no proxy closes a quiet
 * connection while the model is still thinking.
 */
export function advisorStream(
  sse: ReadableStream<Uint8Array>,
  { fallback, heartbeatMs = 10_000, errorMessage }: { fallback: string; heartbeatMs?: number; errorMessage: (error: unknown) => string },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = sse.getReader();
  let beat: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (value: object | null) => controller.enqueue(encoder.encode(value ? `${JSON.stringify(value)}\n` : "\n"));
      line(null); // send the headers now
      beat = setInterval(() => line(null), heartbeatMs);

      const decoder = new TextDecoder();
      let buffer = "";
      let wrote = false;
      const emit = (events: string[]) => {
        for (const event of events) {
          let text = "";
          try {
            text = geminiChunkText(JSON.parse(event));
          } catch {
            continue; // a malformed piece is skipped, not fatal
          }
          if (!text) continue;
          line({ text });
          wrote = true;
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = takeSseData(buffer);
          buffer = rest;
          emit(events);
        }
        emit(takeSseData(`${buffer}${decoder.decode()}\n\n`).events);
        if (!wrote) line({ text: fallback });
      } catch (error) {
        line({ error: errorMessage(error) });
      } finally {
        clearInterval(beat);
        controller.close();
      }
    },
    cancel() {
      clearInterval(beat);
      return reader.cancel();
    },
  });
}
