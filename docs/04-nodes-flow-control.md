# Node tipovi — Flow Control

## Condition nod

**Kategorija:** Flow Control  
**Opis:** Grananje flow-a na osnovu uvjeta. Provjerava vrijednost varijable i usmjerava flow na različite grane.

**Polja:**
- `Label` — interno ime noda
- `Variable` — varijabla koja se provjerava (npr. `{{user_choice}}`)
- `Conditions` — lista uvjeta sa odgovarajućim granama
  - Operator: `equals`, `contains`, `greater_than`, `less_than`, `is_empty`
  - Vrijednost: tekst ili broj za usporedbu
- `Default` — grana koja se izvršava ako nijedan uvjet nije zadovoljen

**Primjer:**
```
Varijabla: {{intent}}
Uvjeti:
  - ako equals "complaint" → idi na Complaint Handler
  - ako equals "order" → idi na Order Handler
Default → idi na General Info
```

**Kada koristiti:** Kada flow treba ići u različitim smjerovima ovisno o korisnikovom odabiru ili AI klasifikaciji.

---

## Set Variable nod

**Kategorija:** Flow Control  
**Opis:** Postavlja ili mijenja vrijednost varijable bez čekanja na korisnički unos.

**Polja:**
- `Variable Name` — naziv varijable
- `Value` — vrijednost (statički tekst ili izraz sa drugim varijablama)

**Primjer:**
```
Variable: greeting_shown
Value: true
```

**Kada koristiti:** Za postavljanje flag-ova, računanje vrijednosti, inicijalizaciju varijabli.

---

## End nod

**Kategorija:** Flow Control  
**Opis:** Završava razgovor. Flow se ne može nastaviti nakon End noda.

**Polja:**
- `Label` — interno ime noda
- `Message` — opcionalna završna poruka korisniku

**Primjer završne poruke:**
```
Hvala što ste koristili našu podršku! Ako imate još pitanja, slobodno 
se javite. Lijepo!
```

**Kada koristiti:** Na kraju flow-a ili kao završna tačka jedne grane. Nije obavezno — flow može završiti i bez End noda, ali je dobra praksa ga dodati.

---

## Goto nod

**Kategorija:** Flow Control  
**Opis:** Preusmjerava flow na drugi nod bez direktne veze. Korisno za kreiranje petlji.

**Polja:**
- `Target Node` — ID noda na koji treba ići

**Primjer upotrebe:**
```
AI Response → Goto → Capture (petlja: bot odgovori, pa opet pita)
```

**Kada koristiti:** Za kreiranje petlji u flow-u bez crtanja veza unatrag koje bi zbunjivale vizualni prikaz.

**Napomena:** Goto može uzrokovati beskonačne petlje ako nije pravilno konfigurisan. Engine ima zaštitu — ako nod posjeti isti nod više od 5 puta, flow će se prekinuti.

---

## Wait nod

**Kategorija:** Flow Control  
**Opis:** Pauzira izvršavanje flow-a na određeno vrijeme.

**Polja:**
- `Duration` — trajanje čekanja u sekundama
- `Message` — opcionalna poruka koja se prikazuje tokom čekanja

**Primjer:**
```
Duration: 2
Message: "Tražim informacije za vas..."
```

**Kada koristiti:** Za simulaciju "tipkanja" efekta, ili kada trebaš sačekati rezultat asinhrone operacije.
