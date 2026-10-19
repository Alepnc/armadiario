"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Chip({
  selected,
  onClick,
  children,
  disabled,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors disabled:opacity-50",
        selected ? "bg-ink font-medium text-lime" : "bg-paper text-ink ring-[1.5px] ring-inset ring-ink hover:bg-lime/70",
        className,
      )}
    >
      {children}
    </button>
  );
}
