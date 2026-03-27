# OWASP Top 10 — 2025 Edition
## DevSecOps Knowledge Base — Security Scanner Reference

---

## A01: Broken Access Control (Severity: CRITICAL)

**Description:** Restrictions on what authenticated users are allowed to do are not properly enforced.

**Common Vulnerabilities:**
- IDOR (Insecure Direct Object Reference) — accessing `GET /api/users/42` without checking if 42 is the current user
- Missing authorization on API routes — `PUT /api/admin/users` accessible without admin role check
- CORS misconfiguration allowing requests from unauthorized origins
- Force browsing to authenticated pages without auth check
- Privilege escalation — a user performing admin actions

**Detection Patterns (TypeScript/Next.js):**
```typescript
// ❌ VULNERABLE — no auth check
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  return Response.json(user);
}

// ✅ SECURE — proper ownership check
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.id !== params.id) {
    return new Response("Forbidden", { status: 403 });
  }
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  return Response.json(user);
}
```

**CVSS Score Range:** 5.5 – 9.8
**CWE References:** CWE-284, CWE-285, CWE-639

---

## A02: Cryptographic Failures (Severity: HIGH-CRITICAL)

**Description:** Failures related to cryptography that lead to sensitive data exposure.

**Common Vulnerabilities:**
- Passwords stored in plaintext or with weak hashing (MD5, SHA1)
- Sensitive data transmitted over HTTP (not HTTPS)
- Weak random number generation for tokens
- Hardcoded encryption keys in source code
- JWT with `alg: none` or symmetric signing

**Detection Patterns:**
```typescript
// ❌ VULNERABLE — MD5 for password hashing
import crypto from "crypto";
const hash = crypto.createHash("md5").update(password).digest("hex");

// ✅ SECURE — bcrypt with cost factor 12+
import bcrypt from "bcrypt";
const hash = await bcrypt.hash(password, 12);

// ❌ VULNERABLE — weak random token
const token = Math.random().toString(36);

// ✅ SECURE — cryptographically secure token
const token = globalThis.crypto.getRandomValues(new Uint8Array(32));
```

**CVSS Score Range:** 7.5 – 9.1
**CWE References:** CWE-311, CWE-326, CWE-330

---

## A03: Injection (Severity: CRITICAL)

**Description:** User-supplied data is sent to an interpreter as part of a command or query.

**SQL Injection:**
```typescript
// ❌ VULNERABLE — string interpolation
const users = await db.query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ SECURE — parameterized (Prisma)
const user = await prisma.user.findUnique({ where: { email } });
```

**Command Injection:**
```typescript
// ❌ VULNERABLE
import { exec } from "child_process";
exec(`git clone ${repoUrl}`);  // repoUrl = "x; rm -rf /"

// ✅ SECURE — use array args, never shell: true
import { spawn } from "child_process";
spawn("git", ["clone", repoUrl], { shell: false });
```

**NoSQL Injection (MongoDB):**
```typescript
// ❌ VULNERABLE
await db.users.find({ username: req.body.username });
// If username = { "$gt": "" } → returns ALL users

// ✅ SECURE — validate and sanitize
import { z } from "zod";
const { username } = z.object({ username: z.string().max(50) }).parse(req.body);
```

**SSTI (Server-Side Template Injection):**
```typescript
// ❌ VULNERABLE — using eval with user input
const template = `Hello ${eval(userInput)}`;

// ✅ SECURE — use safe template literals or sandboxed evaluation
```

**CVSS Score Range:** 8.8 – 10.0
**CWE References:** CWE-89 (SQL), CWE-78 (OS), CWE-943 (NoSQL)

---

## A04: Insecure Design (Severity: HIGH)

**Description:** Missing or ineffective control design, not just implementation bugs.

**Patterns to detect:**
- No rate limiting on authentication endpoints
- No account lockout after failed login attempts
- Password reset tokens that don't expire
- Predictable resource identifiers (sequential IDs instead of UUIDs)

**Detection:**
```typescript
// ❌ VULNERABLE — sequential IDs expose enumeration
GET /api/invoices/1001
GET /api/invoices/1002  // attacker can iterate

// ✅ SECURE — CUID/UUID for all public identifiers
const id = cuid();  // e.g. "clpx7k2d30001abc..."

// ❌ VULNERABLE — no rate limiting
export async function POST(req: Request) {
  // No limit — brute force possible
  const { email, password } = await req.json();
  const user = await signIn(email, password);
}
```

**CVSS Score Range:** 5.0 – 8.8

---

## A05: Security Misconfiguration (Severity: MEDIUM-HIGH)

**Description:** Insecure default configurations, incomplete setups, open cloud storage.

**Common Issues:**
- Missing security headers (Content-Security-Policy, X-Frame-Options)
- Default credentials not changed
- Verbose error messages exposing stack traces in production
- Debug mode enabled in production
- CORS allowing `*` origin on sensitive endpoints

