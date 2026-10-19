"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

/** Accessible confirmation built on the native <dialog> element (focus trap, Esc). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Conferma",
  destructive,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!loading) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !loading) onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(92vw,26rem)] rounded-3xl bg-paper p-6 text-ink ring-2 ring-ink"
    >
      <h2 id="confirm-title" className="text-xl">
        {title}
      </h2>
      {description && <p className="mt-2 text-sm text-ink-soft">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Annulla
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
