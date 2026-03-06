# Node tipovi — Integracije

## API Call nod

**Kategorija:** Integracije  
**Opis:** Šalje HTTP zahtjev prema vanjskom API-u i sprema odgovor u varijablu.

**Polja:**
- `URL` — endpoint URL (može sadržavati varijable: `https://api.com/user/{{user_id}}`)
- `Method` — HTTP metoda: GET, POST, PUT, DELETE
- `Headers` — HTTP zaglavlja (npr. Authorization, Content-Type)
- `Body` — tijelo zahtjeva za POST/PUT (JSON format, može sadržavati varijable)
- `Output Variable` — varijabla gdje se sprema odgovor

**Primjer:**
```
URL: https://api.mojkompanija.com/orders/{{order_id}}
Method: GET
Headers: 
  Authorization: Bearer {{api_token}}
Output: order_data
```

**Kada koristiti:** Za dohvaćanje podataka iz vlastitog sistema (narudžbe, korisnici, inventar), slanje notifikacija, integraciju sa CRM-om.

---

## Webhook nod

**Kategorija:** Integracije  
**Opis:** Prima dolazne HTTP zahtjeve od vanjskih sistema i pokreće flow.

**Polja:**
- `Path` — URL putanja na kojoj webhook sluša
- `Secret` — opcionalni tajni ključ za verifikaciju zahtjeva
- `Output Variable` — varijabla gdje se sprema primljeni payload

**Primjer:**
```
Path: /webhook/nova-narudzba
Secret: moj_tajni_kljuc
Output: webhook_data
```

**Kada koristiti:** Kada vanjski sistem (e-commerce platforma, payment processor) treba pokrenuti agenta — npr. nova narudžba, plaćanje primljeno.

---

## Function nod

**Kategorija:** Integracije  
**Opis:** Izvršava JavaScript kod unutar flow-a. Najfleksibilniji nod za custom logiku.

**Polja:**
- `Code` — JavaScript kod koji se izvršava
- `Input Variables` — varijable iz contexta koje su dostupne u kodu
- `Output Variable` — naziv varijable gdje se sprema rezultat

**Primjer:**
```javascript
// Formatiranje datuma
const today = new Date();
const formatted = today.toLocaleDateString('bs-BA');
return { formatted_date: formatted };
```

**Primjer sa varijablama:**
```javascript
// Provjera da li je narudžba velika
const amount = parseFloat(variables.order_amount);
const isLarge = amount > 10000;
return { 
  is_large_order: isLarge,
  discount: isLarge ? '5%' : '0%'
};
```

**Kada koristiti:** Za kalkulacije, formatiranje podataka, custom validaciju, transformaciju API odgovora.

**Napomena:** Kod se izvršava u sandboxed okruženju. Nema pristupa vanjskim servisima direktno — za to koristi API Call nod.
