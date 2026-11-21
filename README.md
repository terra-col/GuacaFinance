# Guaca

Plataforma personal para llevar cuentas de ahorros, tarjetas de crédito y créditos, y ver cómo cambian los saldos con cada pago y cada gasto. Todo en pesos colombianos.

Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth) · Tailwind 4 · Recharts.

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En el SQL Editor ejecuta, en orden, los archivos de `supabase/migrations/` (`0001` a `0011`).
3. Copia `.env.example` a `.env.local` y pon la URL y la clave *publishable* del proyecto.
4. `npm install && npm run dev`, abre http://localhost:3000 y usa **Crear cuenta**.
5. Como es de un solo usuario: después de crear tu cuenta, desactiva los registros nuevos en Supabase (Authentication → Sign In / Providers → *Allow new users to sign up*).

## Cómo se calculan los saldos

- Cada cuenta guarda un **saldo inicial** en una fecha. En ahorros es plata a favor; en tarjetas y créditos es lo que se debe.
- El saldo actual es el inicial más los movimientos (`src/lib/finance.ts`):
  - **Ingreso**: sube una cuenta de ahorros.
  - **Gasto**: baja una cuenta de ahorros o sube la deuda de una tarjeta.
  - **Pago**: baja la deuda de una tarjeta o crédito y, si indicas de qué cuenta sale, baja esa cuenta de ahorros.
- Los intereses no se calculan solos todavía: regístralos como gasto en la categoría «Intereses y cargos» cuando lleguen en el extracto.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Pruebas de saldos, recomendaciones, calendario y del SQL (en un Postgres embebido) |
| `npm run lint` | ESLint |

## Diseño

- Nombre de trabajo: **Guaca** (se cambia en `src/lib/brand.ts`).
- Módulos de vidrio esmerilado sobre un fondo de aurora suave; violeta para las acciones.
- Dos colores de datos que nunca cambian de significado: turquesa para lo que tienes y coral para lo que debes. El par se validó para daltonismo en fondo claro y oscuro.
- Outfit para títulos y cifras, Plus Jakarta Sans para la interfaz; ambas se sirven desde el propio proyecto.
- Barras y anillos con degradado que se dibujan al cargar, y gráfica de áreas. Con «reducir movimiento» activado, todo aparece en su estado final.
- Tema claro y oscuro según el sistema; en teléfonos la navegación flota abajo y «Registrar gasto» queda siempre a un toque.

## Metas y asesor

- **Metas**: ahorrar un monto antes de una fecha, o dejar una deuda en cero antes de una fecha. La app calcula cuánto apartar al mes, por quincena y por semana, y si vas al día.
- **Plan de pagos** (en Asesor): compara solo mínimos, avalancha y bola de nieve según cuánto puedes poner de más al mes, y muestra cuándo queda en cero cada deuda (`src/lib/planner.ts`).
- **Asesor con IA**: chat con Claude (`claude-sonnet-5-5`) que recibe un resumen de tus finanzas calculado por la app. Se enciende con la variable `ANTHROPIC_API_KEY` en Vercel; opcionalmente `GUACA_AI_MODEL` para cambiar de modelo. La conversación no se guarda.

## Seguridad

Las tablas tienen Row Level Security: cada fila pertenece a `auth.uid()`. El repositorio solo contiene código; los datos viven en tu proyecto de Supabase y `.env.local` no se sube.

## Apple Wallet

Apple no ofrece una API de Wallet para Colombia, así que la lectura automática usa la automatización «Wallet» de Atajos (iOS 17+): cada pago con Apple Pay hace un `POST /api/wallet` con la tarjeta, el comercio y el monto.

```
POST /api/wallet
Authorization: Bearer <token generado en Ajustes>
{ "card": "Visa Oro", "merchant": "Éxito", "amount": "$ 85.000,00" }
```

- Si la tarjeta está vinculada a una cuenta y el monto es válido, se registra el gasto (con la categoría usada la última vez en ese comercio).
- Si no, el pago queda en «por revisar» en Movimientos y no toca los saldos. Al resolverlo puedes vincular la tarjeta.
- Una repetición idéntica en menos de dos minutos se ignora.
- Solo captura pagos con Apple Pay desde el iPhone o el Apple Watch. La app debe estar desplegada en una URL pública (por ejemplo Vercel) para que el teléfono la alcance.

Los pasos para armar el Atajo están en la pantalla de Ajustes.

## Recibos y recordatorios

- **Deudas**: saldo de cada tarjeta con su porcentaje de cupo usado, y de cada crédito con cuánto llevas pagado, cuotas restantes, intereses estimados y cuál conviene abonar primero.
- **Tarjetas**: cada cuenta se dibuja como una tarjeta con el color de su banco (o el que elijas) y la imagen que subas; se edita en el detalle de la cuenta.
- **Pagos**: lista mensual de pagos obligatorios (pagos fijos, tarjetas y créditos con deuda). Marcar uno registra el pago; no se guarda nada por mes, así que la lista se renueva sola el día 1 y los meses anteriores quedan como historial.
- **Calendario**: `GET /api/calendar/<token>.ics` entrega las fechas de pago de tarjetas, créditos y recibos de los próximos tres meses, con alertas dos días antes y el mismo día. Se suscribe desde el calendario del teléfono; así llegan los avisos sin app propia.
- **Recomendaciones** (`src/lib/advice.ts`): reglas sobre tus datos, recalculadas en cada carga: vencimientos cercanos sin pago, recibos vencidos, cupo alto, cuotas que los ahorros no cubren, categorías por encima de lo normal, cuánto falta para terminar un crédito y a qué deuda abonar primero.

Los tokens se guardan como hash; el iPhone y el calendario solo pueden llamar a dos funciones de Postgres que validan el token (`supabase/migrations/0002_wallet_tokens.sql`).

## Siguiente fase

Notificaciones push propias (requieren app móvil o Web Push con un job programado), cálculo automático de intereses, pago mínimo de tarjetas, presupuestos por categoría y app móvil.
