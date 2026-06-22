# Zadatak #1 · Faza 0 (Deo 1) — Audit bezbednosne osnove RLS-a + plan implementacije

> Opseg: sve što je **proverljivo iz koda** o RLS temelju (politike, uloge, klijent, flag, kontekst).
> Pravilo: svaki nalaz je označen kao **[VERIFIKOVANO IZ KODA]** ili **[ZAHTEVA ŽIVU BAZU]**.
> Ništa o produkcionoj bazi nije tvrđeno kao činjenica — za to su dati tačni upiti koje ti pokreneš.
> Mereno iz `/Desktop/agent-studio`, 2026-06-14.

---

## 1. Rezime nalaza (TL;DR)

**Dobra vest:** baza je ozbiljno i ispravno postavljena. **Loša vest:** aplikacija je verovatno ne koristi.

Najkraće: brave su ugrađene i kvalitetne, ali ključ je i dalje u svakim vratima. RLS može biti potpuno zaobiđen na nivou konekcije — i to bi učinilo **sav** posao ožičavanja ruta (Opcija B) bezvrednim dok se ne ispravi. Zato je Faza 0 bila prava odluka.

**Jedno odlučujuće pitanje za celu Fazu 0:** *kao koja DB uloga se aplikacija konektuje u produkciji?* Ako je `postgres` (superuser) → RLS je inertan. Ako je `app_user` → temelj radi.

---

## 2. Šta je DOBRO postavljeno [VERIFIKOVANO IZ KODA]

| Stavka | Nalaz | Dokaz (mereno) |
|---|---|---|
| Pokrivenost RLS | 19 tabela ima `ENABLE` **i** `FORCE ROW LEVEL SECURITY` (19 = 19) | `grep ENABLE/FORCE prisma/migrations` |
| Politike | 109 `CREATE POLICY`, pun CRUD (27× SELECT/INSERT/UPDATE/DELETE) | `grep 'FOR ...' migrations` |
| Kaskadna izolacija | `Flow`/`KnowledgeBase` se filtriraju preko `agentId IN (SELECT … FROM Agent WHERE organizationId = current_setting(...))` | `20260517_…cascaded_tables` |
| DB uloge | Migracija kreira `app_user` (**NOSUPERUSER, NOBYPASSRLS**) i `admin_user` (**BYPASSRLS**), sa GRANT-ovima i default privilegijama | `20260519_create_app_admin_db_roles` |
| Pattern konteksta | `withOrgContext()` pinuje konekciju kroz `$transaction` + `set_config('app.current_org_id', …, true)` | `src/lib/db/rls-middleware.ts` |
| Per-request org | `AsyncLocalStorage` (`runWithOrgId`/`getCurrentOrgId`) | `src/lib/context/org-context.ts` |
| Worker kontekst | Worker poziva `runWithOrgId(orgId, () => dispatchJob(job))` | `src/lib/queue/worker.ts` |
| Indeksi | 11 `@@index([organizationId…])` | `grep @@index schema.prisma` |
| Rollback bezbednost | Politike skoupovane, default `enabled:false` (ne pada slučajno) | feature-flags |

Zaključak dela 2: **ne treba redizajn baze.** Neko je ovde radio pažljivo i u skladu sa standardima.

---

## 3. Šta je PROBLEM [VERIFIKOVANO IZ KODA] — temeljni jaz

### 3.1 🔴 Aplikacija se ne konektuje kao `app_user` (uloge postoje, ali nisu ožičene)
- `src/lib/prisma.ts`: `export const prisma = new PrismaClient()` → koristi **podrazumevani** datasource = `DATABASE_URL`. Jedini override je `prismaRead` preko `DATABASE_READ_URL`.
- **Ne postoji nijedan kod** koji koristi `DATABASE_URL_APP_USER` ili `DATABASE_URL_ADMIN_USER` (grep po `src/` → 0 upotreba, samo string u opisu flag-a).
- `.env.example`: `DATABASE_URL=postgresql://postgres:postgres@…` (superuser), a `DATABASE_URL_APP_USER` je **zakomentarisan**.
- **Posledica (Postgres semantika):** superuser i `BYPASSRLS` uloge **zaobilaze RLS u potpunosti**, bez obzira na `FORCE`. Ako se app konektuje kao `postgres`, sve politike i `withOrgContext` ne rade ništa.
- Dodatno: phase1 politike su skoupovane `TO app_user` → ako konekcija nije `app_user`, te politike se i ne primenjuju.

