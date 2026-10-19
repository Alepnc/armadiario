import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy aria-label="Caricamento">
      <Skeleton className="mb-3 h-10 w-64" />
      <Skeleton className="mb-10 h-5 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    </div>
  );
}
