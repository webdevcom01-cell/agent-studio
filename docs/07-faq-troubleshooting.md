# FAQ i Rješavanje problema

## Česta pitanja (FAQ)

### Kako dodati Knowledge Base?

1. Na dashboardu klikni **"Edit Flow"** na kartici agenta
2. U Builder-u klikni **"Knowledge Base"** dugme (gore desno, pored "Test Chat")
3. Klikni **"Add Source"** i unesi URL web stranice
4. Sačekaj da se scraping završi (status postane **READY**)
5. Sada KB Search nod može koristiti ovu bazu

**Savjet:** Dodaj više URL-ova za bolje pokriće. Npr. za kompaniju dodaj: početna stranica, /about, /products, /contact, /faq.

---

### Zašto bot ne odgovara tačno?

Najčešći razlozi:
1. **KB nema relevantne informacije** — dodaj više URL-ova ili provjeri da li su stranice uspješno ingestirane
2. **KB Search Query Variable nije dobra** — u polju `Query Variable` unesi `user_question` ako imaš Capture nod, ili `last_message` za direktno preuzimanje poruke
3. **System Prompt nije jasan** — precizno opiši što agent treba raditi
4. **Model nije prikladan** — za složenije upite koristi gpt-4o ili claude-3-5-sonnet

---

### Kako da bot govori određenim jezikom?

U System Promptu napiši:
```
Uvijek odgovaraj na bosanskom/srpskom/hrvatskom jeziku, bez obzira na jezik korisnika.
```
Ili za automatsku detekciju:
```
Odgovaraj na jeziku kojim korisnik piše.
```

---

### Mogu li koristiti varijable u Message nodu?

Da! Sintaksa je `{{naziv_varijable}}`. Primjer:
```
Hvala {{user_name}}! Vaša narudžba {{order_id}} je potvrđena.
```
Varijabla mora biti prethodno postavljena kroz Capture, Set Variable ili API Call nod.

---

### Koliko URL-ova mogu dodati u Knowledge Base?

Nema tehničkog ograničenja, ali za optimalne performanse preporučujemo do 20-30 URL-ova po agentu. Za veće baze znanja razmisli o podijeli agenta po temama.

---

### Kako testirati flow bez da objavljujem agenta?

Koristi "Test Chat" dugme u gornjem desnom uglu Builder-a. Svaki Test Chat klik otvara novi razgovor, tako da možeš testirati čiste scenarije.

---

### Zašto flow stane i ne nastavlja?

Mogući razlozi:
1. **Capture nod čeka unos** — flow čeka korisnikovu poruku, to je normalno ponašanje
2. **Nema veze između nodova** — provjeri da su svi nodovi spojeni
3. **AI Response greška** — provjeri da li je API ključ validan i model dostupan
4. **Beskonačna petlja** — engine zaustavlja flow nakon 50 iteracija ili 5 posjeta istom nodu

---

## Rješavanje problema

### Problem: Bot samo ponavlja Capture prompt, ne generiše odgovor

**Uzrok:** Flow ne izvršava KB Search i AI Response nakon Capture unosa.

**Rješenje:**
1. Provjeri da su nodovi pravilno spojeni: Capture → KB Search → AI Response
2. Provjeri da `Query Variable` polje u KB Search nodu sadrži `user_question` ili `last_message` (bez vitičastih zagrada)
3. Otvori novi Test Chat (stari može imati pogrešno stanje)

---

### Problem: KB Search ne vraća rezultate

**Uzrok:** Knowledge Base nije ingestirana ili query varijabla je prazna.

**Rješenje:**
1. Idi na Knowledge Base tab i provjeri status izvora (treba biti zeleno)
2. Provjeri da `Query Variable` polje u KB Search nodu nije prazno (unesi `last_message` ili naziv varijable iz Capture noda)
3. Probaj sa `last_message` kao Query Variable — ovo uvijek ima vrijednost

---

### Problem: AI Response vraća grešku ili prazan odgovor

**Uzrok:** Problem sa API ključem ili modelom.

**Rješenje:**
1. Provjeri .env.local da li su API ključevi ispravni
2. Promijeni model na `gpt-4o-mini` ili `deepseek-chat` i probaj ponovo
3. Provjeri Max Tokens — povećaj na 1000 ako su odgovori odsječeni

---

### Problem: "This flow is empty" poruka

**Uzrok:** Agent nema kreiran flow ili flow nema nodova.

**Rješenje:**
1. Idi u Builder tab agenta
2. Dodaj barem Message nod i klikni Save
3. Ako postoje nodovi ali dobijаš ovu grešku, provjeri da li je flow sačuvan (Save dugme)

---

### Problem: Varijabla je prazna u poruci (prikazuje `{{user_name}}` kao tekst)

**Uzrok:** Varijabla nije postavljena u flow-u prije korištenja.

**Rješenje:**
1. Provjeri da Capture nod sa `Variable Name: user_name` dolazi PRIJE Message noda koji koristi tu varijablu
2. Provjeri naziv varijable — mora biti identičan (case-sensitive)
3. Koristi Set Variable nod za testiranje: postavi `user_name` na "Test Korisnik"