> Ovo je „lock-and-key" problem: uloga `app_user` (NOBYPASSRLS) je napravljena baš da RLS radi, ali je aplikacija ne koristi. Isto i za `admin_user` — admin/cron putevi takođe idu kroz `DATABASE_URL`, ne kroz BYPASSRLS ulogu.

### 3.2 🟠 Enforcement flag je trenutno isključen → RLS je i tako inertan u app-u
- `rls-enforcement`: `enabled:false, rolloutPercent:0` [VERIFIKOVANO]. Override: env `RLS_ENFORCEMENT_ENABLED=true` ili Redis.
- Kada je flag isključen, `withOrgContext()` **preskače** `$transaction`+`set_config` (fail-open) i izvršava upit na običnom klijentu.
- Dakle, čak i nezavisno od 3.1, RLS trenutno **ne filtrira** u aplikaciji.

### 3.3 🟠 Dva stila politika (nekonzistentnost) [VERIFIKOVANO]
- Rane migracije (`enable_rls`, `cascaded_tables`): politike bez role-scope (primenjuju se na sve uloge), sa empty-string zaštitom `current_setting(...) IS DISTINCT FROM ''`.
- Phase1 migracije (`Goal`, `Department`, …): politike `TO app_user`.
- Nije nužno bug, ali znači da **ispravnost zavisi od toga da se app konektuje kao `app_user`** — što nas vraća na 3.1.

### 3.4 🟠 Lozinke uloga su placeholder [VERIFIKOVANO IZ KODA / ZAHTEVA ŽIVU BAZU za potvrdu]
- Migracija kreira uloge sa `PASSWORD 'CHANGE_ME_VIA_RAILWAY_CONSOLE'` i eksplicitnom napomenom da se lozinke postave ručno (Railway). Da li su postavljene — ne može se znati iz koda.

---

## 4. Šta SAMO TI možeš proveriti [ZAHTEVA ŽIVU BAZU] — sa tačnim upitima

⚠️ **Gađaj bazu `railway`, NE `XB1Dp83…`.** Railway → Postgres → "Query tab" i `DATABASE_PUBLIC_URL` (Postgres servis, "Connect") pokazuju na default bazu servisa `XB1Dp83…` — ona je PRAZNA i nije baza koju app koristi (poznat footgun, vidi `RLS-TESTING.md`). Živa aplikativna baza je `railway`. Pokreni ove upite preko connection stringa koji se završava na `/railway` (isti koji koristi produkcija — `DATABASE_URL`/`DIRECT_URL` iz `.env`), npr. `psql "postgresql://postgres:<LOZINKA>@tramway.proxy.rlwy.net:54364/railway"`. Ja ti dajem upit i šta je „ispravan" odgovor. Ne moraš deliti rezultate ako ne želiš — bitno je da ih ti vidiš.

**P0-A · Kao koja uloga radi aplikacija?**
```sql
SELECT current_user, current_setting('is_superuser') AS is_superuser;
```
> Pokreni preko ISTOG `DATABASE_URL` koji koristi produkcija. Poželjno: `current_user = app_user`, `is_superuser = off`.
> Ako je `current_user = postgres` ili `is_superuser = on` → **RLS je zaobiđen** (potvrda glavnog rizika 3.1).

**P0-B · Atributi uloga (bypass/superuser):**
```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN ('postgres','app_user','admin_user');
```
> Poželjno: `app_user` → super=f, bypass=f, login=t; `admin_user` → bypass=t, login=t.

**P0-C · Da li su uloge uopšte kreirane (da li je migracija prošla)?**
> Ako `app_user`/`admin_user` ne postoje u rezultatu P0-B → migracija `20260519` nije primenjena na toj bazi.

**P0-D · Pooler režim (Railway/PgBouncer):**
> Proveri da li produkcija ide kroz pooler i u kom režimu. Pošto se koristi `set_config(..., true)` unutar `$transaction`, **transaction-mode pooling je kompatibilan**; session-mode takođe radi. Bitno je samo da nije neki režim koji deli session state između zahteva — što transakcijski pattern ionako neutrališe.

