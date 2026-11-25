import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton text="Cargando movimientos…" rows={8} />;
}
