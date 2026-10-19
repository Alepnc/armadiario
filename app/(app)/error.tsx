"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      description="Non siamo riusciti a caricare questa pagina. I tuoi dati non sono stati toccati."
      action={<Button onClick={reset}>Riprova</Button>}
    />
  );
}
