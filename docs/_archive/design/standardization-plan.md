# Plan standardizacije boja — kompletan, enforce-able

> Cilj: nula nenamernih off-token boja u celoj aplikaciji, sa **dokumentovanim allowlist-om** namernih izuzetaka i **CI guard skriptom** koja sprečava regresiju. Profesionalno, mereno, bez propusta.

## ✅ STATUS: izvršeno (Faze A, B, C)

- **Faza A** ✓ — K1 (14 `bg-white/[..]` → `bg-foreground/[..]`) + K2 (command-palette `bg-[#111]`→`bg-popover`, senka→token). Light-mode bagovi rešeni.
- **Faza B** ✓ — K3: dodata `success` varijanta u `badge.tsx`, KB „READY" → success (više nije narandžast).
- **Faza C** ✓ — `scripts/check-color-tokens.sh` napisan + dodat u `ci.yml`. Guard prolazi (0 van allowlist-a). **Buduće off-token boje sad obaraju build.**
- **K4 (text-white vs text-primary-foreground/ink na primary)** — ODLOŽENO kao zaseban brend-item: oba su čitljiva, nije bag; menjanje `--primary-foreground` tokena dira ceo app pa zaslužuje posebnu odluku, ne usred ovoga.
- Typecheck 0, RLS guard ✓, color guard ✓. Preostaje prod light/dark verifikacija.

## Definicija „gotovo" (Definition of Done)
1. Sve nenamerne off-token boje zamenjene semantičkim tokenima.
2. Sve preostale off-token pojave su na **eksplicitnom allowlist-u** sa razlogom.
3. `scripts/check-color-tokens.sh` prolazi (vraća 0) i dodat je u CI — buduće off-token boje **obaraju build**.
4. Typecheck 0, RLS guard ✓, prod vizuelno potvrđen u **light I dark**.

## Inventar (sve klase — verifikovano grep-om)

| # | Klasa | Pojava | Prioritet | Zašto |
|---|---|---|---|---|
| K1 | `bg-white/[0.0x]` dark-only overlay-i | 14 | 🔴 VISOK | **Bag u light modu** — belo na belom = nevidljiv hover/active (sidebar, chat, discover, command-palette) |
| K2 | command-palette `bg-[#111]` + `border-white/[..]` + `shadow-[rgba]` | 1 fajl | 🔴 VISOK | **Bag u light modu** — crna kutija; hardkodovan dark modal |
| K3 | KB „READY" badge `variant="default"` (=primary) | 1 | 🟡 SREDNJI | Token-misuse: status prikazan kao brend-akcija (narandžasto) |
| K4 | `text-white` na obojenim dugmićima | 15 | 🟡 SREDNJI | Neki koriste `text-white`, neki foreground — nedosledno |
| K5 | toggle „thumb" `bg-white` | ~10 | 🟢 ODLUKA | Standardni beli klizač — možda OK |
| K6 | `bg-black/50-60` modal scrim | 2 | 🟢 NIZAK | Konvencija (tamni veo radi u oba moda) |

## Pravila mapiranja

- **K1** `bg-white/[0.0x]` → `bg-foreground/[0.0x]` (radi u oba moda: tamno na svetlom / svetlo na tamnom). Hover/active stanja: `bg-accent` gde postoji semantika selekcije.
- **K2** command-palette → `bg-popover text-popover-foreground`, `border-border`, `shadow-lg` (token senka).
- **K3** Dodati `success` varijantu u `badge.tsx` (`bg-success/10 text-success border-success/20`); KB READY → `variant` koji daje success izgled (settled/gotovo).
- **K4** Na zasićenim semantičkim pozadinama (primary/success/info/destructive/warning) — **uniformno `text-white`** (čitljivo na svima; već dominantan obrazac). Cilj: doslednost, ne menjanje izgleda.
- **K5/K6** → vidi Odluke.

## Allowlist — NAMERNO zadržano (dokumentovano)
- `components/auth/auth-shell.tsx` — dark brand panel (inline hex).
- `app/login/page.tsx` — zvanične Google OAuth boje.
- `app/devsecops/page.tsx` — SVG dijagram + namerno dark marketing stranica (`text-white` headinzi).
- `soma/review-queue/[batchId]` `PLATFORM_COLORS`, `templates/template-gallery` `COLOR_CLASSES` — dekorativni identitet (odluka D2/D4).
- modal scrim `bg-black/50` (ako se zadrži po odluci).

## Odluke (2 prosuđivanja — tražim potvrdu)
- **O1 — toggle thumbs (`bg-white` klizač):** zadržati beli (standard, radi u oba moda) ili → `bg-background`?
- **O2 — modal scrim `bg-black/50`:** zadržati (konvencija) ili → `bg-foreground/40` token?

## Izvršenje — redom, sa verifikacijom posle svake faze
1. **Faza A (VISOK):** K1 + K2 — popraviti light-mode bagove (overlay-i + command-palette). → typecheck.
2. **Faza B (SREDNJI):** K3 (badge success varijanta + KB READY) + K4 (`text-white` doslednost). → typecheck.
3. **Faza C (ODLUKE):** K5/K6 po O1/O2.
4. **Faza D (ENFORCEMENT):** napisati `scripts/check-color-tokens.sh` (skenira off-token van allowlist-a), dodati u `.github/workflows/ci.yml` pored RLS guard-a. → lokalno pokrenuti, mora 0.
5. **Faza E:** finalni typecheck + RLS guard + prod light/dark verifikacija ključnih stranica.

## Procena
Fokusiran posao u 5 faza; najveći korisnički efekat iz Faze A (light-mode bagovi). Guard skripta (Faza D) je ono što garantuje „nema propusta" trajno.
