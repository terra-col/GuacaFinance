import { ViewTransition } from "react";

/** Each half fades in under the switch, which stays (the (app) template does not re-mount between them). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      <div className="flex flex-col gap-6 sm:gap-8">{children}</div>
    </ViewTransition>
  );
}
