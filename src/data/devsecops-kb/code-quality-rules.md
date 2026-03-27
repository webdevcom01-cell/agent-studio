# Code Quality Rules — 2026 Standards
## DevSecOps Knowledge Base — Code Quality Analyzer Reference

---

## TypeScript Strict Mode — Non-Negotiable Rules

### Rule 1: No `any` Type — Ever

```typescript
// ❌ VIOLATION — severity: HIGH
function processData(data: any) { ... }
const result: any = await fetch(url);

// ✅ CORRECT
function processData(data: unknown) {
  if (typeof data !== "object" || data === null) throw new Error("Invalid data");
  // Now narrow the type
}

// ✅ CORRECT — use generics instead of any
async function fetchData<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as T;
}
```

**Why it matters:** `any` disables TypeScript's type checking. It spreads through the codebase silently and hides real bugs that would be caught at compile time.

### Rule 2: All Exported Functions Must Have Return Types

```typescript
// ❌ VIOLATION — inferred return type, breaks API contracts
export async function getUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

// ✅ CORRECT — explicit return type
export async function getUser(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
```

### Rule 3: No Non-Null Assertions Without Guards

```typescript
// ❌ VIOLATION — can throw at runtime
const user = users.find(u => u.id === id)!;
const name = session!.user!.name!;

// ✅ CORRECT — explicit null check
const user = users.find(u => u.id === id);
if (!user) throw new Error(`User ${id} not found`);

// ✅ CORRECT — optional chaining
const name = session?.user?.name ?? "Anonymous";
```

### Rule 4: Strict Null Checks

All variables that can be null/undefined must be handled:
```typescript
// ❌ VIOLATION
function getLength(str: string | null): number {
  return str.length;  // potential NPE
}

// ✅ CORRECT
function getLength(str: string | null): number {
  return str?.length ?? 0;
}
```

---

## Cyclomatic Complexity

Functions with complexity > 10 are flagged. Complexity increases by 1 for each:
- `if`, `else if`, `else`
- `for`, `while`, `do-while`
- `case` in switch
- `catch`, `&&`, `||`, `??`
- Ternary operator `? :`

```typescript
// ❌ VIOLATION — complexity: 14
function processOrder(order: Order): string {
  if (!order) return "invalid";
  if (order.status === "pending") {
    if (order.paymentMethod === "card") {
      if (order.amount > 1000) {
        if (order.verified) {
          return "processing";
        } else {
          return "needs_verification";
        }
      } else {
        return "processing";
      }
    } else if (order.paymentMethod === "bank") {
      if (order.amount > 5000) {
        return "manual_review";
      }
      return "processing";
    }
  }
  return "unknown";
}

// ✅ CORRECT — extract to smaller functions
function getCardOrderStatus(order: Order): string {
  if (order.amount > 1000 && !order.verified) return "needs_verification";
  return "processing";
}

function processOrder(order: Order): string {
  if (!order) return "invalid";
  if (order.status !== "pending") return "unknown";
  if (order.paymentMethod === "card") return getCardOrderStatus(order);
  if (order.paymentMethod === "bank" && order.amount > 5000) return "manual_review";
  return "processing";
}
```

---

## Async/Await Rules

### Unhandled Promise Rejections

```typescript
// ❌ VIOLATION — fire-and-forget without error handling
fetch("https://api.example.com/notify");

// ✅ CORRECT — always handle or explicitly mark as fire-and-forget
fetch("https://api.example.com/notify").catch((err) => {
  logger.warn("Notification failed (non-critical)", { error: String(err) });
});
```

### Missing Await

```typescript
// ❌ VIOLATION — returns Promise<void>, not waiting
async function saveUser(user: User) {
  prisma.user.create({ data: user });  // missing await!
  return "saved";
}

// ✅ CORRECT
async function saveUser(user: User) {
  await prisma.user.create({ data: user });
  return "saved";
}
```

### Async in Loops

```typescript
// ❌ VIOLATION — sequential, slow (N+1 problem)
for (const userId of userIds) {
  const user = await getUser(userId);
  results.push(user);
}

// ✅ CORRECT — parallel execution
const results = await Promise.all(userIds.map(getUser));
```

---

## DRY (Don't Repeat Yourself)

### Duplicate Code Detection

Flag when > 10 lines appear 2+ times with minor variations:
```typescript
// ❌ VIOLATION — duplicated error handling
// In users.ts:
catch (error) {
  logger.error("Users API error", { error: String(error) });
  return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
}
// In products.ts: (identical)
catch (error) {
  logger.error("Products API error", { error: String(error) });
  return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
}

// ✅ CORRECT — extract shared handler
function handleApiError(context: string, error: unknown): Response {
  logger.error(`${context} error`, { error: String(error) });
  return Response.json({ success: false, error: "Internal server error" }, { status: 500 });
}
```

---

## Error Handling Rules

### Swallowed Exceptions

```typescript
// ❌ VIOLATION — empty catch block
try {
  await riskyOperation();
} catch (e) {}  // silent failure!

// ✅ CORRECT — always handle or re-throw
try {
  await riskyOperation();
} catch (error) {
  logger.error("riskyOperation failed", { error: String(error) });
  // Either re-throw, return error response, or explicitly document why ignored
  throw error;
}
```

### Overly Broad Catches

```typescript
// ❌ VIOLATION — catches ALL errors including programming errors
try {
  const data = JSON.parse(input);
  return processData(data);
} catch (e) {
  return null;  // hides parse errors AND logic errors
}

// ✅ CORRECT — specific error types
try {
  const data = JSON.parse(input);
  return processData(data);
} catch (error) {
  if (error instanceof SyntaxError) {
    logger.warn("Invalid JSON input", { input: input.slice(0, 100) });
    return null;
  }
  throw error;  // re-throw unexpected errors
}
```

---

## React / Next.js Specific Rules

### Missing Error Boundaries

Every route that fetches data should have an `error.tsx` file.

### Server vs Client Component Misuse

```typescript
// ❌ VIOLATION — using useState in a Server Component
// server-component.tsx (no "use client")
export default function Page() {
  const [count, setCount] = useState(0);  // ERROR: hooks not allowed in Server Components
}

// ❌ VIOLATION — making database calls in a Client Component
"use client";
export default function UserList() {
  const users = await prisma.user.findMany();  // ERROR: can't use prisma in browser
}
```

### Missing Loading States

```typescript
// ❌ VIOLATION — no loading state for async operations
export default function DataPage() {
  const { data } = useSWR("/api/data");
  return <div>{data.items.map(...)}</div>;  // crashes when data is undefined
}

// ✅ CORRECT
export default function DataPage() {
  const { data, isLoading, error } = useSWR("/api/data");
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  return <div>{data!.items.map(...)}</div>;
}
```

---

## Function Size Limits

| Limit | Action |
|-------|--------|
| Lines > 50 | Warning — consider splitting |
| Lines > 100 | Error — must split |
| Parameters > 4 | Warning — use options object |
| Nesting depth > 4 | Error — extract functions |
| File lines > 500 | Warning — consider splitting |

---

## Import Rules

```typescript
// ❌ VIOLATION — importing from @prisma/client directly
import { PrismaClient } from "@prisma/client";

// ✅ CORRECT — use generated path
import { PrismaClient } from "@/generated/prisma";

// ❌ VIOLATION — barrel imports causing bundle bloat
import * as _ from "lodash";
_.debounce(fn, 300);

// ✅ CORRECT — named imports
import { debounce } from "lodash";
```
