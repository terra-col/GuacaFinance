import { AdvisorChat } from "@/components/advisor-chat";
import Link from "next/link";
import { AdvisorMark } from "@/components/advisor-mark";
import { aiProvider } from "@/lib/ai-provider";
import { loadData } from "@/lib/data";

export default async function AdvisorPage() {
  await loadData(); // signed-in check
  const provider = aiProvider();
  const aiReady = provider !== null;

  return (
    <>
      <div className="pt-2">
        <h1 className="display flex items-center gap-3 text-3xl">
          <span className="fab flex size-11 items-center justify-center rounded-2xl" aria-hidden="true">
            <AdvisorMark className="size-6" />
          </span>
          Asesor IA
        </h1>
        <p className="text-sm text-ink-3">
          {aiReady && <span className="pill pill-idea mr-1.5">{provider === "gemini" ? "Con Gemini" : "Con Claude"}</span>}
          Pregúntale cómo pagar tus deudas, cuánto ahorrar para una meta o cómo repartir el salario. Usa tus saldos, tasas, pagos fijos, ingresos, presupuestos y metas. Es una guía, no asesoría financiera certificada. Para simular abonos, mira el{" "}
          <Link href="/deudas#plan" className="font-medium text-brand">
            plan de pagos
          </Link>
          .
        </p>
      </div>

      {aiReady ? (
        <AdvisorChat />
      ) : (
        <section className="card flex flex-col gap-2 text-sm text-ink-2">
          <p className="font-semibold text-ink">El asesor con IA aún no está encendido.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Entra a <span className="font-medium text-ink">aistudio.google.com</span> con tu cuenta de Google y crea una clave en <span className="font-medium text-ink">Get API key</span>. El plan gratis alcanza para uso personal.
            </li>
            <li>
              En Vercel → tu proyecto → Settings → Environment Variables, agrega <code>GEMINI_API_KEY</code> con esa clave.
            </li>
            <li>Vuelve a desplegar. Este recuadro se convierte en el chat.</li>
          </ol>
          <p className="text-xs text-ink-3">
            Cada pregunta envía a Google un resumen de tus cuentas (saldos, tasas, pagos fijos, metas). En el plan gratis, Google puede usar lo que envías para mejorar sus productos. Si prefieres Claude, usa <code>ANTHROPIC_API_KEY</code> en su lugar (se paga por uso).
          </p>
        </section>
      )}
    </>
  );
}
