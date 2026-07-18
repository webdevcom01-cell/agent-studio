# Chat — enterprise polish (čitljivost + afordanse)

> Obim (odlučen): čitljivost + ključne afordanse. Pravac izlaza: tehnički za dev-agente, generic-human za ostale.

## Ključni nalaz (audit)
`@tailwindcss/typography` **nije instaliran** → sve `prose` klase u chatu su bile **inertne** (nula CSS-a); markdown se renderovao golim browser default-om, a `prose-invert` ništa nije radio. Istovremeno projekat ima kompletan, token-baziran **`.markdown-body`** CSS — koji **niko nije koristio**. Infrastruktura je postojala, samo pogrešno ožičena.

## Urađeno

**F1 — Čitljivost teksta.** Chat markdown: `prose …` (inertno) → **`.markdown-body`** (token-baziran: p/h/ul/code/pre/blockquote/a/hr preko `hsl(var(--…))`, čitljivo u light I dark). Agent tekst sada ima pravu tipografiju u oba moda.

**F2 — Generic human renderer.** Strukturirani izlaz je imao render samo za 3 developer šeme (Code Gen, PR Gate, Architecture); sve ostalo se prikazivalo kao prazna labela. Dodat **`GenericRenderer`** (fallback za sve ostale šeme): humanizuje ključeve (`camelCase`/`snake_case` → „Title Case"), ugnježdene objekte → sekcije, nizove → liste, URL-ove → linkove, sa copy dugmetom. Više nema „mašinskog"/praznog izlaza za normalnog čoveka.

**F3 — Afordanse.** Copy dugme na agent-porukama (hover-reveal); empty state sada prikazuje **ime + opis agenta** + poziv na akciju (umesto golog „Start a conversation").

## Svesno odloženo
- **Timestamp po poruci** — `ChatMessage` tip nema vreme; traži izmenu streaming hook-a/tipa. Van fokusiranog obima; lako kasnije.
- Dublji redizajn (lista konverzacija, regenerate, syntax highlight) — bio van izabranog obima.

## Verifikacija
Typecheck 0, color guard ✓. **Prod light/dark** ostaje (zahteva klik na konverzaciju — ne mogu u read-only browseru; korisnik potvrđuje).

## Fajlovi
- `src/app/chat/[agentId]/page.tsx` — markdown-body, copy, empty state, agentDescription
- `src/components/chat/structured-output-message.tsx` — GenericRenderer
