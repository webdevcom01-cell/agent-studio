# Agent Studio — Pregled platforme

## Šta je Agent Studio?

Agent Studio je vizuelni builder za kreiranje AI agenata i chatbotova bez pisanja koda. Pomoću drag-and-drop interfejsa možeš kreirati pametne konverzacijske agente koji koriste tvoju vlastitu bazu znanja (Knowledge Base) i generišu odgovore koristeći AI modele.

## Glavne komponente

### 1. Flow Builder
Vizuelni editor gdje spajate nodove (čvorove) da definišete tok razgovora. Svaki agent ima jedan flow koji se izvršava kada korisnik pošalje poruku.

### 2. Knowledge Base (KB)
Baza znanja agenta. Možeš dodati URL-ove web stranica koje će biti automatski scrapane, chunkovane i indeksirane za pretragu. Agent koristi ovu bazu da daje tačne odgovore.

### 3. Chat Interface
Svaki agent ima javni chat link koji možeš podijeliti sa korisnicima. Dostupan je na `/chat/[agentId]`.

### 4. Test Chat
Dugme u gornjem desnom uglu Builder-a koje otvara chat za testiranje agenta u realnom vremenu.

---

## Osnovni workflow

1. **Kreiraj agenta** — daj mu ime i opis
2. **Dodaj Knowledge Base** — unesi URL-ove koji sadrže relevantne informacije
3. **Napravi flow** — dodaj i poveži nodove u Builder-u
4. **Testiraj** — koristi Test Chat da provjeriš radi li agent ispravno
5. **Podijeli** — pošalji chat link korisnicima

---

## Kako funkcionira flow izvršavanje?

Kada korisnik pošalje poruku:
1. Flow počinje od prvog noda (onaj koji nema ulaznih veza)
2. Svaki nod se izvršava redom
3. Ako nod čeka na korisnički unos (npr. Capture), flow se pauzira i čeka
4. Nakon korisnikovog odgovora, flow se nastavlja od tog noda
5. Flow završava kada dođe do End noda ili nema više nodova

---

## AI modeli koji su dostupni

- **deepseek-chat** — brz i jeftin, dobar za opće upite
- **gpt-4o** — najmoćniji OpenAI model
- **gpt-4o-mini** — brži i jeftiniji OpenAI model
- **claude-3-5-sonnet** — Anthropic model, odličan za složene upite
- **claude-3-haiku** — brži Anthropic model

---

## Varijable u flow-u

Varijable se koriste za čuvanje i prenošenje podataka između nodova. Pišu se u formatu `{{naziv_varijable}}`.

Automatski dostupne varijable:
- `{{last_message}}` — posljednja poruka korisnika
- `{{kb_context}}` — rezultati pretrage Knowledge Base (nakon KB Search noda)

Vlastite varijable kreiraš kroz Capture nod ili Set Variable nod.
