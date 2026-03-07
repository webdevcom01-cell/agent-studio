# Knowledge Base — Kompletan vodič

## Šta je Knowledge Base?

Knowledge Base (KB) je baza znanja tvog agenta. Umjesto da AI odgovara samo iz svog općeg znanja, KB omogućava agentu da koristi **tvoje specifične podatke** — dokumentaciju, FAQ stranice, blog postove, priručnike.

### Kako radi (RAG pipeline)

```
Dodaj izvor (URL / tekst / fajl)
    ↓
Scraping / parsiranje sadržaja
    ↓
Chunking (dijeljenje teksta na dijelove od ~400 tokena)
    ↓
Embedding (pretvaranje svakog chunk-a u vektor od 1536 dimenzija)
    ↓
Spremanje u PostgreSQL (pgvector)
```

Kada korisnik postavi pitanje, agent:
1. Pretvori pitanje u embedding vektor
2. Pronađe najsličnije chunk-ove (semantic search + BM25 keyword search)
3. Spoji rezultate (Reciprocal Rank Fusion)
4. Opcionalno re-rankira pomoću LLM-a
5. Proslijedi kontekst AI Response nodu

---

## Tipovi izvora

### URL izvor
Scrapaj sadržaj bilo koje web stranice. Agent Studio koristi Cheerio parser koji automatski uklanja navigaciju, footer, script i style tagove — ostaje samo koristan tekst.

### Text izvor
Direktno unesi tekst. Korisno za interne dokumente, FAQ odgovore, ili bilo šta što nije dostupno kao URL.

### File izvor (upload)
Upload PDF ili DOCX fajlova (max 10 MB). Podržani formati:
- **PDF** — parsira se pomoću `pdf-parse` biblioteke
- **DOCX** — parsira se pomoću `mammoth` biblioteke

---

## Kako dodati URL izvore

1. Idi na **Knowledge** stranicu agenta
2. Klikni **"Add Source"**
3. Odaberi **"URL"** tab
4. Unesi puni URL (sa `https://`)
5. Klikni **"Add"**

### Primjeri dobrih URL-ova

| Tip | Primjer | Zašto je dobar |
|-----|---------|---------------|
| FAQ stranica | `https://kompanija.com/faq` | Strukturirana pitanja i odgovori |
| Dokumentacija | `https://docs.kompanija.com/getting-started` | Detaljan sadržaj |
| Blog post | `https://kompanija.com/blog/kako-koristiti-x` | Specifična tema |
| Help centar | `https://help.kompanija.com/artikl-123` | Korisničke instrukcije |

### URL-ovi koje treba izbjegavati

| Tip | Primjer | Zašto je loš |
|-----|---------|-------------|
| Početna stranica | `https://kompanija.com` | Previše navigacije, malo sadržaja |
| Login stranica | `https://app.kompanija.com/login` | Nema korisnog teksta |
| SPA aplikacija | `https://app.kompanija.com/dashboard` | JavaScript rendering — scraper ne vidi sadržaj |
| Stranica sa slikama | `https://kompanija.com/galerija` | Slike se ne indeksiraju |

---

## Koliko URL-ova dodati?

Nema striktnog limita, ali evo smjernica:

| Broj URL-ova | Primjer upotrebe |
|-------------|-----------------|
| 3–10 | Mali FAQ bot, jedna tema |
| 10–30 | Customer support bot sa više kategorija |
| 30–100 | Kompletna dokumentacija proizvoda |
| 100+ | Enterprise help desk (pazi na kvalitet) |

### Kvalitet > kvantitet

Bolje je imati 10 URL-ova sa čistim, relevantnim sadržajem nego 100 URL-ova sa šumom. Svaki URL koji dodaš prolazi kroz chunking i indeksiranje — irelevantni chunk-ovi mogu smanjiti kvalitet odgovora.

---

## Kako provjeriti da li je ingesting uspio

### Status izvora

