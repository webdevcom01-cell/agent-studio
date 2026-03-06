# Node tipovi — AI

## AI Response nod

**Kategorija:** AI  
**Opis:** Generiše AI odgovor na osnovu konteksta razgovora i system prompta. Najvažniji nod za konverzacijske agente.

**Polja:**
- `Label` — interno ime noda
- `System Prompt` — instrukcije za AI (ko je agent, kako se ponaša, šta smije/ne smije)
- `Model` — AI model koji se koristi (deepseek-chat, gpt-4o-mini, claude-3-haiku itd.)
- `Max Tokens` — maksimalni broj tokena u odgovoru (default: 500)
- `Output Variable` — naziv varijable gdje se sprema odgovor (npr. `ai_response`)

**Primjer System Prompta:**
```
Ti si customer support asistent za [Naziv kompanije].
Odgovaraj na osnovu dostavljenog konteksta iz knowledge base-a.
Budi koncizan, profesionalan i koristi jezik kojim korisnik piše.
Ako nemaš dovoljno informacija, uputi korisnika na support@kompanija.com.
```

**Važno:** AI Response nod automatski koristi cijelu historiju razgovora i `{{kb_context}}` varijablu (ako je KB Search bio izvršen ranije u flow-u).

**Kada koristiti:** Na kraju flow-a ili petlje, nakon KB Search noda, za generisanje odgovora na korisnikova pitanja.

**Tipična veza:** KB Search → AI Response → End (ili nazad na Capture za loop)

---

## KB Search nod

**Kategorija:** AI / Integracije  
**Opis:** Pretražuje Knowledge Base agenta i vraća relevantne odlomke koji se koriste kao kontekst za AI odgovor.

**Polja:**
- `Label` — interno ime noda
- `Query` — šta se traži. Može biti varijabla (`{{user_question}}`) ili statički tekst
- `Top K` — broj rezultata koji se vraćaju (default: 5)
- `Output Variable` — gdje se sprema kontekst (default: `kb_context`)

**Kako radi:**
1. Uzima query (npr. korisnikovo pitanje)
2. Pretvara ga u vektor (embedding)
3. Traži najsličnije odlomke u Knowledge Base-u
4. Vraća top K rezultata spojenih kao tekst

**Primjer:**
```
Query: {{user_question}}
Top K: 5
Output Variable: kb_context
```

**Napomena:** Varijabla `{{last_message}}` uvijek sadrži posljednju poruku korisnika i može se koristiti kao query bez Capture noda.

**Kada koristiti:** Uvijek prije AI Response noda kada želiš da AI odgovara na osnovu tvoje baze znanja.

**Tipična veza:** Capture → KB Search → AI Response

---

## AI Classify nod

**Kategorija:** AI  
**Opis:** Klasificira korisnički unos u jednu od unaprijed definiranih kategorija. Koristi se za usmjeravanje flow-a.

**Polja:**
- `Input` — tekst koji se klasificira (npr. `{{user_question}}`)
- `Categories` — lista kategorija sa opisima
- `Output Variable` — gdje se sprema klasifikacija

**Primjer:**
```
Input: {{last_message}}
Kategorije:
  - "complaint" — korisnik se žali na problem
  - "inquiry" — korisnik traži informacije
  - "order" — korisnik želi naručiti
Output: intent
```

**Kada koristiti:** Za inteligentno usmjeravanje razgovora — npr. žalbe idi na jedan flow, narudžbe na drugi.

**Tipična veza:** AI Classify → Condition (provjera varijable) → različiti grani

---

## AI Extract nod

**Kategorija:** AI  
**Opis:** Izvlači strukturirane podatke iz slobodnog teksta. Korisno za parsiranje korisničkih unosa.

**Polja:**
- `Input` — tekst iz kojeg se ekstraktuju podaci
- `Schema` — JSON schema koja opisuje što treba izvući
- `Output Variable` — varijabla gdje se sprema ekstrahovani JSON

**Primjer:**
```
Input: {{last_message}}
Schema: { "ime": "string", "email": "string", "grad": "string" }
Output: user_data
```

**Kada koristiti:** Kada korisnik u slobodnom tekstu navede podatke koje trebaš strukturirano sačuvati.

---

## AI Summarize nod

**Kategorija:** AI  
**Opis:** Sažima dugi tekst u kratki pregled.

**Polja:**
- `Input` — tekst koji se sažima (može biti varijabla)
- `Max Length` — maksimalna dužina sažetka
- `Output Variable` — gdje se sprema sažetak

**Kada koristiti:** Kada imaš dugačak KB kontekst ili historiju razgovora koju trebaš sažeti za dalju obradu.
