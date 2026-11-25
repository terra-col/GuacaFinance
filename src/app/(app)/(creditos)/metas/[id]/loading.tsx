import { CardsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <CardsSkeleton text="Abriendo la meta…" count={1} />;
}
