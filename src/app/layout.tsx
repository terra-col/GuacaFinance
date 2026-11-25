import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/outfit";
import "@fontsource-variable/oswald";
import "@fontsource-variable/plus-jakarta-sans";
import { PrivacyMask } from "@/components/privacy";
import { TouchFeedback } from "@/components/splash";
import { PRIVACY_COOKIE } from "@/lib/privacy";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { SCALE_COOKIE, THEME_COOKIE, parseScale, parseTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  // «Agregar a pantalla de inicio» on iPhone opens Guaca full screen, like an app.
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d21" },
  ],
  viewportFit: "cover",
};

/**
 * iPhone, iPad and Safari (WebKit, also inside Chrome on iOS) change screens without the
 * crossfade. Each one captures the whole screen as images, and over the glass cards that pushed
 * iOS to close the page for memory: black, white, and the app starting over. Without
 * startViewTransition React applies the same change at once; the switches' own slides are CSS.
 */
const NO_WEBKIT_TRANSITIONS = `try{var u=navigator.userAgent;if(/AppleWebKit/.test(u)&&!/Chrome\\/|Chromium\\/|Android/.test(u))delete Document.prototype.startViewTransition}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The chosen theme comes in a cookie, so the first paint already has the right colours.
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const scale = parseScale(jar.get(SCALE_COOKIE)?.value);
  // Modo privado is on from the first paint (amounts blurred until masked), never a flash of numbers.
  const privacy = jar.get(PRIVACY_COOKIE)?.value === "1";
  return (
    <html lang="es-CO" className="h-full antialiased" data-theme={theme === "system" ? undefined : theme} data-scale={scale === "std" ? undefined : scale} data-privacy={privacy ? "on" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_WEBKIT_TRANSITIONS }} />
      </head>
      <body className="min-h-full font-sans">
        <TouchFeedback />
        <PrivacyMask />
        {children}
      </body>
    </html>
  );
}