Na Knowledge stranici svaki izvor prikazuje status:

| Status | Značenje | Akcija |
|--------|---------|--------|
| **PENDING** | Čeka na obradu | Sačekaj — obrađuje se po redu |
| **PROCESSING** | Scraping i indeksiranje u toku | Sačekaj — može trajati 10–60 sekundi |
| **READY** | Uspješno indeksiran | Spreman za pretragu |
| **FAILED** | Greška pri obradi | Provjeri URL i pokušaj ponovo |

### Broj chunk-ova

Pored svakog izvora prikazan je broj chunk-ova (npr. "24 chunks"). Ako izvor ima **0 chunk-ova** a status je READY, stranica vjerovatno nema dovoljno teksta.

### Test pretraga

Najbolji način za provjeru je testiranje pretrage:

1. Na Knowledge stranici koristi **Search** funkcionalnost
2. Unesi upit koji se odnosi na sadržaj izvora
3. Provjeri da li rezultati vraćaju relevantne chunk-ove
4. Obrati pažnju na **score** — viši score znači veća relevantnost

---

## Tips za bolju pretragu

### 1. Dodaj URL-ove sa strukturiranim sadržajem

Stranice sa jasnim naslovima, paragrafima i listama daju bolje chunk-ove nego stranice sa mnogo navigacije i reklama.

### 2. Koristi specifične URL-ove umjesto generalnih

```
Loše:  https://kompanija.com
Dobro: https://kompanija.com/docs/instalacija
Dobro: https://kompanija.com/faq/placanje
```

### 3. Dodaj tekst izvore za ključne informacije

Ako imaš informacije koje nisu na webu (radno vrijeme, cijene, politike), dodaj ih kao Text izvor. Formatiraš ih kako želiš — to daje najčistije chunk-ove.

### 4. Obrati pažnju na jezik

Ako korisnici pitaju na bosanskom/srpskom/hrvatskom, a KB sadržaj je na engleskom, kvalitet pretrage će biti niži. Pokušaj da KB sadržaj bude na istom jeziku kao i očekivana pitanja.

### 5. Kombiniraj KB Search sa dobrim System Promptom

System Prompt u AI Response nodu treba da kaže agentu:
- Koristi samo informacije iz konteksta
- Ako nema odgovora u kontekstu, kaži to korisniku
- Odgovaraj na jeziku korisnika

Primjer:
```
Ti si asistent kompanije X. Odgovaraj isključivo na osnovu dostavljenog konteksta.
Ako kontekst ne sadrži traženu informaciju, reci korisniku da nemaš taj podatak
i uputi ga na support@kompanija.com.
Budi koncizan — odgovaraj u 2-3 rečenice kada je moguće.
```

### 6. Testiraj i iteruj

1. Dodaj izvore
2. Testiraj sa realnim pitanjima
3. Ako odgovori nisu dovoljno dobri:
   - Dodaj više specifičnih URL-ova
   - Dodaj Text izvore sa nedostajućim informacijama
   - Poboljšaj System Prompt
4. Ponovi dok ne budeš zadovoljan

---

## Brisanje izvora

Ako neki izvor nije koristan ili sadrži zastarjele informacije:

1. Na Knowledge stranici pronađi izvor
2. Klikni **Delete** dugme
3. Izvor i svi njegovi chunk-ovi se brišu iz baze

Brisanje je trajno — moraš ponovo dodati URL ako ga želiš nazad.

---

## Tehnički detalji

- **Chunk veličina:** ~400 tokena sa 20% overlap-a između chunk-ova
- **Embedding model:** OpenAI `text-embedding-3-small` (1536 dimenzija)
- **Pretraga:** Hybrid (semantic cosine similarity + BM25 keyword search)
- **Ranking:** Reciprocal Rank Fusion + opcionalni LLM re-ranking
- **Skladištenje:** PostgreSQL sa pgvector ekstenzijom
- **Max upload:** 10 MB po fajlu (PDF/DOCX)
