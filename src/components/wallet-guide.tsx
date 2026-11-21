import { Carousel } from "./carousel";
import { CopyField } from "./copy-button";
import { Icon } from "./icons";

/*
 * The Apple Wallet setup as a carousel of steps. Each step has a drawing of the iPhone screen
 * (simplified, in the app's colours, so it reads in both themes and does not age with every iOS
 * release) with what to tap highlighted, and the values to copy where they are needed.
 */

/** A simplified phone screen: status bar, title, content. */
function Phone({ title, back, children }: { title: string; back?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[14rem] rounded-[2.2rem] border-[6px] border-[#16132e] bg-bg p-2 shadow-lg ring-1 ring-white/10">
      <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold text-ink-2">
        <span className="num">9:41</span>
        <span className="h-3.5 w-14 rounded-full bg-[#16132e]" aria-hidden="true" />
        <span aria-hidden="true">●●●</span>
      </div>
      <div className="flex min-h-[18rem] flex-col gap-1.5 rounded-[1.5rem] bg-surface/80 p-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-brand">{back ? `‹ ${back}` : ""}</span>
        </div>
        <p className="text-sm font-bold leading-tight text-ink">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** The spot to tap: a brand ring and a pulsing dot. */
function Tap() {
  return (
    <span aria-hidden="true" className="absolute -right-1 -top-1 flex size-3.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
      <span className="relative inline-flex size-3.5 rounded-full border-2 border-surface bg-brand" />
    </span>
  );
}

/** A row of an iOS list, optionally the one to tap. */
function Row({ icon, label, value, hi, tone = "bg-brand" }: { icon?: React.ReactNode; label: React.ReactNode; value?: React.ReactNode; hi?: boolean; tone?: string }) {
  return (
    <div className={`relative flex items-center gap-2 rounded-lg bg-bg/70 px-2 py-1.5 text-[11px] ${hi ? "ring-2 ring-brand" : ""}`}>
      {icon !== undefined && <span className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] text-white ${tone}`}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
      {value && <span className="shrink-0 text-ink-3">{value}</span>}
      {hi && <Tap />}
    </div>
  );
}

/** A variable chip, the blue pills Shortcuts uses for values that come from the payment. */
function Variable({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-brand/15 px-1.5 py-0.5 font-semibold text-brand">{children}</span>;
}

/** A tab bar at the bottom of the phone, with the chosen tab highlighted. */
function Tabs({ items, on }: { items: string[]; on: number }) {
  return (
    <div className="mt-auto grid grid-cols-[1fr_1.7fr_1fr] gap-1 border-t border-line pt-1.5 text-center text-[9px]">
      {items.map((t, i) => (
        <span key={t} className={`relative rounded-md py-1 ${i === on ? "bg-brand/10 font-semibold text-brand ring-2 ring-brand" : "text-ink-3"}`}>
          {t}
          {i === on && <Tap />}
        </span>
      ))}
    </div>
  );
}

function Step({ n, total, title, children, phone }: { n: number; total: number; title: string; children: React.ReactNode; phone: React.ReactNode }) {
  return (
    <li className="rise flex w-[86%] shrink-0 snap-start flex-col gap-3 rounded-3xl border border-line bg-surface/60 p-4 sm:w-[21rem]" style={{ "--i": n } as React.CSSProperties}>
      <div className="flex items-center gap-2.5">
        <span className="fab flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">{n}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink-3">
            Paso {n} de {total}
          </p>
          <h4 className="font-semibold leading-tight">{title}</h4>
        </div>
      </div>
      {phone}
      <div className="flex flex-col gap-2 text-sm text-ink-2">{children}</div>
    </li>
  );
}

export function WalletGuide({ origin }: { origin: string }) {
  const url = `${origin}/api/wallet`;
  const total = 10;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="display text-xl">Cómo configurarlo</h3>
        <p className="text-xs text-ink-3">{total} pasos · desliza</p>
      </div>
      <Carousel label="Pasos para configurar Apple Wallet">
        <Step
          n={1}
          total={total}
          title="Genera tu token en Guaca"
          phone={
            <Phone title="Ajustes">
              <Row icon="W" label="Apple Wallet" value="Sin token" />
              <div className="relative self-start rounded-lg bg-brand px-3 py-1 text-[11px] font-semibold text-white ring-2 ring-brand ring-offset-2 ring-offset-surface">
                Generar
                <Tap />
              </div>
              <p className="text-[10px] text-ink-3">Tu token: k3Jx…9Qa · cópialo ahora</p>
            </Phone>
          }
        >
          <p>Arriba en esta sección toca «Generar» y copia el token: es la llave que deja al iPhone registrar tus pagos. Solo se muestra una vez; si lo pierdes, genera otro.</p>
        </Step>

        <Step
          n={2}
          total={total}
          title="Abre Atajos → Automatización"
          phone={
            <Phone title="Automatización">
              <div className="relative ml-auto -mt-7 flex size-6 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand ring-2 ring-brand">
                +
                <Tap />
              </div>
              <Row icon="" label="Cuando son las 7:00" tone="bg-[var(--warn)]" />
              <Row icon="" label="Cuando llego a casa" tone="bg-[var(--savings)]" />
              <Tabs items={["Atajos", "Automatización", "Galería"]} on={1} />
            </Phone>
          }
        >
          <p>
            En el iPhone abre la app <strong className="text-ink">Atajos</strong>, entra a la pestaña <strong className="text-ink">Automatización</strong> y toca{" "}
            <strong className="text-ink">«+»</strong> (o «Nueva automatización» si es la primera).
          </p>
        </Step>

        <Step
          n={3}
          total={total}
          title="Elige «Wallet»"
          phone={
            <Phone title="Nueva automatización" back="Cancelar">
              <Row icon="" label="Hora del día" tone="bg-[var(--warn)]" />
              <Row icon="" label="Alarma" tone="bg-[var(--debt)]" />
              <Row icon={<Icon name="card" className="size-3.5" strokeWidth={2.2} />} label="Wallet" hi tone="bg-[#16132e]" />
              <Row icon="" label="Llegar" tone="bg-[var(--savings)]" />
            </Phone>
          }
        >
          <p>
            Busca <strong className="text-ink">Wallet</strong> en la lista. En iOS 17 y 18 se llama <strong className="text-ink">«Transacción»</strong>.
          </p>
        </Step>

        <Step
          n={4}
          total={total}
          title="Tarjetas, categorías y sin preguntar"
          phone={
            <Phone title="Cuando toco con…" back="Atrás">
              <Row label="Tarjetas" value="Todas ›" />
              <Row label="Categorías" value="Todas ›" />
              <div className="relative flex items-center justify-between rounded-lg bg-bg/70 px-2 py-1.5 text-[11px] ring-2 ring-brand">
                <span className="text-ink">Ejecutar inmediatamente</span>
                <span className="flex h-4 w-7 items-center rounded-full bg-[var(--savings)] p-0.5">
                  <span className="ml-auto size-3 rounded-full bg-white" />
                </span>
                <Tap />
              </div>
              <span className="mt-auto self-end text-[11px] font-semibold text-brand">Siguiente ›</span>
            </Phone>
          }
        >
          <p>
            Elige las tarjetas que quieres registrar (o todas), deja <strong className="text-ink">todas las categorías</strong> y activa{" "}
            <strong className="text-ink">«Ejecutar inmediatamente»</strong> para que no te pregunte cada vez. Toca «Siguiente».
          </p>
        </Step>

        <Step
          n={5}
          total={total}
          title="Acción «Obtener contenido de URL»"
          phone={
            <Phone title="Nuevo atajo en blanco" back="Atrás">
              <div className="rounded-lg bg-bg/70 px-2 py-1.5 text-[11px] text-ink-3">Buscar «URL»</div>
              <Row icon={<Icon name="income" className="size-3.5" strokeWidth={2.2} />} label="Obtener contenido de URL" hi />
              <Row icon="" label="URL" tone="bg-[var(--savings)]" />
              <Row icon="" label="Expandir URL" tone="bg-ink-3" />
            </Phone>
          }
        >
          <p>
            Elige <strong className="text-ink">«Nuevo atajo en blanco»</strong>, toca «Agregar acción», busca <strong className="text-ink">URL</strong> y elige{" "}
            <strong className="text-ink">«Obtener contenido de URL»</strong>.
          </p>
        </Step>

        <Step
          n={6}
          total={total}
          title="Dirección y método POST"
          phone={
            <Phone title="Al tocar con Wallet">
              <div className="flex flex-col gap-1 rounded-lg bg-bg/70 p-2 text-[11px]">
                <p className="text-ink">
                  Obtener contenido de <Variable>{origin.replace(/^https?:\/\//, "").slice(0, 16)}…</Variable>
                </p>
                <span className="text-[10px] text-ink-3">Mostrar más ⌄</span>
              </div>
              <Row label="Método" value={<span className="font-semibold text-brand">POST</span>} hi />
              <Row label="Encabezados" value="›" />
              <Row label="Cuerpo de la solicitud" value="›" />
            </Phone>
          }
        >
          <p>Toca «URL» en la acción y pega esta dirección:</p>
          <CopyField value={url} />
          <p>
            Luego toca <strong className="text-ink">«Mostrar más»</strong> y cambia el <strong className="text-ink">Método</strong> a{" "}
            <strong className="text-ink">POST</strong>.
          </p>
        </Step>

        <Step
          n={7}
          total={total}
          title="Encabezado con tu token"
          phone={
            <Phone title="Encabezados">
              <div className="relative flex flex-col gap-1 rounded-lg bg-bg/70 p-2 text-[11px] ring-2 ring-brand">
                <span className="text-ink-3">Clave</span>
                <span className="font-semibold text-ink">Authorization</span>
                <span className="text-ink-3">Texto</span>
                <span className="font-semibold text-ink">Bearer k3Jx…9Qa</span>
                <Tap />
              </div>
              <span className="text-[11px] font-medium text-brand">+ Agregar nuevo encabezado</span>
            </Phone>
          }
        >
          <p>
            En <strong className="text-ink">Encabezados</strong> toca «Agregar nuevo encabezado». En la clave escribe:
          </p>
          <CopyField value="Authorization" />
          <p>
            Y en el texto, la palabra <code>Bearer</code>, un espacio y tu token:
          </p>
          <CopyField value="Bearer " label="Copiar «Bearer »" />
        </Step>

        <Step
          n={8}
          total={total}
          title="Cuerpo JSON con los datos del pago"
          phone={
            <Phone title="Cuerpo de la solicitud">
              <Row label="Tipo" value={<span className="font-semibold text-brand">JSON</span>} />
              <Row label={<code>card</code>} value={<Variable>Tarjeta o pase</Variable>} hi />
              <Row label={<code>merchant</code>} value={<Variable>Comercio</Variable>} />
              <Row label={<code>amount</code>} value={<Variable>Importe</Variable>} />
            </Phone>
          }
        >
          <p>
            En <strong className="text-ink">Cuerpo de la solicitud</strong> elige <strong className="text-ink">JSON</strong> y agrega tres campos de tipo{" "}
            <strong className="text-ink">Texto</strong>:
          </p>
          <ul className="flex flex-col gap-1 text-xs">
            <li>
              <code>card</code> → toca el valor, elige <Variable>Entrada del atajo</Variable> y luego «Tarjeta o pase»
            </li>
            <li>
              <code>merchant</code> → «Comercio»
            </li>
            <li>
              <code>amount</code> → «Importe»
            </li>
          </ul>
          <p className="text-xs text-ink-3">Los nombres van en minúscula, exactamente así.</p>
        </Step>

        <Step
          n={9}
          total={total}
          title="Un aviso al pagar (opcional)"
          phone={
            <Phone title="Pantalla bloqueada">
              <div className="relative mt-4 flex gap-2 rounded-xl bg-bg/90 p-2 shadow ring-2 ring-brand">
                <span className="fab flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold">G</span>
                <div className="min-w-0 text-[10px] leading-snug">
                  <p className="font-semibold text-ink">Atajos</p>
                  <p className="text-ink-2">Registrado: $ 85.000 en Éxito</p>
                </div>
                <Tap />
              </div>
            </Phone>
          }
        >
          <p>
            Para ver qué se registró, agrega <strong className="text-ink">«Obtener valor del diccionario»</strong> con la clave <code>message</code> y después{" "}
            <strong className="text-ink">«Mostrar notificación»</strong> con ese valor. Dirá, por ejemplo, «Registrado: $ 85.000 en Éxito».
          </p>
        </Step>

        <Step
          n={10}
          total={total}
          title="Paga y vincula la tarjeta"
          phone={
            <Phone title="Movimientos">
              <p className="text-[10px] font-semibold text-ink-3">POR REVISAR</p>
              <div className="relative flex flex-col gap-1 rounded-lg bg-bg/70 p-2 text-[11px] ring-2 ring-brand">
                <p className="text-ink">
                  <strong>Visa Oro</strong> · Éxito
                </p>
                <p className="num font-semibold text-ink">$ 85.000</p>
                <span className="self-start rounded-md bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Registrar</span>
                <Tap />
              </div>
            </Phone>
          }
        >
          <p>
            Paga algo con Apple Pay. La <strong className="text-ink">primera vez</strong> con cada tarjeta, el pago llega a{" "}
            <strong className="text-ink">«Por revisar»</strong> en Movimientos: elige la cuenta, regístralo y la tarjeta queda vinculada.
          </p>
          <p>Desde ahí, los pagos con esa tarjeta entran solos. La verás arriba, en «Tarjetas vinculadas».</p>
        </Step>
      </Carousel>
      <p className="text-xs text-ink-3">Solo registra pagos con Apple Pay (iPhone o Apple Watch), no con la tarjeta física. Las pantallas pueden variar un poco según tu versión de iOS.</p>
    </div>
  );
}
