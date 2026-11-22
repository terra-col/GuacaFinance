import { CardBackdrop } from "@/components/card-backdrop";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/lib/brand";

/** The narrow centered frame of the screens outside the app: login, password recovery, new password. */
export function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <main className="relative isolate mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <CardBackdrop />
      <div className="text-center">
        <Logo size="text-5xl" />
        <h1 className="sr-only">{APP_NAME}</h1>
        <p className="mx-auto mt-3 max-w-xs text-balance font-medium text-ink-2">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}
