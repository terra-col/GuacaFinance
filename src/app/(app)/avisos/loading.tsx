import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton text="Cargando avisos…" rows={5} />;
}
