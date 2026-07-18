# Railway MCP — Analiza i plan implementacije (verifikovano)

**Datum:** 2026-06-22
**Cilj:** Custom MCP server za povezivanje na Railway, opseg **read + ograničeni write** (bez brisanja; destruktivne akcije iza eksplicitne potvrde).
**Stack:** TypeScript + zvanični `@modelcontextprotocol/sdk`, transport **stdio** (lokalni server).

> **Status verifikacije:** Sve otvorene tačke iz prve verzije (`[ZA POTVRDU]`) su zatvorene. Svi GraphQL upiti i polja niže prepisani su iz **zvanične Railway dokumentacije** (sirovi markdown sa `github.com/railwayapp/docs`, koji sadrži stvarne code-blokove). Nema nagađanih naziva polja. Jedino što i dalje radimo uživo prije prvog deploya je **smoke-test tokenom** (jer ja nemam tvoj token).

---

## 0. Kontekst: zvanični MCP već postoji

Railway već nudi zvanični MCP (lokalni preko CLI `railway mcp`, remote na `mcp.railway.com` preko OAuth-a, i Claude Code plugin). Tvoj originalni zadatak (servisi + `DATABASE_URL`) pokriva i zvanični lokalni MCP. Custom gradimo svjesno radi: **read-only Postgres inspektora bez passworda**, strogog skopiranja dozvola i custom upita. Ako u nekom trenutku zvanični pokrije sve — to je jeftinija alternativa.

---

## 1. Railway API — provjerene činjenice

### 1.1 Endpoint i auth ✅ POTVRĐENO
- **Endpoint:** `https://backboard.railway.com/graphql/v2` (HTTP POST, JSON body `{query, variables}`).
- **Auth header:** `Authorization: Bearer <token>` za **account** i **workspace** tokene. Samo **project** token koristi drugi header: `Project-Access-Token: <token>`.

> ⚠ **Ispravka prve verzije:** ranije je pisalo da „team" token koristi header `Team-Access-Token`. To **nije tačno** prema zvaničnoj stranici — token se zove **Workspace** (ne „team") i koristi `Authorization: Bearer`, isto kao account token. Header `Team-Access-Token` ne postoji u zvaničnoj dokumentaciji. Ispravljeno.

Potvrđeni cURL iz dokumentacije (account token):
```bash
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "query { me { name email } }"}'
```

### 1.1a Kreiranje tokena ✅ POTVRĐENO
Tri tipa tokena se prave u dashboard-u (plus OAuth za third-party aplikacije):

| Tip | Opseg | Header | Test upit |
|---|---|---|---|
| **Account** | svi tvoji resursi i workspace-ovi | `Authorization: Bearer` | `query { me { name email } }` |
| **Workspace** | jedan workspace (dijeljivo s timom) | `Authorization: Bearer` | `query { workspace(workspaceId:"…"){ name id } }` |
| **Project** | jedan environment u projektu | `Project-Access-Token` | `query { projectToken { projectId environmentId } }` |
| OAuth | dozvole koje korisnik odobri | `Authorization: Bearer` | — |

Koraci:
- **Account/Workspace token:** `railway.com/account/tokens` → forma „New token". Ako izabereš **„No workspace"** → to je **account token** (najširi opseg; ne dijeliti). Ako izabereš workspace iz dropdown-a → **workspace token** (vidi samo taj workspace; može se dijeliti s timom).
- **Project token:** iz **project settings → tokens** (scoped na jedan environment projekta).

Napomene iz dokumentacije:
- `me { … }` radi **samo** sa account tokenom (workspace/project token ga ne mogu koristiti — podaci su lični).
- `workspace(workspaceId)` radi i sa account tokenom ako si član tog workspace-a.
- Postoji i gotov Postman/Insomnia collection file + API podržava introspection (schema discovery).

