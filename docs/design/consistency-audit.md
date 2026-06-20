# Audit konzistentnosti boja — cela aplikacija

> Inventar svih off-token boja (verifikovano grep-om + čitanjem koda). Cilj: svaka boja ili semantički token ili svesna odluka. Bez halucinacija.

## ✅ REŠENO (status)

~400 off-token boja mapirano na semantičke tokene u 13 fajlova; dodat token `--severity-high` (orange). Odluke primenjene: EDITED→primary, severity 4-nivoa (HIGH=severity-high), platform-boje i template-boje zadržane (centralizovane mape). Namerno zadržano: platform mapa, template dekorativni set, devsecops SVG dijagram, Google OAuth, auth brand panel. Typecheck 0, RLS guard ✓. Preostaje vizuelna potvrda na prod-u (light+dark).

## Obim

**~440 off-token pojava u 16 fajlova.** Već čisti (na-token, ne diraju se): Dashboard, Evals, Skills, Webhooks, Analytics, Builder, landing.

## Kategorije

### 🟢 Mehaničko mapiranje — NIZAK RIZIK (samo uradim, bez pitanja)
Status/confidence/toggle stanja → semantički tokeni. Pravilo: `emerald/green → success`, `red → destructive`, `amber/yellow → warning`, `blue → info`, `zinc → muted`.

| Fajl | Pojava | Šta je |
|---|---|---|
| `pipelines/[agentId]/page.tsx` | 187 | run status (COMPLETED/FAILED/RUNNING/AWAITING), success-rate pragovi, stat-pile |
| `ecc/[agentId]/page.tsx` | 20 | confidence nivoi (high/med/low) |
| `soma/review-queue/page.tsx` | 16 | batch status |
| `admin/review-queue/status-badge.tsx` | 15 | PENDING/IN_REVIEW/APPROVED/REJECTED (+EDITED — vidi odluku) |
| `ecc/page.tsx` | 6 | learning ON/OFF |
| `chat/[agentId]/page.tsx` | 5 | conversation lifecycle (active=orange→primary, done=green→success) |
| `admin/review-queue/post-card.tsx` | 4 | review note + copy success |
| `admin/.../[batchId]/page.tsx`, `batch-card.tsx`, `onboarding/page.tsx` | 3 | evergreen / spinner |
| `components/chat/structured-output-message.tsx` | d80% | score/verdict (osim severity — vidi odluku) |

### 🟡 Traži odluku — značenjske ne-semantičke boje
| # | Fajl | Pitanje |
|---|---|---|
| D1 | `structured-output-message.tsx` | **Severity 4 nivoa** (CRITICAL/HIGH/MEDIUM/LOW), a imamo 3 tokena → HIGH i MEDIUM se sudaraju |
| D2 | `soma/review-queue/[batchId]/page.tsx` | **Platform-identitet boje** (LinkedIn/X/YouTube/Instagram/TikTok) — zadržati prepoznatljive ili svesti na tokene |
| D3 | `status-badge.tsx`, soma | **EDITED status** (purple) — nema semantički token |
| D4 | `templates/template-gallery.tsx` | **4 dekorativne kategorija-boje** (lime/pink/rose/sky) |

### 🔵 Namerno — ZADRŽATI (potvrđeno)
- `auth-shell.tsx` — dark brand panel (`#0C0A09`, `#F2641E`=Ember primary). *(Opciono: `#F2641E` → token radi buduće promene brenda.)*
- `login/page.tsx` — zvanične Google OAuth logo boje (`#4285F4`…). Standard, ostaju.
- `devsecops/page.tsx` — SVG dijagram arhitekture (52 elementa). Dekorativan, samostalan. *(Opciono: uskladiti sa dark temom.)*

## Predlog redosleda
1. Mehaničko mapiranje (9+ fajlova) — najveći efekat, nizak rizik.
2. Odluke D1–D4 → pa primena.
3. Namerne (brand/OAuth/SVG) — zadržati; eventualno auth-shell token.

*Verifikacija posle svake oblast: typecheck + RLS guard + prod light/dark.*
