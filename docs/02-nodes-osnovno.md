# Node tipovi — Osnovno

## Message nod

**Kategorija:** Osnovno  
**Opis:** Šalje statičku tekstualnu poruku korisniku. Koristi se za pozdravne poruke, upute, potvrde i slično.

**Polja:**
- `Label` — interno ime noda (nije vidljivo korisniku)
- `Message` — tekst koji se šalje korisniku. Može sadržavati varijable u formatu `{{naziv_varijable}}`

**Primjer upotrebe:**
```
Zdravo! Ja sam vaš asistent. Mogu vam pomoći sa informacijama o 
našim proizvodima, dostavi i cijenama.
```

**Kada koristiti:** Na početku flow-a kao pozdrav, ili u sredini flow-a za informativne poruke između koraka.

**Tipična veza:** Message → Capture (da pitaš korisnika nešto) ili Message → End

---

## Button nod

**Kategorija:** Osnovno  
**Opis:** Prikazuje korisniku skup dugmadi za odabir. Korisnik klikne dugme i odabrana vrijednost se sprema kao varijabla.

**Polja:**
- `Label` — interno ime noda
- `Prompt` — tekst iznad dugmadi (npr. "Šta te zanima?")
- `Buttons` — lista dugmadi, svako sa tekstom i vrijednošću
- `Variable Name` — naziv varijable gdje se sprema odabir

**Primjer upotrebe:**
```
Prompt: "Odaberi temu:"
Dugmad:
  - "Proizvodi" → vrijednost: "proizvodi"
  - "Dostava" → vrijednost: "dostava"
  - "Cijene" → vrijednost: "cijene"
  - "Kontakt" → vrijednost: "kontakt"
Variable: user_choice
```

**Kada koristiti:** Kada želiš ograničiti opcije korisnika na unaprijed definirani skup izbora.

**Napomena:** Ako Button nod nije dostupan u tvojoj verziji, koristi Capture nod kao zamjenu.

---

## Capture nod

**Kategorija:** Osnovno  
**Opis:** Pauzira flow i čeka da korisnik unese tekst. Unos se sprema u varijablu.

**Polja:**
- `Label` — interno ime noda
- `Variable Name` — naziv varijable gdje se sprema unos (npr. `user_question`)
- `Prompt` — poruka koja se prikazuje korisniku (npr. "Šta te zanima?")

**Primjer upotrebe:**
```
Variable Name: user_question
Prompt: Šta te zanima?
```

**Kada koristiti:** 
- Za hvatanje slobodnog teksta od korisnika (pitanja, ime, email)
- Kao zamjena za Button nod kada nemaš unaprijed definirane opcije
- Za multi-step forme

**Varijabla se koristi:** U KB Search nodu kao query (`{{user_question}}`), ili u Message nodu za personalizaciju.

**Tipična veza:** Message → Capture → KB Search → AI Response