**P0-E · Brzi praktični test izolacije (na staging bazi):**
```sql
-- kao app_user, bez set_config: očekuj 0 redova ako RLS radi
SELECT count(*) FROM "Agent";
-- sa kontekstom: očekuj samo redove te org
SELECT set_config('app.current_org_id', '<neki_realan_orgId>', false);
SELECT count(*) FROM "Agent";
```
> Ako prvi count vrati sve redove (a ne 0/filtrirano) dok si `app_user` → politike/uloga nisu efektivne.

---

## 5. Plan implementacije Faze 0 (profesionalni, gated)

> Cilj Faze 0: dovesti temelj u stanje gde RLS **stvarno** filtrira pre nego što uđemo u Opciju B (ožičavanje 149 ruta).

**Korak 0.1 — Snimi stvarno stanje (live provere P0-A…E).**
Rezultat: jasno DA/NE na pitanje „da li app radi kao non-bypass uloga".

**Korak 0.2 — Ako app radi kao superuser/bypass (najverovatnije): preusmeri konekciju na `app_user`.**
Dve opcije (biramo zajedno u sledećem koraku, ne sad):
- (a) Postavi produkcioni `DATABASE_URL` da koristi `app_user` (najmanje koda; ali pazi — `prisma migrate`/DDL traži vlasnika/superusera, pa migracije moraju ići preko `DIRECT_URL` kao `postgres`/owner).
- (b) Zadrži `DATABASE_URL` kao admin za migracije, a u `prisma.ts` dodaj zaseban klijent za runtime upite preko `DATABASE_URL_APP_USER`.
> Trade-off: (a) je jednostavnije ali zahteva da se migracije eksplicitno odvoje na `DIRECT_URL`; (b) je čistije razdvajanje ali dodaje drugi klijent i tačku održavanja.

**Korak 0.3 — Ožiči admin/cron/migracije na BYPASSRLS put.**
Inventar puteva koji legitimno prelaze org granice (admin rute, scheduler, GDPR export, migracije) → moraju koristiti `admin_user`/owner, inače će pući kad enforcement krene.

**Korak 0.4 — Postavi lozinke uloga (Railway) i potvrdi GRANT-ove** (postoji `phase0b-grants.sh`).

**Korak 0.5 — Definiši siguran rollout enforcement flag-a** (već postoji: env `RLS_ENFORCEMENT_ENABLED` + Redis %); rollback = isključi flag, bez deploya.

**Gate:** tek kad P0-E test na stagingu pokaže pravu izolaciju kao `app_user` → prelazak na Opciju B (pilot `agents/*`).

---

## 6. Rizici Faze 0 i mitigacije

| Rizik | Status | Mitigacija |
|---|---|---|
| App konekcija = superuser → RLS inertan | 🔴 verovatno (env.example + nema app_user wiring) | Korak 0.2 (preusmeri na app_user) |
| Migracije pucaju kad DATABASE_URL postane app_user (nema DDL prava) | 🟠 realno kod opcije (a) | Odvoji migracije na `DIRECT_URL`/owner |
| Admin/cron/GDPR pucaju pod enforcement-om | 🟠 admin put nije ožičen na admin_user | Korak 0.3 inventar + wiring pre flag-a |
| Lozinke uloga nisu postavljene | 🟠 nepoznato | P0-B/C provera + Railway ALTER ROLE |
| Pooler deli session state | 🟢 nisko (transakcijski pattern štiti) | P0-D potvrda |

---

## 7. Iskren savet

**Najvažnije, bez ublažavanja:** baza je odrađena bolje nego što tvoja stara dokumentacija priznaje — politike, FORCE RLS, least-privilege uloge, indeksi, čak i namenski skill i testovi. To je realno iznad proseka. Ali sve to trenutno **„visi u vazduhu"** jer aplikacija ne koristi `app_user` ulogu i jer je enforcement flag isključen. To je kao da si kupio sef vrhunske klase i ostavio ga otključanog.

Druga iskrena stvar: ovo je takođe **najbolji mogući ishod za 1 sat posla.** Nema potrebe da pišemo nove politike ni da migriramo šemu — verovatno je dovoljna jedna izmena konekcije (Korak 0.2) i provera uloga. Faza 0 je upravo zato bila prava prva karta: jeftino otkriva da li B uopšte ima smisla.

