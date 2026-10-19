import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-6xl text-clay">404</p>
      <h1 className="mt-3 text-2xl">Non abbiamo trovato questa pagina</h1>
      <p className="mt-2 text-ink-soft">Il contenuto non esiste oppure non è tra i tuoi.</p>
      <LinkButton href="/dashboard" className="mt-6">Torna alla home</LinkButton>
    </div>
  );
}
