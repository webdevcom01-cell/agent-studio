# Česti flow patterns (recepti)

## Pattern 1: Osnovni Customer Support Bot

**Opis:** Korisnik postavlja pitanje, agent pretražuje KB i generiše odgovor, pa pita ima li još pitanja.

**Flow:**
```
Message (pozdrav)
    ↓
Capture (spremi pitanje u user_question)
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response (system prompt: customer support instrukcije)
    ↓
Goto → Capture (petlja: opet čeka pitanje)
```

**System Prompt za AI Response:**
```
Ti si customer support asistent za [Kompanija].
Odgovaraj profesionalno i koncizno na osnovu dostavljenog konteksta.
Ako informacija nije u kontekstu, reci da ne znaš i uputi na support@kompanija.com.
Uvijek odgovaraj na jeziku kojim korisnik piše.
```

---

## Pattern 2: FAQ Bot sa kategorijama

**Opis:** Korisnik bira kategoriju, pa postavlja pitanje unutar te kategorije.

**Flow:**
```
Message (pozdrav)
    ↓
Button (odaberi kategoriju: Proizvodi / Dostava / Cijene / Kontakt)
    → sprema u: user_category
    ↓
Capture (šta konkretno te zanima?)
    → sprema u: user_question
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response
    ↓
End
```

**Napomena:** Kombinovanje kategorije i pitanja u KB Search query-ju poboljšava relevantnost rezultata.

---

## Pattern 3: Lead Capture Bot

**Opis:** Agent prikuplja kontakt podatke od potencijalnog klijenta.

**Flow:**
```
Message (predstavi se i objasni zašto prikupljaš podatke)
    ↓
Capture (ime i prezime → spremi u: user_name)
    ↓
Capture (email → spremi u: user_email, validacija: email)
    ↓
Capture (naziv kompanije → spremi u: company_name)
    ↓
Capture (šta te zanima? → spremi u: interest)
    ↓
API Call (pošalji podatke u CRM)
    ↓
Message (Hvala {{user_name}}! Javit ćemo vam se na {{user_email}}.)
    ↓
End
```

---

## Pattern 4: Inteligentno usmjeravanje (Routing)

**Opis:** AI klasificira namjeru korisnika i usmjerava na pravi tim/odgovor.

**Flow:**
```
Message (pozdrav)
    ↓
Capture (šta te zanima? → user_question)
    ↓
AI Classify (Input Variable: user_question, kategorije: complaint / inquiry / order / other)
    → sprema u: intent
    ↓
Condition (provjera: intent)
    ├── equals "complaint" → Complaint Handler grana
    ├── equals "order" → Order Handler grana
    ├── equals "inquiry" → KB Search → AI Response
    └── default → General Response
```

---

## Pattern 5: Escalacija na ljudski agent

**Opis:** Bot pokušava odgovoriti, ali ako ne može, eskalira na čovjeka.

**Flow:**
```
Capture (pitanje → user_question)
    ↓
KB Search
    ↓
Condition (kb_context is_empty)
    ├── DA (nema konteksta) → Message "Preusmjeravam vas..." → API Call (notifikacija timu) → End
    └── NE (ima konteksta) → AI Response → Capture (je li odgovor pomogao?)
                                               ├── "da" → End
                                               └── "ne" → API Call → End
```

---

## Greške koje treba izbjegavati

1. **Zaboravljeni Start nod** — flow mora imati jedan nod bez ulaznih veza (start). Provjeri da Message ili prvi Capture nod nema veza koje dolaze u njega.

2. **KB Search bez Query Variable** — uvijek postavi `Query Variable` polje na `user_question` ili `last_message` (samo ime varijable, bez `{{}}`). Prazno polje neće vratiti rezultate.

3. **AI Response bez System Prompta** — bez system prompta AI neće znati ko je i šta treba raditi. Uvijek dodaj system prompt.

4. **Beskonačna petlja** — ako koristiš Goto za petlju, uvijek osiguraj izlaz (Condition koji može ići na End).

5. **Varijable bez inicijalizacije** — ako koristiš varijablu u Message nodu (npr. `{{user_name}}`), ona mora biti prethodno postavljena kroz Capture ili Set Variable nod.
