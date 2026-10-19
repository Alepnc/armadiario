# ArmadiarIo

> Il nome del prodotto si cambia in un punto solo con `NEXT_PUBLIC_APP_NAME` (default in `lib/config.ts`).

Web app per digitalizzare il proprio guardaroba, tenere traccia di cosa è disponibile o in lavaggio e
farsi comporre outfit usando **solo i capi realmente presenti e disponibili**. Opzionalmente: analisi AI delle
foto dei capi e prova virtuale (virtual try-on).

Lingua dell'interfaccia: italiano.

---

## Indice
1. [Funzionalità](#funzionalità)
2. [Architettura](#architettura)
3. [Tecnologie](#tecnologie)
4. [Prerequisiti](#prerequisiti)
5. [Installazione e avvio rapido (Supabase locale)](#installazione-e-avvio-rapido-supabase-locale)
6. [Variabili d'ambiente](#variabili-dambiente)
7. [Configurare Supabase (progetto cloud)](#configurare-supabase-progetto-cloud)
8. [Provider AI](#provider-ai)
9. [Test](#test)
10. [Build e deploy](#build-e-deploy)
11. [Cosa non funziona senza credenziali esterne](#cosa-non-funziona-senza-credenziali-esterne)
12. [Sicurezza e privacy](#sicurezza-e-privacy)
13. [Limiti noti](#limiti-noti)
14. [Struttura del progetto](#struttura-del-progetto)

---

## Funzionalità

| Area | Cosa fa |
|---|---|
| Account | Registrazione/login email+password, recupero password, sessioni via cookie, pagine protette, profilo modificabile, eliminazione account e dati |
| Guardaroba | CRUD capi, foto (file o fotocamera), **caricamento multiplo con coda** (anteprima, stato, errori, retry), avviso sui duplicati, ricerca, filtri (categoria, colore, stagione, stile, disponibilità), ordinamento, vista griglia/lista, "mostra altri" |
| Disponibilità | `Disponibile / In lavaggio / Non disponibile` salvata a database, modificabile da griglia, scheda e dettaglio; data di rientro **solo informativa** (non cambia mai lo stato da sola) |
| AI Stylist | Occasione, stile, stagione, meteo, momento, formalità, colori da volere/evitare, capi da includere/escludere, numero di proposte, testo libero. Cambia un capo, escludilo, richiedi una variante, rigenera |
| Outfit | Salvataggio (per **id** dei capi), nome, note, preferiti, duplica come variante, elimina; la disponibilità è riletta ogni volta, con avvisi per capi eliminati/in lavaggio |
| Prova virtuale | Foto personale, generazione asincrona (`pending → processing → completed/failed`), galleria, eliminazione; disattivata con messaggio chiaro se non configurata |
| Privacy | Consensi espliciti e revocabili per l'invio di immagini/dati a servizi AI, bucket privati, URL firmati a scadenza, eliminazione immagini generate e account |

## Architettura

```
Browser ── Server Components / Server Actions / Route Handlers (Next.js 16, App Router)
              │
              ├─ lib/security      requireUser / getUserOrThrow, quote AI (DB-backed)
              ├─ lib/validation    schemi Zod di ogni input
              ├─ features/*        logica di dominio (wardrobe, outfits, profile, virtual-try-on)
              ├─ lib/ai            interfacce + provider (analisi foto · LLM stylist) — sostituibili
              ├─ lib/ai/tryon      interfaccia + provider virtual try-on — sostituibile
              └─ lib/supabase      client SSR legato alla sessione dell'utente
                          │
                  Supabase: Postgres (RLS) · Auth · Storage (3 bucket privati)
```

### Raccomandazione outfit (sistema ibrido)

```
richiesta ─► A. filtri deterministici ─► B. generazione + ranking ─► C. modello AI ─► D. validazione finale
             (proprietà, disponibilità,   (colore, stile, stagione,   sceglie e spiega   (id reali, dell'utente,
              esclusi/obbligatori, colori  formalità, preferenze       SOLO tra candidati  disponibili, no duplicati,
              da evitare, meteo)           profilo, varietà)           già validati)       vincoli rispettati)
```

* **A/B** sono codice puro e testato (`features/outfits/engine/*`): niente rete, niente AI.
* **C** il modello riceve candidati con id *interni* (`c1`, `c2`…) e dati dei capi, **non** gli id del database;
  può solo scegliere tra candidati già conformi ai vincoli e scrivere titolo/motivazione/suggerimenti
  (output JSON forzato via tool-use e validato con Zod). Non può introdurre capi nuovi né ignorare i vincoli del backend.
  Se risponde in modo non valido: un retry controllato, poi fallback alle regole.
* **D** ogni proposta è ri-validata contro il guardaroba letto *ora* dal DB come utente autenticato.
* Senza AI configurata (o senza consenso, o quota esaurita) l'app lavora in **modalità regole**, dichiarata nella UI:
  le spiegazioni sono generate da template che usano solo i dati dei capi. Nulla è presentato come generato da un'AI se non lo è.

### Prova virtuale
Separata da raccomandazione e composizione. L'interfaccia `TryOnProvider` (`lib/ai/tryon/types.ts`) applica **un capo per chiamata**;
l'orchestratore (`features/virtual-try-on/service.ts`) concatena i capi (inferiore → superiore) e avanza a ogni richiesta di stato
(polling dal client, con lock ottimistico). Il risultato viene scaricato e salvato nel bucket privato (gli URL dei provider scadono).
Capi che il provider non sa renderizzare (scarpe, accessori, strati sovrapposti) sono **elencati come non rappresentati**: nessuna sostituzione silenziosa con una generazione generica.

## Tecnologie

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · lucide-react · Zod 4 ·
Supabase (`@supabase/ssr`, Postgres + RLS, Auth, Storage) · sharp (validazione/ricodifica immagini) ·
Vitest · Playwright.

> Next.js 16: `middleware` si chiama `proxy.ts`, `cookies()/params` sono asincroni (già gestito).

## Prerequisiti

* Node.js ≥ 20 (testato con 24) e npm
* Docker Desktop (solo per Supabase locale)
* Facoltativi: chiave Anthropic, token Replicate

## Installazione e avvio rapido (Supabase locale)

```bash
cd armadiario
npm install

# 1. Avvia Supabase in locale (Postgres + Auth + Storage) e applica le migrazioni di supabase/migrations
npx supabase start
npx supabase status          # mostra URL e chiavi

# 2. Configura l'app
cp .env.example .env.local
#    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY / publishable key da `supabase status`>
#    SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>     (serve solo per "Elimina account")

# 3. (facoltativo) dati dimostrativi: account demo@armadiario.test / demo-password-123, 16 capi disegnati (non foto)
npm run seed:demo

# 4. Avvio
npm run dev        # http://localhost:3000
```

In locale le conferme email sono disattivate (`supabase/config.toml`), quindi la registrazione entra subito; le email (se attivate) sono nella casella Mailpit di Supabase.
Per fermare lo stack: `npx supabase stop`. Per ricreare il DB da zero: `npm run db:reset`.

## Variabili d'ambiente

Vedi [`.env.example`](.env.example) (ogni variabile è commentata).

| Variabile | Visibilità | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pubblica | obbligatorie |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SITE_URL` | pubblica | nome prodotto; origine per i link nelle email |
| `SUPABASE_SERVICE_ROLE_KEY` | **segreta** | solo per eliminare l'account (auth user + file). Senza: il pulsante è disattivato |
| `AI_ANALYSIS_PROVIDER`, `AI_STYLIST_PROVIDER` | segreta | `anthropic` \| `none` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_ANALYSIS_MODEL`, `ANTHROPIC_STYLIST_MODEL` | **segreta** | default `claude-haiku-5-5` / `claude-sonnet-5-5` |
| `TRYON_PROVIDER`, `REPLICATE_API_TOKEN`, `REPLICATE_TRYON_VERSION` | **segreta** | `replicate` \| `none` |
| `REPLICATE_TRYON_HUMAN_FIELD`, `REPLICATE_TRYON_GARMENT_FIELD` | segreta | se il modello usa nomi di input diversi |
| `AI_LIMIT_ANALYZE_PER_HOUR`, `AI_LIMIT_OUTFIT_PER_HOUR`, `AI_LIMIT_TRYON_PER_DAY` | segreta | quote per utente |

`.env*` è ignorato da git (eccetto `.env.example`). Nessuna chiave AI è mai inviata al browser: tutte le chiamate ai provider avvengono lato server.

## Configurare Supabase (progetto cloud)

1. Crea un progetto su supabase.com e copia URL + anon key (Project settings → API) in `.env.local`.
2. **Migrazioni** — in `supabase/migrations/` (versionate):
   * `…01_core_schema.sql`: tabelle (`profiles`, `categories`, `clothing_items`, `outfits`, `outfit_items`, `generated_images`, `ai_usage`, `recommendation_log`), vincoli, indici, trigger (`updated_at`, creazione profilo alla registrazione).
   * `…02_rls_and_storage.sql`: RLS su **tutte** le tabelle e creazione dei 3 bucket privati con policy su `storage.objects`.

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. **Storage**: i bucket `wardrobe`, `personal`, `generated` sono creati dalla migrazione come **privati**, limite 8 MB, solo `image/webp|jpeg|png`.
   Gli oggetti stanno in `"<user_id>/…"` e le policy consentono l'accesso solo al proprietario della cartella.
4. **Auth** (Authentication → URL configuration): imposta *Site URL* e aggiungi `https://<tuo-dominio>/auth/callback` ai *Redirect URLs* (conferma email e reset password). Abilita/disabilita la conferma email a piacere.
5. Metti `SUPABASE_SERVICE_ROLE_KEY` **solo** nelle variabili server dell'hosting.

### Categorie estendibili
Le categorie sono righe di `categories` con un `slot` (`top, bottom, dress, outer, shoes, accessory, bag, other`) che dice al motore che ruolo ha nell'outfit.
Le categorie iniziali sono seedate dalla migrazione; ogni utente può crearne di proprie dal form del capo — nessuna modifica al codice necessaria.

## Provider AI

Ogni capacità è configurata **indipendentemente** (`lib/ai/registry.ts`, `lib/ai/tryon/registry.ts`); per aggiungere un provider si implementa l'interfaccia in `lib/ai/types.ts` / `lib/ai/tryon/types.ts`.

1. **Analisi foto capi (multimodale)** e 2. **Stylist testuale** — Anthropic Messages API (`lib/ai/anthropic.ts`),
   output strutturato forzato con tool-use + validazione Zod, timeout e retry controllati. Imposta `ANTHROPIC_API_KEY`.
   Il modello di analisi riceve la foto del capo; quello dello stylist riceve **solo testo** (nomi e caratteristiche dei capi, preferenze, nota dell'utente), mai foto o id del DB.
3. **Virtual try-on** — Replicate (`lib/ai/tryon/replicate.ts`), pensato per modelli tipo **IDM-VTON** (input: persona + capo + categoria `upper_body|lower_body|dresses`).
   Imposta `REPLICATE_API_TOKEN` e `REPLICATE_TRYON_VERSION` (hash di versione del modello scelto su replicate.com).
   Se il tuo modello usa nomi di input diversi, usa `REPLICATE_TRYON_HUMAN_FIELD` / `REPLICATE_TRYON_GARMENT_FIELD`.
   Le immagini private vengono passate al provider con URL firmati validi 10 minuti (o come data URI se Supabase è in locale e non raggiungibile da Internet).

> **Nota onesta**: in fase di sviluppo non erano disponibili credenziali Anthropic/Replicate. Le integrazioni seguono le API documentate
> ma **non sono state eseguite contro i servizi reali**; sono testate con provider sostitutivi (vedi [Test](#test)).
> Prima del rilascio provale con le tue chiavi, in particolare i nomi degli input del modello di try-on scelto.

Costi e quote: ogni operazione AI scrive in `ai_usage` provider, modello, durata, token ed esito (nessun prompt, immagine o dato personale) e viene limitata per utente con finestra mobile (variabili `AI_LIMIT_*`).
L'analisi AI non viene rieseguita per la stessa immagine (cache per hash), e la generazione outfit è separata (economica) da quella delle immagini (costosa).

## Test

```bash
npm run lint
npm run typecheck
npm test                 # Vitest: unitari sempre; integrazione solo con le variabili SUPABASE_TEST_* (vedi sotto)
npm run test:e2e         # Playwright (avvia `npm run dev`; richiede Supabase locale + .env.local)
npm run build
```

Per eseguire anche i test d'integrazione (contro Supabase locale):

```bash
export SUPABASE_TEST_URL=http://127.0.0.1:54321
export SUPABASE_TEST_ANON_KEY=<anon key>
export SUPABASE_TEST_SERVICE_KEY=<service role key>
npm test
```

| Livello | Cosa copre |
|---|---|
| Unitari (`tests/unit`) | validazione metadati, risposte AI (schema + normalizzazione), filtri disponibilità, vincoli (obbligatori/esclusi/colori/meteo/formalità), ranking, validazione finale, spiegazioni, rilevamento immagini dal contenuto, ricodifica/strip EXIF/limiti |
| Integrazione (`tests/integration`) | RLS e Storage con **due utenti reali** (lettura/modifica/eliminazione/falsificazione `user_id`, outfit che referenziano capi altrui, categorie altrui, bucket), persistenza dello stato, pipeline outfit su DB reale con **modello AI finto** (scelta valida, id inventato → fallback, JSON malformato, senza consenso il modello non viene chiamato), salvataggio/duplicazione/eliminazione outfit, orchestrazione try-on con **provider finto** (concatenazione capi, duplicati in corso, errori), eliminazione account |
| E2E (`tests/e2e`) | registrazione/login, caricamento multiplo con foto, duplicato, file non-immagine rifiutato, modifica metadati, "in lavaggio" persistente + filtro, stylist che esclude il capo in lavaggio, salvataggio e storico, eliminazione capo con outfit salvato, try-on non configurato, isolamento tra due account, esperienza smartphone (nav, no overflow), profilo, consensi, eliminazione account |

## Build e deploy

```bash
npm run build && npm start
```

Qualsiasi host Node per Next.js (Vercel, Fly, Railway, Docker…):
imposta le variabili del [paragrafo dedicato](#variabili-dambiente), applica le migrazioni al progetto Supabase di produzione e configura i Redirect URL di Auth.
`sharp` è un modulo nativo (già escluso dal bundle con `serverExternalPackages`). Le route AI/try-on dichiarano `maxDuration = 60`.
Il try-on è asincrono e "si muove" a ogni richiesta di stato: non richiede worker o code, ma l'utente deve tenere aperta la pagina finché non termina
(per un'esperienza in background sarebbe necessario un job runner / webhook del provider).

Pulizia consigliata (cron Supabase): immagini generate non salvate (`generated_images.is_saved = false`) più vecchie di N giorni.

## Cosa non funziona senza credenziali esterne

| Assente | Effetto |
|---|---|
| `ANTHROPIC_API_KEY` | Nessuna analisi automatica delle foto (compili i dati a mano — la foto resta obbligatoria). Lo stylist usa le **regole di abbinamento**, dichiarato nell'interfaccia |
| Consenso AI dell'utente | Come sopra, per quell'utente |
| `REPLICATE_*` | Prova virtuale non disponibile: la pagina lo dice e mostra l'outfit con le foto originali; l'API risponde `501 not_configured` |
| `SUPABASE_SERVICE_ROLE_KEY` | Funziona tutto tranne "Elimina account" (disattivato e spiegato) |
| Supabase | Tutte le pagine riservate rimandano a `/setup` con le istruzioni |

## Sicurezza e privacy

* **RLS su ogni tabella** e policy sugli oggetti di storage; le query del server usano il client legato alla sessione dell'utente (mai la service role, tranne l'eliminazione account).
* Le policy impediscono anche di *referenziare* risorse altrui (capi in un outfit, categorie, outfit per le immagini generate).
* Ogni Server Action / route handler: valida con Zod, verifica la sessione con `auth.getUser()` (non il solo cookie), verifica la proprietà (RLS + controlli espliciti).
* Upload: dimensione, **magic bytes** (non l'estensione), limite di pixel, ricodifica WebP (rimuove EXIF/GPS), percorsi vincolati a `"<uid>/…"`.
* URL firmati a scadenza breve; bucket privati; nessun dato personale nei log; chiavi solo lato server.
* L'invio di immagini/dati a servizi esterni richiede un consenso esplicito e revocabile (Impostazioni → Privacy). Le foto personali non vengono usate per altri scopi.
* Header di sicurezza (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`); redirect post-login limitati a percorsi interni; reset password senza enumerazione degli utenti.

## Limiti noti

* Il ranking è euristico (regole cromatiche/formalità/stagione): è un buon punto di partenza, non un "occhio" da stilista; migliora con metadati accurati.
* La qualità del try-on dipende dal modello; l'immagine è illustrativa e la UI lo dichiara. Scarpe, accessori e capi sovrapposti non sono renderizzati.
* Niente rate limit per IP o per upload (solo quote per utente sulle operazioni AI): per un deploy pubblico aggiungi un limite al bordo (WAF/CDN) e un tetto di spazio per utente.
* I file caricati ma mai associati a un capo (es. chiusura della scheda) possono restare orfani: la UI li elimina quando scarti la foto; serve un job periodico per quelli abbandonati.
* HEIC non è accettato dal server (i browser mobili di norma convertono in JPEG).
* Due schede aperte contemporaneamente sullo stesso capo seguono "last write wins".
* Meteo manuale (nessuna integrazione con un servizio meteo).

## Struttura del progetto

```
app/                       pagine (App Router) e route handlers: api/upload, api/ai/analyze, api/try-on
  (auth)/                  login, registrazione, recupero/reimposta password
  (app)/                   dashboard, wardrobe, stylist, outfits, profile, settings (area protetta)
components/                UI riusabile (ui/*, shell/*, collage outfit, badge)
features/
  wardrobe/                query, server actions, componenti (griglia, filtri, coda di upload, form)
  outfits/                 engine/ (filtri, scoring, validazione, spiegazioni), service (pipeline), llm, actions
  virtual-try-on/          orchestrazione asincrona, azioni, UI
  profile/ auth/           profilo, consensi, eliminazione account · login/registrazione
lib/
  supabase/                client server/browser/admin, aggiornamento sessione per il proxy
  ai/                      interfacce, provider Anthropic, registry · tryon/ (interfaccia, Replicate)
  validation/ security/    schemi Zod · auth guard, quote AI
  images/ storage.ts       rilevamento/ricodifica immagini · URL firmati
supabase/migrations/       schema, RLS, storage
scripts/seed-demo.mjs      seed dimostrativo esplicito (solo sviluppo)
tests/                     unit · integration · e2e
```