**Detection:**
```typescript
// ❌ VULNERABLE — exposing internal errors
catch (error) {
  return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
}

// ✅ SECURE — generic error in production
catch (error) {
  logger.error("Internal error", { error });
  const message = process.env.NODE_ENV === "development" ? error.message : "Internal server error";
  return Response.json({ error: message }, { status: 500 });
}

// ❌ VULNERABLE — CORS wildcard on auth endpoint
headers.set("Access-Control-Allow-Origin", "*");

// ✅ SECURE — specific allowed origins
const allowedOrigins = ["https://app.yourdomain.com"];
if (allowedOrigins.includes(origin)) {
  headers.set("Access-Control-Allow-Origin", origin);
}
```

**CVSS Score Range:** 4.3 – 7.5

---

## A06: Vulnerable and Outdated Components (Severity: HIGH)

**Description:** Using components with known vulnerabilities.

**Detection Rules:**
- Check `package.json` dependencies against known CVE databases
- Flag packages with `*` version constraints
- Flag packages abandoned >2 years
- Flag packages with known critical CVEs

**High-Risk Package Patterns:**
```json
// ❌ — wildcard versions bypass security updates
"dependencies": {
  "express": "*",
  "lodash": "^3.0.0"  // lodash < 4.17.21 has prototype pollution CVE
}

// ✅ — pinned + audited versions
"dependencies": {
  "express": "^4.21.0",
  "lodash": "^4.17.21"
}
```

**CVSS Score Range:** 5.5 – 9.8

---

## A07: Identification and Authentication Failures (Severity: HIGH)

**Description:** Flaws in authentication that allow attackers to compromise passwords, keys, or session tokens.

**Common Patterns:**
```typescript
// ❌ VULNERABLE — JWT without expiration
const token = jwt.sign({ userId }, secret);  // no expiresIn

// ✅ SECURE — short-lived tokens
const token = jwt.sign({ userId }, secret, { expiresIn: "15m" });

// ❌ VULNERABLE — session token in URL
redirect(`/dashboard?session=${sessionToken}`);  // logged in server logs

// ✅ SECURE — session in httpOnly cookie
response.cookies.set("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 900,  // 15 min
});

// ❌ VULNERABLE — weak session secret
const secret = "secret";

// ✅ SECURE — strong random secret
const secret = process.env.AUTH_SECRET;  // 32+ random bytes
```

**CVSS Score Range:** 7.5 – 9.8

---

## A08: Software and Data Integrity Failures (Severity: HIGH)

**Description:** Code and infrastructure failures related to software updates, CI/CD, and deserialization without integrity verification.

**Detection Patterns:**
- `eval()` used on external data
- `JSON.parse()` without schema validation on external input
- Dynamic `require()` based on user input
- npm scripts that download and execute scripts at install time

```typescript
// ❌ VULNERABLE — deserialization without validation
const userData = JSON.parse(req.body);
createUser(userData);  // userData could have injected fields

// ✅ SECURE — Zod schema validation before use
const userData = UserSchema.parse(JSON.parse(req.body));
createUser(userData);
```

**CVSS Score Range:** 5.9 – 9.0

---

## A09: Security Logging and Monitoring Failures (Severity: MEDIUM)

**Description:** Insufficient logging to detect, escalate, and respond to active breaches.

**Must-Log Events:**
- All authentication attempts (success + failure)
- Access control failures (403 responses)
- Input validation failures on security boundaries
- All admin/privileged actions
- Session invalidation events

**Must NOT Log:**
- Passwords or password hashes
- API keys or secrets
- Full credit card numbers
- Session tokens
- PII beyond minimum necessary

```typescript
// ❌ VULNERABLE — logging sensitive data
logger.info("Login attempt", { email, password, ip });

// ✅ SECURE — log event without sensitive data
logger.info("Login attempt", { email, ip, timestamp: new Date().toISOString() });
```

---

## A10: Server-Side Request Forgery — SSRF (Severity: HIGH-CRITICAL)

**Description:** Attacker causes server to make requests to an unintended location, potentially accessing internal services.

**Attack Scenarios:**
- `GET /api/fetch?url=http://169.254.169.254/latest/meta-data/` (AWS metadata)
- `GET /api/fetch?url=http://localhost:5432/` (internal database)
- `GET /api/fetch?url=file:///etc/passwd`

**Detection Pattern:**
```typescript
// ❌ VULNERABLE — unvalidated URL fetch
const response = await fetch(req.query.url);

// ✅ SECURE — validate URL against allowlist + block private IPs
import { validateExternalUrlWithDNS } from "@/lib/utils/url-validation";

const { valid, error } = await validateExternalUrlWithDNS(url);
if (!valid) return Response.json({ error }, { status: 400 });
const response = await fetch(url);
```

**Blocked ranges:**
- 169.254.0.0/16 (link-local / AWS metadata)
- 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918 private)
- 127.0.0.0/8 (localhost)
- ::1 (IPv6 localhost)

**CVSS Score Range:** 7.5 – 9.8
**CWE References:** CWE-918
