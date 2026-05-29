---
description: Lint SOMA vault — pokreni deterministički scripts/lint-vault.mjs i prenesi izlaz VERBATIM, pa dodaj savet
---

PRAVILO: brojanje radi ISKLJUČIVO skript. Ti NE preračunavaš, NE re-bucket-uješ, NE izmišljaš nijedan broj ili fajl.

1. Pokreni: `node scripts/lint-vault.mjs`
2. Prenesi stdout skripta **DOSLOVNO** (cela tabela + sekcije), bez ijedne izmene brojeva ili liste fajlova. Ako želiš, stavi ga u code blok.
3. TEK ISPOD, u zasebnoj sekciji "## Savet", dodaj prioritizaciju i tumačenje prema system/vault-standard.md — ali ne navodi nijedan novi broj/fajl koji nije u izlazu skripta.
4. Ako skript padne, prijavi grešku i STANI. NIŠTA ne menjaj u vault-u.
