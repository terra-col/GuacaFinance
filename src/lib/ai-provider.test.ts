import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorStream, aiProvider, geminiChunkText, geminiModels, geminiRequest, geminiText, retryable, takeSseData } from "./ai-provider.ts";

test("advisor: models to try, main first, no repeats; which failures deserve another try", () => {
  assert.deepEqual(geminiModels({}), ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]);
  assert.deepEqual(geminiModels({ main: "m1", fallback: " m2 , m1,, m3 " }), ["m1", "m2", "m3"]);
  assert.deepEqual(geminiModels({ main: "m1", fallback: "" }), ["m1"], "fallbacks can be turned off");
  assert.deepEqual([503, 500, 429, null].map(retryable), [true, true, true, true]);
  assert.deepEqual([400, 403, 404].map(retryable), [false, false, false]);
});

const piece = (text: string, thought = false) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text, thought }] } }] })}\n\n`;

function sseFrom(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function linesOf(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test("advisor stream: SSE events split across reads", () => {
  assert.deepEqual(takeSseData("data: a\n\ndata: b"), { events: ["a"], rest: "data: b" });
  assert.deepEqual(takeSseData("data: a\r\n\r\n: comment\n\n"), { events: ["a"], rest: "" });
  assert.equal(geminiChunkText({ candidates: [{ content: { parts: [{ text: " primero " }] } }] }), " primero ");
});

test("advisor stream: answer pieces become JSON lines, thoughts are dropped", async () => {
  const whole = piece("pensando", true) + piece("Abona ") + piece("primero.");
  // Cut in the middle of an event, as the network does.
  const lines = await linesOf(advisorStream(sseFrom([whole.slice(0, 40), whole.slice(40)]), { fallback: "nada", errorMessage: () => "x" }));
  assert.deepEqual(lines, [{ text: "Abona " }, { text: "primero." }]);
});

test("advisor stream: empty answer gives the fallback, a broken stream gives an error line", async () => {
  assert.deepEqual(await linesOf(advisorStream(sseFrom([piece("solo pienso", true)]), { fallback: "nada", errorMessage: () => "x" })), [{ text: "nada" }]);
  // One piece arrives, then the connection drops on the next read.
  let reads = 0;
  const broken = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(new TextEncoder().encode(piece("Hola ")));
      else controller.error(new Error("corte"));
    },
  });
  assert.deepEqual(await linesOf(advisorStream(broken, { fallback: "nada", errorMessage: () => "Se cortó" })), [{ text: "Hola " }, { error: "Se cortó" }]);
});

test("advisor: Gemini first when both keys exist, then Claude, else off", () => {
  const saved = { g: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  process.env.GEMINI_API_KEY = "g";
  process.env.ANTHROPIC_API_KEY = "a";
  assert.equal(aiProvider(), "gemini");
  delete process.env.GEMINI_API_KEY;
  assert.equal(aiProvider(), "claude");
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(aiProvider(), null);
  if (saved.g) process.env.GEMINI_API_KEY = saved.g;
  if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
});

test("advisor: Gemini request and answer shapes", () => {
  const body = geminiRequest(["reglas", "datos"], [{ role: "user", content: "hola" }, { role: "assistant", content: "¿qué tal?" }, { role: "user", content: "plan" }], 100);
  assert.deepEqual(body.systemInstruction.parts, [{ text: "reglas" }, { text: "datos" }]);
  assert.deepEqual(body.contents.map((c) => c.role), ["user", "model", "user"]);
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: "Abona " }, { text: "primero." }] } }] }), "Abona primero.");
  assert.equal(geminiText({}), "");
});
