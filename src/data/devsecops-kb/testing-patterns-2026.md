# Testing Patterns — 2026 Standards
## DevSecOps Knowledge Base — Test Intelligence Reference

---

## Coverage Requirements

| Code Type | Minimum Coverage | Recommended |
|-----------|-----------------|-------------|
| Business logic (lib/) | 80% | 90%+ |
| API route handlers | 70% | 85%+ |
| Utility functions | 90% | 100% |
| React components | 60% | 75%+ |
| Database models | 70% | 80%+ |

**Coverage delta rule:** Every PR must not decrease overall coverage by more than 2%.

---

## Vitest Test Structure (2026)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";

// ── Unit Test Template ─────────────────────────────────────────────────────

describe("ModuleName", () => {
  // Setup
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("functionName", () => {
    it("should return expected value for valid input", () => {
      // Arrange
      const input = "valid-input";
      const expected = { success: true, data: "result" };

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it("should throw ValidationError for empty input", () => {
      expect(() => functionName("")).toThrow("Input cannot be empty");
    });

    it("should handle null input gracefully", () => {
      expect(() => functionName(null as unknown as string)).toThrow();
    });
  });
});
```

---

## API Route Testing

```typescript
import { createRequest, createResponse } from "node-mocks-http";
import { GET, POST } from "./route";

describe("POST /api/agents", () => {
  it("should create an agent and return 201", async () => {
    // Arrange
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Agent", description: "Test" }),
    });

    // Act
    const response = await POST(req);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe("Test Agent");
  });

  it("should return 401 when not authenticated", async () => {
    // Mock auth to return null
    vi.mocked(auth).mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid input", async () => {
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      body: JSON.stringify({ name: "" }),  // empty name should fail validation
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
```

---

## Mocking Patterns

### Mocking Prisma

```typescript
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

// In your test:
vi.mocked(prisma.user.findUnique).mockResolvedValue({
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
} as User);
```

### Mocking NextAuth

```typescript
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-123", email: "test@example.com" },
  }),
}));
```

### Mocking fetch

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ data: "mocked" }),
} as Response);
```

---

## Test Categories That Must Exist for New Code

### For Every New API Route:

```typescript
// Checklist:
// ✅ Happy path (200/201)
// ✅ Not authenticated (401)
// ✅ Not authorized (403)
// ✅ Not found (404)
// ✅ Invalid input (400)
// ✅ Internal error handling (500)
```

### For Every New Utility Function:

```typescript
// Checklist:
// ✅ Normal input
// ✅ Empty input / empty array
// ✅ Null/undefined input
// ✅ Maximum valid input (boundary)
// ✅ Minimum valid input (boundary)
// ✅ Invalid type (if accepting unknown)
```

### For Every New React Component:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

describe("MyComponent", () => {
  it("should render correctly with default props", () => {
    render(<MyComponent />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("should call onSubmit when form is submitted", async () => {
    const onSubmit = vi.fn();
    render(<MyComponent onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  it("should show error state when data fails to load", async () => {
    vi.mocked(fetchData).mockRejectedValueOnce(new Error("Network error"));
    render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

---

## Anti-Patterns to Flag

### Test Duplication Without Value

```typescript
// ❌ NOT USEFUL — tests implementation details
it("should call prisma.user.findUnique once", () => {
  expect(prisma.user.findUnique).toHaveBeenCalledOnce();
});

// ✅ USEFUL — tests behavior
it("should return the user when found", async () => {
  const result = await getUser("user-123");
  expect(result).toMatchObject({ id: "user-123" });
});
```

### Snapshot Testing Overuse

```typescript
// ❌ FRAGILE — breaks on any UI change
it("should render correctly", () => {
  const { container } = render(<ComplexComponent />);
  expect(container).toMatchSnapshot();  // tests structure, not behavior
});

// ✅ BETTER — test specific behaviors
it("should show the user name", () => {
  render(<UserProfile name="Alice" />);
  expect(screen.getByText("Alice")).toBeInTheDocument();
});
```

### Test Interdependence

```typescript
// ❌ VIOLATION — tests share state
let user: User;

beforeAll(async () => {
  user = await createUser();  // shared state between tests!
});

it("test A modifies user", () => { ... });
it("test B depends on unmodified user", () => { ... });  // FLAKY

// ✅ CORRECT — isolated setup
beforeEach(async () => {
  user = await createUser();  // fresh state per test
});
```

---

## Security Testing Patterns

Every auth-related function should have these tests:

```typescript
describe("requireAuth middleware", () => {
  it("should call next() for authenticated request", async () => { ... });
  it("should return 401 for missing session", async () => { ... });
  it("should return 401 for expired session", async () => { ... });
  it("should return 403 for insufficient permissions", async () => { ... });
  it("should return 403 when userId in session != resource owner", async () => { ... });
});

describe("input validation", () => {
  it("should reject SQL injection attempts", async () => {
    const response = await POST(new Request("/api/search", {
      body: JSON.stringify({ query: "'; DROP TABLE users; --" }),
    }));
    // Should not throw, should sanitize or reject gracefully
    expect(response.status).not.toBe(500);
  });

  it("should reject excessively large payloads", async () => {
    const largeInput = "x".repeat(10_000_000);  // 10MB
    const response = await POST(new Request("/api/data", {
      body: JSON.stringify({ data: largeInput }),
    }));
    expect(response.status).toBe(413);  // Payload Too Large
  });
});
```