### 1.2 Provjera tokena (whoami) ✅
```graphql
query { me { id name email } }
```
Za project token postoji i: `query { projectToken { projectId environmentId } }`.

### 1.3 Paginacija ✅
Relay-style, sa `pageInfo`:
```graphql
... (input, first: $first, after: $after) {
  edges { node { id ... } }
  pageInfo { hasNextPage endCursor }
}
```

### 1.4 Rate limit ✅
- **Req/sat:** Free **100**, Hobby **1000**, Pro **10000**, Enterprise custom.
- **Req/sek:** Hobby **10 RPS**, Pro **50 RPS**, Enterprise custom.
- Svaki odgovor nosi headere: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, a kad se iscrpi kvota i `Retry-After`. Klijent čita ove headere i radi backoff (poštuje `Retry-After`).

### 1.5 Schema discovery
GraphiQL: `railway.com/graphiql` (Docs panel: Ctrl/Cmd+Shift+D; autocomplete: Ctrl+Space).

---

## 2. Verifikovani GraphQL upiti (osnova za alate)

### 2.1 Lista projekata ✅
```graphql
query { projects { edges { node { id name description createdAt updatedAt } } } }
```
U workspace-u: `projects(workspaceId: $workspaceId) { ... }`.

### 2.2 Projekat sa servisima i environmentima ✅
```graphql
query project($id: String!) {
  project(id: $id) {
    id name description createdAt
    services { edges { node { id name icon } } }
    environments { edges { node { id name } } }
  }
}
```

### 2.3 Environmenti (detekcija production vs staging) ✅
```graphql
query environments($projectId: String!, $isEphemeral: Boolean) {
  environments(projectId: $projectId, isEphemeral: $isEphemeral) {
    edges { node { id name createdAt } }
  }
}
```
- `isEphemeral: false` izbacuje PR/preview environmente.
- Jedan environment + njegovi servisi i status:
```graphql
query environment($id: String!) {
  environment(id: $id) {
    id name createdAt
    serviceInstances {
      edges { node { id serviceName latestDeployment { id status } } }
    }
  }
}
```

### 2.4 Varijable — ovdje živi `DATABASE_URL` ✅ (KLJUČNO)
```graphql
query variables($projectId: String!, $environmentId: String!, $serviceId: String) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}
```
- Vraća **JSON mapu** `{ "DATABASE_URL": "postgres://...", "PGHOST": "...", ... }`.
- Izostavi `serviceId` → shared varijable environmenta.
- `unrendered: true` → vraća reference (`${{Postgres.DATABASE_URL}}`) umjesto razriješene vrijednosti.
- `variablesForServiceDeployment(projectId, environmentId, serviceId)` → sve razriješene varijable kao na deployu.

> Ovo potvrđuje da naš **Postgres inspektor** radi: pozove `variables` za Postgres servis u datom environmentu, pročita `DATABASE_URL`, parsira ga i **odbaci password** prije ispisa.

### 2.5 Servis / service instance ✅
```graphql
query service($id: String!) { service(id: $id) { id name icon createdAt projectId } }

query serviceInstance($serviceId: String!, $environmentId: String!) {
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    id serviceName startCommand region numReplicas
    latestDeployment { id status createdAt }
  }
}
```

### 2.6 Deploymenti i statusi ✅
```graphql
query deployments($input: DeploymentListInput!, $first: Int) {
  deployments(input: $input, first: $first) {
    edges { node { id status createdAt url staticUrl } }
  }
}
```
`DeploymentListInput`: `{ projectId, serviceId, environmentId, status: { successfulOnly: true } }`.
Statusi: `BUILDING, DEPLOYING, SUCCESS, FAILED, CRASHED, REMOVED, SLEEPING, SKIPPED, WAITING, QUEUED`.

