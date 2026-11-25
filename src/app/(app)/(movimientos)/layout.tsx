import { SectionSwitch } from "@/components/moves-switch";

/** The section's big switch stays put while the other half loads under it. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSwitch section="moves" />
      {children}
    </>
  );
}
