import Link from "next/link";
import { ArrowRight, Check, Droplets, Sparkles } from "lucide-react";
import { FlatLay } from "@/components/landing/flat-lay";
import { LinkButton } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";

const OCCASIONS = ["Università", "Uscita", "Appuntamento", "Festa", "Sport", "Lavoro", "Evento", "Streetwear", "Minimal", "Smart casual"];

const STEPS = [
  {
    title: "Foto. Foto. Foto.",
    text: "Una o venti insieme. L'AI propone categoria, colore e stile, tu correggi.",
    demo: (
      <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-lime">
        <Sparkles className="size-4" aria-hidden /> Jeans dritti · denim
      </span>
    ),
    tone: "bg-lilac",
  },
  {
    title: "Maglia in lavatrice? Fuori dai giochi.",
    text: "Un tocco e il capo sparisce dalle proposte, finché non lo rimetti tu.",
    demo: (
      <span className="inline-flex items-center gap-2 rounded-full bg-tide-tint px-4 py-2 text-sm font-medium text-tide ring-2 ring-ink">
        <Droplets className="size-4" aria-hidden /> In lavaggio
      </span>
    ),
    tone: "bg-sky",
  },
  {
    title: "Chiedi. Indossa. Fatto.",
    text: "Occasione, meteo, due parole tue. Cambi un pezzo e il resto si adatta.",
    demo: (
      <span className="inline-flex items-center gap-2 rounded-full bg-lime px-4 py-2 text-sm font-medium ring-2 ring-ink">
        <Check className="size-4" aria-hidden /> Università · casual
      </span>
    ),
    tone: "bg-pop",
  },
];

export default function Landing() {
  return (
    <div className="flex-1 overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <span className="font-display text-2xl font-bold tracking-tight">{APP_NAME}</span>
        <nav aria-label="Account" className="flex items-center gap-2">
          <LinkButton href="/login" variant="ghost" size="sm">
            Accedi
          </LinkButton>
          <LinkButton href="/register" size="sm">
            Inizia
          </LinkButton>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-14 md:px-8 md:pt-12">
        <div>
          <h1 className="text-[3.4rem] leading-[0.95] md:text-[6rem]">
            Non hai <span className="marker">niente</span> da metterti.
          </h1>
          <p className="mt-4 font-display text-3xl font-semibold leading-tight text-clay md:text-4xl">Sì che ce l&apos;hai.</p>
          <p className="mt-6 max-w-md text-lg text-ink-soft">
            Carica i tuoi vestiti, segna cosa è in lavaggio e fatti comporre outfit solo con quello che hai davvero e che è pronto oggi.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="/register" size="lg" icon={<ArrowRight className="order-last size-4" />}>
              Apri il tuo armadio
            </LinkButton>
            <LinkButton href="/login" variant="secondary" size="lg">
              Ho già un account
            </LinkButton>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <FlatLay />
          <span className="settle absolute -left-2 top-10 inline-flex -rotate-6 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold ring-2 ring-ink md:-left-8" style={{ ["--i" as string]: 5 }}>
            <Check className="size-4 text-sage" aria-hidden /> Disponibile
          </span>
          <span className="settle absolute -right-1 top-1/3 inline-flex rotate-6 items-center gap-1.5 rounded-full bg-tide-tint px-3.5 py-2 text-sm font-semibold text-tide ring-2 ring-ink md:-right-6" style={{ ["--i" as string]: 6 }}>
            <Droplets className="size-4" aria-hidden /> In lavaggio
          </span>
          <span className="settle absolute -bottom-3 left-6 inline-flex -rotate-3 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-lime md:left-10" style={{ ["--i" as string]: 7 }}>
            <Sparkles className="size-4" aria-hidden /> Outfit per l&apos;uni
          </span>
        </div>
      </section>

      <div aria-hidden className="-rotate-1 bg-ink py-3.5">
        <p className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-1 px-5 font-display text-xl font-semibold text-lime md:text-2xl">
          {OCCASIONS.map((o) => (
            <span key={o}>{o}</span>
          ))}
        </p>
      </div>

      <section aria-label="Come funziona" className="mx-auto max-w-6xl space-y-4 px-5 py-20 md:space-y-5 md:px-8">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className={`grid items-center gap-5 rounded-[2rem] p-7 ring-2 ring-ink md:grid-cols-[1.3fr_1fr_auto] md:gap-10 md:p-10 ${s.tone} ${i === 1 ? "md:ml-12" : i === 2 ? "md:mr-12" : ""}`}
          >
            <h2 className="text-3xl md:text-5xl">{s.title}</h2>
            <p className="max-w-sm text-lg text-ink/85">{s.text}</p>
            <div className="md:justify-self-end">{s.demo}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 md:px-8">
        <div className="rounded-[2rem] bg-ink p-8 text-paper md:p-12">
          <h2 className="text-3xl text-lime md:text-5xl">Le tue foto restano tue.</h2>
          <p className="mt-4 max-w-2xl text-lg text-paper/85">
            Tutto è privato. Le immagini vanno a servizi AI esterni solo se dici di sì, e puoi cambiare idea quando vuoi. Cancelli l&apos;account? Spariscono anche loro.
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-12 text-sm text-muted md:px-8">
        © {new Date().getFullYear()} {APP_NAME} ·{" "}
        <Link href="/login" className="underline">
          Accedi
        </Link>
      </footer>
    </div>
  );
}
