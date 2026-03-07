# Referenca svih nodova — kompletna polja

Ovaj dokument opisuje svaki nod u Agent Studio sa svim poljima koja se mogu podesiti u Properties panelu. Properties panel se otvara klikom na nod u Builder-u.

Svaki nod ima zajedničko polje Label koje služi kao naziv noda u flow-u.

## Message nod

Message nod prikazuje tekstualnu poruku korisniku. Koristi se za pozdrave, obavijesti i informacije.

Polja: Label i Message. U polje Message upiši tekst koji će korisnik vidjeti. Možeš koristiti varijable u tekstu sa dvostrukim vitičastim zagradama, npr. Zdravo {{user_name}}, kako ti mogu pomoći?

## Capture nod

Capture nod čeka da korisnik upiše odgovor i sprema ga u varijablu. Koristi se za prikupljanje pitanja, imena, emaila ili bilo kojeg korisničkog unosa.

Polja: Label, Variable Name i Prompt. U polje Variable Name upiši ime varijable u koju će se spremiti korisnikov odgovor (npr. user_question, user_name, user_email). U polje Prompt upiši tekst koji će korisnik vidjeti kao pitanje (npr. Šta te zanima? ili Unesite vaš email). Prompt polje je opcionalno — ako ga ostaviš praznim, nod će čekati unos bez prikazivanja poruke.

Capture nod je obavezan prije KB Search noda jer prikuplja korisnikovo pitanje u varijablu koju KB Search koristi za pretragu.

## KB Search nod

KB Search nod pretražuje Knowledge Base i vraća relevantne rezultate. Koristi se za RAG (Retrieval-Augmented Generation) — pronalaženje informacija iz baze znanja prije generisanja AI odgovora.

Polja: Label, Query Variable i Top K Results. U polje Query Variable upiši samo ime varijable bez vitičastih zagrada (npr. user_question, a NE {{user_question}}). Top K Results je broj rezultata koje želiš dobiti iz baze znanja (default je 5).

Rezultati pretrage se AUTOMATSKI spremaju u varijablu kb_context. Ne postoji polje Output Variable jer je izlaz uvijek kb_context. KB Search nod se uvijek povezuje linijom sa AI Response nodom koji automatski koristi kb_context za generisanje odgovora.

## AI Response nod

AI Response nod koristi AI model da generiše odgovor na osnovu konteksta i system prompta. Ako je prije njega bio KB Search nod, automatski koristi kb_context varijablu — ne treba ništa ručno dodavati.

Polja: Label, System Prompt, Model, Max Tokens i Output Variable. System Prompt je instrukcija za AI model koja definiše ponašanje i ton odgovora. Model je AI model koji se koristi (npr. deepseek-chat, claude-haiku-4-5-20251001). Max Tokens je maksimalan broj tokena u odgovoru (default 500). Output Variable je opcionalno polje — ako uneseš ime varijable, AI odgovor će se spremiti u tu varijablu za kasniju upotrebu u flow-u.

## Condition nod

Condition nod provjerava uslov i usmjerava flow na osnovu rezultata. Ima dva izlaza: true i false granu.

Polja: Label. Uslovi se podešavaju kroz edges (veze) između nodova u Builder-u, a ne kroz Properties panel.

## Set Variable nod

Set Variable nod postavlja vrijednost varijable bez korisničke interakcije. Koristi se za inicijalizaciju varijabli, računanje ili transformaciju podataka.

Polja: Label, Variable Name i Value. Variable Name je ime varijable koju postavljaš (npr. user_score). Value je vrijednost — može biti statički tekst, broj ili referenca na drugu varijablu sa dvostrukim vitičastim zagradama (npr. {{last_message}}).

## End nod

End nod završava flow i opcionalno prikazuje završnu poruku korisniku.

Polja: Label i End Message. End Message je opcionalan tekst koji se prikaže korisniku kad flow završi (npr. Hvala na razgovoru!). Ako ostaviš prazno, flow će se završiti bez poruke.

