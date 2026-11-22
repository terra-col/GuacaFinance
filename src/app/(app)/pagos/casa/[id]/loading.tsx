import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton text="Cargando la casa…" rows={5} />;
}