Treća stvar (granica poštenja): **ja ne mogu da potvrdim produkciju.** Sve u sekciji 3 je dokazano iz koda, ali da li produkcioni `DATABASE_URL` zaista koristi `postgres` — to vidiš samo ti, kroz upite iz sekcije 4. Ne želim da ti dam lažnu sigurnost u bilo kom smeru.

**Konkretan sledeći korak koji predlažem:** ti pokreneš **P0-A i P0-B** (dva upita, 2 minuta) i kažeš mi samo `current_user` i `rolbypassrls` vrednosti. Na osnovu toga:
- ako je `app_user`/non-bypass → temelj je zdrav, idemo direktno na pilot `agents/*` (Opcija B);
- ako je `postgres`/bypass → prvo radimo Korak 0.2 (preusmeravanje na `app_user`), pa onda B.

Tako nastavljamo bez ijedne pretpostavke.

---

*Svi nalazi o repo-u izmereni iz koda 2026-06-14. Tvrdnje o produkcionoj bazi nisu davane — za njih su priloženi tačni upiti u sekciji 4.*

---

## 8. REZULTAT PROVERE (2026-06-14, potvrđeno sa korisnikom)

**P0-A odgovor:** produkcioni `DATABASE_URL` koristi korisnika **`postgres`** (Railway default = superuser/owner).

### 8.1 Šta to znači (potvrđeno)
- Postgres **superuser zaobilazi RLS u potpunosti** (i `FORCE` ne važi za superusera). → **RLS je trenutno inertan u produkciji.** Svih 19 tabela sa politikama i svih 16 ožičenih ruta trenutno NE pružaju tenant izolaciju.
- Drugim rečima: temelj (politike, uloge, indeksi) je izgrađen, ali aplikacija ga zaobilazi jer se kači kao superuser.

### 8.2 🔴 Kritična ispravka plana — naivni „switch na app_user" bi SRUŠIO aplikaciju
Ranije je izgledalo da je „prebaci konekciju na `app_user`" brz Faza-0 fix. **Analiza zavisnosti pokazuje da to NIJE bezbedno uraditi sada**, i evo zašto (sve izvedeno iz verifikovanog koda):
- `app_user` je `NOBYPASSRLS` (migracija `20260519`), a RLS je `FORCE` na 19 tabela.
- Kada se upit izvrši bez `set_config('app.current_org_id', …)`, politike vraćaju **0 redova** (prazan string ne mečuje nijedan org).
- Samo **16 od 165 ruta** poziva `withOrgContext` (koji postavlja taj kontekst), i to samo kad je flag uključen.
- **Posledica:** čim bi se app prebacio na `app_user`, ~149 neožičenih ruta na tih 19 tabela bi vraćalo prazno → masovni lom aplikacije.

> Zato je Faza 0 i bila vredna: otkrila je da ovo NIJE jedan brzi prekidač, nego da ožičavanje ruta mora doći PRE prebacivanja uloge.

### 8.3 Ispravljen redosled (bezbedan za produkciju)
1. **Ostani na `postgres` zasad** — RLS je zaobiđen, ali ništa nije slomljeno (samo nema izolacije).
2. **Faza 1 — ožiči svih ~149 ruta** sa `withOrgContext` (dok je app na `postgres`, flag isključen → **nula promene ponašanja**, potpuno bezbedno, inkrementalno).
3. **Faza 2 (staging)** — prebaci na `app_user` + uključi flag → dokaži izolaciju i da ništa ne puca.
4. **Faza 3 (produkcija)** — bekap → prebaci na `app_user` + flag → prati → rollback = vrati na `postgres`.

### 8.4 Pre cutover-a (Faza 3) obavezno potvrditi (jeftino, kasnije)
- Da li `app_user`/`admin_user` zaista postoje na produkciji i da li im je lozinka postavljena (migracija ih kreira sa placeholder lozinkom `CHANGE_ME_VIA_RAILWAY_CONSOLE`). Provera: `\du` u psql.
- Da migracije nastave da rade preko owner/`DIRECT_URL` (app_user nema DDL prava).

*Rezultat provere zabeležen 2026-06-14 na osnovu potvrde korisnika (DATABASE_URL korisnik = postgres).*