### 2.7 Write mutacije (za ograničeni-write opseg) ✅
- **Set varijabli** (upsert više odjednom):
```graphql
mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
  variableCollectionUpsert(input: $input)
}
```
`input`: `{ projectId, environmentId, serviceId, variables: {KEY: "value"} }`; opciono `skipDeploys: true`, `replace: true` (⚠ `replace:true` briše sve varijable van novog seta — **mi ovo NE koristimo**).
- **Set jedne varijable:** `variableUpsert(input: VariableUpsertInput!)`.
- **Redeploy servisa** (najčistije, ne treba deployment ID):
```graphql
mutation serviceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
  serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
}
```
Alternativa po deployment ID-u: `deploymentRedeploy(id: String!)`, `deploymentRollback(id)`, `deploymentRestart(id)`.

### 2.8 Destruktivne mutacije — POSTOJE, ali ih NE uključujemo ✅
`projectDelete(id)`, `serviceDelete(id)`, `environmentDelete(id)`, `variableDelete(input)`, `deploymentRemove(id)`, `deploymentStop(id)`, `deploymentCancel(id)`, `projectTransfer`. Namjerno izvan opsega prve verzije.

---

## 3. Arhitektura

- **Jezik:** TypeScript (zvanični SDK je TS-first; tvoj `agent-studio` je već TS/Prisma).
- **Transport:** stdio (lokalni server; token ostaje na mašini, ne izlažemo HTTP servis).
- **Validacija:** Zod input scheme; `outputSchema` + `structuredContent` u odgovorima.
- **Token:** isključivo iz env `RAILWAY_TOKEN`; nikad u kodu, gitu, logu.

```
src/
  index.ts            # bootstrap MCP (stdio)
  railwayClient.ts    # GraphQL POST, auth header, retry/backoff(429), Relay paginacija
  gql.ts              # verifikovani upiti/mutacije (iz sekcije 2)
  tools/
    whoami.ts
    listProjects.ts
    getProject.ts
    listEnvironments.ts
    listServices.ts
    getVariables.ts
    inspectDatabases.ts   # workflow: Postgres DATABASE_URL -> host:port/db, BEZ passworda
    setVariables.ts       # ograničeni write (potvrda; nikad replace:true)
    redeployService.ts    # ograničeni write (potvrda)
  util/
    parseConnectionUrl.ts # parsira postgres:// i izbacuje password
    redact.ts             # centralno maskiranje tajni
  schemas.ts
```

---

## 4. Set alata (sa MCP annotation hints)

| Alat | GraphQL osnova | Hints |
|---|---|---|
| `railway_whoami` | `me` | readOnly |
| `railway_list_projects` | `projects` | readOnly |
| `railway_get_project` | `project(id)` | readOnly |
| `railway_list_environments` | `environments(projectId, isEphemeral)` | readOnly |
| `railway_list_services` | `project.services` / `environment.serviceInstances` | readOnly |
| `railway_get_variables` | `variables(projectId, environmentId, serviceId)` | readOnly |
| `railway_inspect_databases` | `variables` + parser | readOnly |
| `railway_set_variables` | `variableCollectionUpsert` | write, destructiveHint, potvrda |
| `railway_redeploy_service` | `serviceInstanceRedeploy` | write, destructiveHint, potvrda |

Imenovanje po dohvatanju ID-a: ime projekta → `projects`/`project` da nađemo ID; environment/servis isto preko lista (jer skoro sve mutacije/varijable traže `projectId`+`environmentId`+`serviceId`).

---

## 5. Mapiranje tvog originalnog zadatka (sada potpuno izvodljivo)

„Koliko Postgres baza u projektu `reliable-youth` + koja je produkcijska?"

1. `railway_list_projects` → nađi ID projekta po imenu `reliable-youth`.
2. `railway_list_environments(projectId, isEphemeral:false)` → vidiš ima li **staging** ili samo **production**.
3. `railway_get_project(id)` → lista servisa; Postgres servisi se prepoznaju po imenu/ikoni ili po prisustvu `DATABASE_URL`/`PG*` u varijablama.
4. Za svaki Postgres servis × environment: `railway_get_variables` → pročitaj `DATABASE_URL`.
5. `railway_inspect_databases` → `parseConnectionUrl` vrati **host:port/db** (password maskiran), označi production vs staging.
6. Rezultat: broj baza + produkcijska. **100% read-only.**

