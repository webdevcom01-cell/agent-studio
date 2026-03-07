# Vodič za početnike — Tvoj prvi agent

## Korak 1: Kreiraj agenta

1. Otvori Agent Studio na `http://localhost:3000`
2. Klikni **"New Agent"** dugme na dashboardu
3. Unesi ime agenta (npr. "Moj Customer Support Bot")
4. Dodaj kratak opis šta agent radi
5. Agent se automatski kreira sa praznim flow-om i Knowledge Base-om

---

## Korak 2: Dodaj Knowledge Base (URL scraping)

Knowledge Base je baza znanja tvog agenta. Dodaj URL-ove stranica čiji sadržaj želiš da agent koristi za odgovore.

1. Klikni **"Edit Flow"** na kartici agenta (otvara se Builder)
2. U Builder-u klikni **"Knowledge Base"** dugme (gore desno, pored "Test Chat")
3. Klikni **"Add Source"** dugme
4. Odaberi tab **"URL"**
5. Unesi URL stranice (npr. `https://tvoja-stranica.com/faq`)
6. Klikni **"Add"**

Agent Studio će automatski:
   - Scrapati sadržaj stranice
   - Podijeliti tekst na chunk-ove (400 tokena, 20% overlap)
   - Generisati embedding vektore (OpenAI text-embedding-3-small)
   - Sačuvati sve u bazu za pretragu

Status izvora možeš pratiti na Knowledge stranici:
- **PENDING** — čeka na obradu
- **PROCESSING** — scraping i indeksiranje u toku
- **READY** — spreman za pretragu
- **FAILED** — greška pri obradi (provjeri URL)

---

## Korak 3: Napravi osnovni flow

Idi na Builder (klikni **"Builder"** link na kartici agenta) i napravi ovaj jednostavan flow:

### Najjednostavniji Q&A flow (4 noda)

```
Message (pozdrav)
    ↓
Capture (spremi pitanje u user_question)
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response (automatski koristi kb_context)
```

**VAŽNO:** Capture nod je OBAVEZAN prije KB Search noda. Capture prikuplja korisnikovo pitanje i sprema ga u varijablu (npr. user_question). KB Search zatim koristi tu varijablu za pretragu. Bez Capture noda, KB Search nema šta da pretražuje.

**Kako dodati nodove:**

1. Klikni **"Add Node"** dugme u Builder-u
2. Odaberi tip noda iz dropdown menija
3. Klikni na nod da otvoriš Property Panel (desni sidebar)
4. Popuni polja za svaki nod

**Podešavanje svakog noda:**

### Message nod
- **Text:** `Zdravo! Ja sam tvoj asistent. Postavi mi pitanje.`

### Capture nod
- **Prompt:** `Šta te zanima?`
- **Variable Name:** `user_question`

### KB Search nod
- **Query Variable:** `user_question` (samo ime varijable, bez `{{}}`)
- Rezultati se automatski spremaju u `{{kb_context}}`

### AI Response nod
- **System Prompt:**
```
Ti si helpdesk asistent. Odgovaraj isključivo na osnovu dostavljenog konteksta.
Ako odgovor nije u kontekstu, reci korisniku da nemaš tu informaciju.
Odgovaraj na jeziku kojim korisnik piše.
```
- **Model:** `deepseek-chat` (default, brz i jeftin)

**Povezivanje nodova:**

Povuci liniju od izlazne tačke jednog noda do ulazne tačke sljedećeg. Redoslijed je bitan — flow ide odozgo prema dolje.

---

## Korak 4: Testiraj agenta

1. U Builder-u klikni **"Test Chat"** dugme (gore desno)
2. Postavi pitanje koje se odnosi na sadržaj iz tvog Knowledge Base-a
3. Agent treba da:
   - Prikaže pozdravnu poruku
   - Zatraži pitanje (Capture nod)
   - Pretraži KB i generiše odgovor

**Šta ako agent ne daje dobre odgovore?**

- Provjeri da je KB Source u statusu **READY**
- Testiraj pretragu na Knowledge stranici (Search tab)
- Dodaj više URL-ova za bolju pokrivenost
- Poboljšaj System Prompt sa konkretnijim instrukcijama

---

## Korak 5: Podijeli chat link

Svaki agent ima javni chat link koji je odmah spreman za dijeljenje — nema posebnog koraka objavljivanja:

```
http://localhost:3000/chat/[agentId]
```

Taj link možeš poslati kome god treba pristup agentu. Korisnik ne treba nikakav login — samo otvori link i počne razgovor.

Brz pristup: Na dashboardu klikni **"Chat"** dugme na kartici agenta da otvoriš chat link direktno.

---

## Korak 6: Exportuj i importuj agente

### Export
1. Na dashboardu klikni tri tačke (menu) na kartici agenta
2. Odaberi **"Export"**
3. Preuzima se JSON fajl sa konfiguracijom agenta i flow-om

### Import
1. Na dashboardu klikni **"Import Agent"** dugme
2. Odaberi JSON fajl prethodno exportovanog agenta
3. Novi agent se kreira sa sufiksom **(imported)**

Export ne uključuje Knowledge Base ni razgovore — samo konfiguraciju i flow.

---

## Sljedeći koraci

- Dodaj više izvora u Knowledge Base → [09-knowledge-base-guide.md](./09-knowledge-base-guide.md)
- Prouči sve tipove nodova → [02-nodes-osnovno.md](./02-nodes-osnovno.md), [03-nodes-ai.md](./03-nodes-ai.md)
- Pogledaj napredne flow patterns → [06-flow-patterns.md](./06-flow-patterns.md)
- Rješavanje problema → [07-faq-troubleshooting.md](./07-faq-troubleshooting.md)
