import { cookies } from "next/headers";
import { requestOrigin } from "@/lib/request-origin";
import { clearWalletName, signOut } from "@/app/actions";
import { InstallCard } from "@/components/install-card";
import { ProfileForm } from "@/components/profile-form";
import { ShareInvite } from "@/components/share-invite";
import { profileName } from "@/lib/brand";
import { profilePhone } from "@/lib/phone";
import { TourLink } from "@/components/tour";
import { FormSplash, ForgetOnSignOut } from "@/components/splash";
import { ScalePicker, ThemePicker } from "@/components/theme-toggle";
import { TokenCard } from "@/components/token-card";
import { WalletGuide } from "@/components/wallet-guide";
import { BankLogo } from "@/components/bank-logo";
import { Icon } from "@/components/icons";
import { bankKey, bankLogoUrl } from "@/lib/banks";
import { loadData } from "@/lib/data";
import { SCALE_COOKIE, THEME_COOKIE, parseScale, parseTheme } from "@/lib/theme";
import { SubmitButton } from "@/components/submit-button";
import { MainCurrencyPicker } from "@/components/main-currency";
import { mainCurrencyCode } from "@/lib/currency";

export default async function SettingsPage() {
  const { supabase, accounts, user } = await loadData();
  const { data: tokens } = await supabase.from("api_tokens").select("kind");
  const has = (kind: string) => Boolean(tokens?.some((t) => t.kind === kind));
  const origin = await requestOrigin();
  const linked = accounts.filter((a) => a.wallet_card_name);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3 pt-2">
        <h1 className="display text-3xl">Ajustes</h1>
        <TourLink />
      </div>

      <section id="perfil" className="card flex scroll-mt-4 flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Tu perfil</h2>
          <p className="text-sm text-ink-3">Cómo te saludamos en la app y con qué correo entras.</p>
        </div>
        <ProfileForm name={profileName(user)} email={user.email ?? ""} phone={profilePhone(user)} />
      </section>

      <section id="moneda" className="card flex scroll-mt-4 flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Moneda principal</h2>
          <p className="text-sm text-ink-3">En la que ves tus totales. Si tienes cuentas en otra moneda, se suman con la tasa de hoy.</p>
        </div>
        <MainCurrencyPicker initial={mainCurrencyCode(user.user_metadata)} />
      </section>

      <InstallCard />

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Invita a alguien</h2>
          <p className="text-sm text-ink-3">
            Comparte el enlace para que cree su propia cuenta. Cada persona ve solo sus datos. Lo único que otros pueden ver es lo que pongas en un grupo de Compartidos.
          </p>
        </div>
        <ShareInvite origin={origin} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Apariencia</h2>
          <p className="text-sm text-ink-3">También puedes cambiarla con el botón de sol y luna de arriba.</p>
        </div>
        <ThemePicker initial={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Tamaño</h2>
          <p className="text-sm text-ink-3">Cambia el tamaño de la letra y de todo lo demás. Se guarda en este dispositivo.</p>
        </div>
        <ScalePicker initial={parseScale((await cookies()).get(SCALE_COOKIE)?.value)} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Apple Wallet: registrar pagos automáticamente</h2>
          <p className="text-sm text-ink-3">
            Cada vez que pagas con Apple Pay desde el iPhone o el Apple Watch, un Atajo envía el pago aquí. No captura pagos con la tarjeta física.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="display text-xl">Tu token</h3>
          <TokenCard kind="wallet" exists={has("wallet")} origin={origin} />
        </div>

        {/* The cards already linked: a subsection of their own, each in its colour. */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface/50 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="display text-xl">Tarjetas vinculadas</h3>
            {linked.length > 0 && <p className="text-xs text-ink-3">{linked.length} {linked.length === 1 ? "tarjeta" : "tarjetas"}</p>}
          </div>
          {linked.length === 0 ? (
            <p className="text-sm text-ink-3">Todavía ninguna. Cada tarjeta se vincula sola con su primer pago con Apple Pay (paso 10).</p>
          ) : (
            <ul className="divide-y divide-line">
              {linked.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {/* The bank's logo (uploaded or automatic); a grey card icon when there is none. */}
                  {(() => {
                    const plain = (
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-line/70 text-ink-3">
                        <Icon name="card" className="size-5" />
                      </span>
                    );
                    const bank = bankKey(a.institution);
                    return a.logo ? <BankLogo src={a.logo} fallback={plain} /> : bank ? <BankLogo src={bankLogoUrl(bank)} fallback={plain} /> : plain;
                  })()}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">«{a.wallet_card_name}»</span>
                    <span className="block truncate text-xs text-ink-3">se registra en {a.name}</span>
                  </span>
                  <form action={clearWalletName}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn-quiet h-8 px-2.5 text-xs">Desvincular</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <WalletGuide origin={origin} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="display text-2xl">Recordatorios en tu calendario</h2>
          <p className="text-sm text-ink-3">
            Una dirección de calendario con las fechas de pago de tarjetas, créditos y recibos de los próximos tres meses, con aviso dos días antes y el mismo
            día.
          </p>
        </div>
        <TokenCard kind="calendar" exists={has("calendar")} origin={origin} />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>En el iPhone: Ajustes → Apps → Calendario → Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito.</li>
          <li>Pega la dirección y, en la pantalla siguiente, desactiva «Eliminar alertas» para recibir los avisos.</li>
        </ol>
        <p className="text-sm text-ink-3">
          El calendario lleva nombres y valores fijos, no tus saldos. Quien tenga la dirección puede verlo: si se filtra, genera una nueva.
        </p>
      </section>
      <section className="card flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-2xl">Sesión</h2>
          <p className="text-sm text-ink-3">Entraste como {user.email ?? "tú"}.</p>
        </div>
        <form action={signOut} data-sign-out>
          <SubmitButton className="btn-quiet">Cerrar sesión</SubmitButton>
          <FormSplash text="Cerrando sesión…" />
          <ForgetOnSignOut />
        </form>
      </section>
    </>
  );
}