---

## 6. Bezbjednost
- Token samo iz env; nigdje u kodu/logu.
- **Nikad password** — `parseConnectionUrl` vraća komponente bez kredencijala; `redact()` na svaki izlaz; unit test koji pada ako se password ikad pojavi.
- Write alati: `destructiveHint: true` (klijent traži potvrdu); default je read.
- Nikad `replace: true` na varijablama; nema delete operacija.
- Poštuj 429 (exponential backoff).

---

## 7. Plan implementacije po fazama

### Faza 0 — Priprema (kratko)
- [ ] Kreirati token na `railway.com/account/tokens` → `export RAILWAY_TOKEN=...` (lokalno, van gita).
- [ ] Smoke-test: cURL `me { name email }` da potvrdi token i endpoint. **(Jedina preostala uživo provjera.)**

### Faza 1 — Skeleton + auth
- [ ] `npm init`; instalirati `@modelcontextprotocol/sdk`, `zod`; `tsconfig`.
- [ ] `railwayClient.ts` (POST, Bearer, 429 backoff, paginacija) + `railway_whoami`.

### Faza 2 — Read-only alati
- [ ] `list_projects`, `get_project`, `list_environments`, `list_services`, `get_variables`.
- [ ] `inspect_databases` + `parseConnectionUrl` + `redact`.

### Faza 3 — Ograničeni write
- [ ] `set_variables` (`variableCollectionUpsert`, bez `replace`), `redeploy_service` (`serviceInstanceRedeploy`), oba sa `destructiveHint`.

### Faza 4 — Test
- [ ] `npm run build`; MCP Inspector (`npx @modelcontextprotocol/inspector`) za svaki alat.
- [ ] Test na `reliable-youth` → odgovor na originalno pitanje.
- [ ] Unit test: parser nikad ne vraća password.

### Faza 5 — Povezivanje
- [ ] Dodati server u MCP konfiguraciju (stdio komanda + `RAILWAY_TOKEN`).

---

## 8. Šta mi treba od tebe da krenem
Samo jedna stvar je blokirajuća: **token i lokacija projekta.**
1. Imaš li već token sa `railway.com/account/tokens`? Ako ne — forma „New token": izaberi **„No workspace"** za account token (najjednostavnije za početak), ili workspace iz dropdown-a ako je projekat timski.
2. Je li `reliable-youth` u **ličnom nalogu** ili u **workspace-u**?
   - Lični nalog → **account token**, listanje preko `projects`.
   - Workspace → **account token** (ako si član) ili **workspace token**, listanje preko `projects(workspaceId: …)`.

Čim to potvrdiš (i odradimo cURL smoke-test: `me { name email }` za account, ili `workspace(workspaceId){name id}` za workspace), krećem direktno u Fazu 1 — sve ostalo je već verifikovano i spremno.

---

## Izvori (provjereno)
- Public API / GraphQL overview: https://docs.railway.com/integrations/api/graphql-overview
- API Cookbook: https://docs.railway.com/integrations/api/api-cookbook
- Manage projects: https://docs.railway.com/integrations/api/manage-projects
- Manage services: https://docs.railway.com/integrations/api/manage-services
- Manage environments: https://docs.railway.com/integrations/api/manage-environments
- Manage deployments: https://docs.railway.com/integrations/api/manage-deployments
- Manage variables: https://docs.railway.com/integrations/api/manage-variables
- Zvanični MCP: https://docs.railway.com/ai/mcp-server · https://docs.railway.com/ai/remote-mcp-server
- (Sirovi markdown sa istih stranica: github.com/railwayapp/docs)
