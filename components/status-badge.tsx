import { CheckCircle2, Droplets, Ban, Trash2 } from "lucide-react";
import { AVAILABILITY_LABEL, COLOR_BY_VALUE, colorLabel, type Availability } from "@/lib/constants/wardrobe";
import { cn } from "@/lib/utils/cn";

const STYLE: Record<Availability, string> = {
  available: "bg-sage-tint text-sage",
  washing: "bg-tide-tint text-tide",
  unavailable: "bg-stone-tint text-stone",
};
const ICON = { available: CheckCircle2, washing: Droplets, unavailable: Ban } as const;

export function StatusBadge({ status, className, compact }: { status: Availability | "deleted"; className?: string; compact?: boolean }) {
  if (status === "deleted") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger ring-[1.5px] ring-ink", className)}>
        <Trash2 className="size-3" aria-hidden /> Eliminato
      </span>
    );
  }
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-[1.5px] ring-ink", STYLE[status], className)}>
      <Icon className="size-3" aria-hidden />
      <span className={compact ? "sr-only" : undefined}>{AVAILABILITY_LABEL[status]}</span>
    </span>
  );
}

export function ColorDot({ color, withLabel, className }: { color: string; withLabel?: boolean; className?: string }) {
  const def = COLOR_BY_VALUE.get(color);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="size-3.5 rounded-full ring-[1.5px] ring-ink"
        style={{ background: color === "multicolore" ? "conic-gradient(#e3a2b3,#e2bd36,#3f7a52,#4b6a93,#e3a2b3)" : (def?.hex ?? "#ccc") }}
      />
      {withLabel ? <span>{colorLabel(color)}</span> : <span className="sr-only">{colorLabel(color)}</span>}
    </span>
  );
}