## Goto nod

Goto nod preusmjerava flow na drugi nod, omogućavajući petlje i skokove. Koristi se za vraćanje na Capture nod nakon odgovora (petlja) ili preskakanje dijelova flow-a.

Polja: Label i Target Node. Target Node je dropdown lista svih nodova u flow-u — odaberi nod na koji želiš preusmjeriti flow.

## Wait nod

Wait nod pauzira flow na određeno vrijeme. Koristi se za simulaciju razmišljanja ili pauze između poruka.

Polja: Label i Duration (seconds). Duration je broj sekundi koliko flow čeka (minimum 1, maksimum 5 sekundi).

## Button nod

Button nod prikazuje poruku sa dugmadima koje korisnik može kliknuti. Koristi se za menije, odabir kategorija ili potvrde.

Polja: Label, Message, Variable Name i Buttons. Message je tekst koji se prikazuje iznad dugmadi (npr. Odaberi opciju:). Variable Name je ime varijable u koju se sprema odabir korisnika (npr. user_choice). Buttons se dodaju klikom na Add dugme — svako dugme ima Label (tekst na dugmetu) i Value (vrijednost koja se sprema u varijablu).

## API Call nod

API Call nod šalje HTTP zahtjev na eksterni API. Koristi se za integraciju sa CRM-ovima, bazama podataka i vanjskim servisima.

Polja: Label, Method, URL, Body i Output Variable. Method je HTTP metoda (GET, POST, PUT, PATCH, DELETE). URL je adresa API endpointa. Body je JSON tijelo zahtjeva — možeš koristiti varijable (npr. {"name": "{{user_name}}"}). Output Variable je ime varijable u koju se sprema API odgovor.

## Webhook nod

Webhook nod šalje HTTP zahtjev kao obavijest vanjskom servisu. Ima ista polja kao API Call nod: Label, Method, URL, Body i Output Variable.

## Function nod

Function nod izvršava JavaScript kod unutar flow-a. Koristi se za custom logiku, računanje i transformaciju podataka.

Polja: Label, Code i Output Variable. U polje Code piši JavaScript kod koji ima pristup flow varijablama preko objekta variables (npr. return variables.x + variables.y;). Output Variable je ime varijable u koju se sprema rezultat funkcije.

## AI Classify nod

AI Classify nod koristi AI model da klasificira korisnikov unos u jednu od predefinisanih kategorija. Koristi se za routing — usmjeravanje flow-a na osnovu namjere korisnika.

Polja: Label, Input Variable, Categories i Model. Input Variable je ime varijable čiji sadržaj AI klasificira (npr. user_question). Categories se dodaju jedna po jedna — upiši naziv kategorije i klikni Add ili pritisni Enter (npr. complaint, inquiry, order). Model je AI model koji vrši klasifikaciju (default je deepseek-chat). Rezultat klasifikacije (ime kategorije) se sprema u varijablu sa imenom noda.

## AI Extract nod

AI Extract nod koristi AI model da izvuče strukturirane podatke iz teksta. Koristi se za ekstrakciju imena, emailova, brojeva i drugih informacija iz korisnikovog unosa.

Polja: Label, Fields to Extract i Model. Fields to Extract se dodaju klikom na Add dugme — svako polje ima Name (ime polja, npr. email), Type (tip podatka: string, number ili boolean) i Description (opis šta treba izvući). Model je AI model koji vrši ekstrakciju (default je deepseek-chat).

## AI Summarize nod

AI Summarize nod koristi AI model da sažme tekst. Koristi se za kreiranje kratkih sažetaka razgovora ili dugih tekstova.

Polja: Label, Output Variable, Max Length (chars) i Model. Output Variable je ime varijable u koju se sprema sažetak (default je summary). Max Length je maksimalan broj karaktera u sažetku (default 200). Model je AI model koji pravi sažetak (default je deepseek-chat).
