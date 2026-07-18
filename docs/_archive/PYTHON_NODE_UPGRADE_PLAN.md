# Python Code Node — Full Upgrade Plan

## Status: FINALIZED — Ready for Implementation

**Date:** 2026-03-27
**Scope:** pip packages + matplotlib visualization + metadata pipeline fix
**Estimated effort:** 12 files, ~400 LOC net, 2–3 sessions

---

## Problem Statement

The Python Code node has a **broken metadata pipeline**: matplotlib plots are generated
correctly in the executor but **lost at 4 points** before reaching the user.
Additionally, there is no way to install pip packages at runtime.

### Current Flow (Broken)

```
Handler ──→ StreamChunk ──→ NDJSON wire ──→ Client hook ──→ Chat UI ──→ DB
   ✅           ❌              ❌              ❌            ❌        ❌
 metadata    no field       not written     not parsed    not rendered  not saved
```

### Target Flow

```
Handler ──→ StreamChunk ──→ NDJSON wire ──→ Client hook ──→ Chat UI ──→ DB
   ✅           ✅              ✅              ✅            ✅        ✅
 metadata    +metadata      written        parsed       rendered     persisted
```

---

## Phase 1 — Fix Metadata Pipeline (CRITICAL, blocks everything)

**Goal:** Make metadata flow end-to-end from handler → stream → client → DB.
This fixes plots AND buttons (button_handler also has metadata).

### 1.1 Extend StreamChunk type

**File:** `src/lib/runtime/types.ts`

```typescript
// BEFORE:
| { type: "message"; role: "assistant" | "system"; content: string }

// AFTER:
| { type: "message"; role: "assistant" | "system"; content: string; metadata?: Record<string, unknown> }
```

### 1.2 Extend stream-protocol encode/decode

**File:** `src/lib/runtime/stream-protocol.ts`

- `encodeChunk()` — include `metadata` in JSON when present
- `parseChunk()` — extract `metadata` from parsed JSON

### 1.3 Pass metadata through streaming engine

**File:** `src/lib/runtime/engine-streaming.ts` (line ~320)

```typescript
// BEFORE:
writer.write({ type: "message", role: msg.role, content: msg.content });

// AFTER:
writer.write({
  type: "message",
  role: msg.role,
  content: msg.content,
  ...(msg.metadata ? { metadata: msg.metadata } : {}),
});
```

### 1.4 Extend ChatMessage type + parse metadata in hook

**File:** `src/components/chat/use-streaming-chat.ts`

```typescript
// Extend interface:
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;  // NEW
}

// In message handler:
case "message":
  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: chunk.content,
      ...(chunk.metadata ? { metadata: chunk.metadata } : {}),
    },
  ]);
```

### 1.5 Add metadata column to Message model

**File:** `prisma/schema.prisma`

```prisma
model Message {
  ...
  citations Json?
  metadata  Json?    // NEW — stores plots, buttons, nodeType
  ...
}
```

Run: `pnpm db:push` (no migration file needed)

### 1.6 Persist metadata in saveMessages()

**File:** `src/lib/runtime/context.ts`

```typescript
// In saveMessages():
data: messages.map((m) => ({
  conversationId,
  role: m.role === "assistant" ? "ASSISTANT" : "SYSTEM",
  content: m.content,
  metadata: m.metadata ?? undefined,  // NEW
})),
```

### 1.7 Load metadata when fetching conversation history

**File:** `src/lib/runtime/context.ts`

```typescript
// In loadContext() — include metadata in select:
const msgs = await prisma.message.findMany({
  where: { conversationId },
  select: { role: true, content: true, metadata: true },  // ADD metadata
  orderBy: { createdAt: "asc" },
});
```

**Files changed:** 6
**Risk:** Low (additive changes, backward compatible — metadata is optional everywhere)
**Tests:** Update stream-protocol tests, add metadata round-trip test

---

## Phase 2 — Render Plots in Chat UI

**Goal:** Display base64 PNG images inline in chat messages.

### 2.1 Create PlotRenderer component

**File:** `src/components/chat/plot-renderer.tsx` (NEW)

```typescript
interface PlotRendererProps {
  plots: string[];  // base64 data URLs
}

export function PlotRenderer({ plots }: PlotRendererProps) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {plots.map((src, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border">
          <img
            src={src}
            alt={`Python plot ${i + 1}`}
            className="max-w-full"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
```

### 2.2 Integrate into chat page

**File:** `src/app/chat/[agentId]/page.tsx`

After the ReactMarkdown block for assistant messages:

```tsx
{msg.role === "assistant" && (
  <>
    <div className="markdown-body">
      <ReactMarkdown>{msg.content}</ReactMarkdown>
    </div>
    {(msg.metadata as { plots?: string[] })?.plots?.length > 0 && (
      <PlotRenderer plots={(msg.metadata as { plots?: string[] }).plots!} />
    )}
  </>
)}
```

### 2.3 Integrate into embed widget

**File:** `src/app/embed/[agentId]/page.tsx`

Same pattern as 2.2 — add PlotRenderer after message content.

### 2.4 Load metadata from DB on chat page load

Ensure that when a conversation is loaded from DB, the metadata (including plots)
is included in the initial message list sent to the client.

**File:** Chat API route or chat page data fetching

**Files changed:** 4 (1 new + 3 modified)
**Risk:** Low
**Tests:** Snapshot test for PlotRenderer, visual check

---

## Phase 3 — Packages Field on Node

**Goal:** Let users specify pip packages to pre-load before execution.

### 3.1 Add packages to PythonRequest

**File:** `src/lib/runtime/python-types.ts`

```typescript
export interface PythonRequest {
  code: string;
  variables: Record<string, unknown>;
  timeout?: number;
  packages?: string[];  // NEW
}
```

### 3.2 Add packages field to property panel

**File:** `src/components/builder/property-panel.tsx`

After the Output Variable section for `python_code`:

```tsx
<div className="space-y-2">
  <Label>Additional Packages</Label>
  <Textarea
    value={(data.packages as string) ?? ""}
    onChange={(e) => update("packages", e.target.value)}
    rows={3}
    className="font-mono text-xs"
    placeholder={"scipy\nstatsmodels\nscikit-learn"}
  />
  <p className="text-xs text-muted-foreground">
    One package per line. numpy, pandas, matplotlib are pre-loaded.
    Browser supports Pyodide-compatible packages only.
  </p>
</div>
```

Store as newline-separated string in `data.packages`, parse to array in handler.

### 3.3 Pass packages from handler to executor

**File:** `src/lib/runtime/handlers/python-code-handler.ts`

```typescript
const packagesRaw = (node.data.packages as string) ?? "";
const packages = packagesRaw
  .split("\n")
  .map((p) => p.trim())
  .filter(Boolean);

// Validate package names (alphanumeric + hyphens + underscores only)
const PACKAGE_NAME_RE = /^[a-zA-Z0-9_-]+([<>=!~]+[a-zA-Z0-9._*]+)?$/;
const validPackages = packages.filter((p) => PACKAGE_NAME_RE.test(p));

const response = await executePython({
  code,
  variables: context.variables,
  timeout: packages.length > 0 ? 30_000 : EXECUTION_TIMEOUT_MS,  // more time for installs
  packages: validPackages,
});
```

### 3.4 Package name security validation

Add to handler's validation, BEFORE execution:

```typescript
const BLOCKED_PACKAGES = ["os", "subprocess", "socket", "ctypes", "sys"];
const hasBadPackage = validPackages.some((p) =>
  BLOCKED_PACKAGES.includes(p.split(/[<>=!~]/)[0])
);
if (hasBadPackage) {
  return {
    messages: [{ role: "assistant", content: "⚠️ Package blocked for security." }],
    nextNodeId: null, waitForInput: false,
  };
}
```

### 3.5 Update node picker description

**File:** `src/components/builder/node-picker.tsx`

```typescript
description: "Execute Python with numpy, pandas, matplotlib, and custom packages",
```

**Files changed:** 4
**Risk:** Low (additive)
**Tests:** Package validation tests, blocked package test

---

## Phase 4 — Browser Worker: micropip.install()

**Goal:** Install additional packages in Pyodide via micropip before user code runs.

### 4.1 Update browser worker

**File:** `public/pyodide-worker.js`

```javascript
// Known Pyodide built-in packages (use loadPackage, not micropip)
const PYODIDE_BUILTINS = new Set([
  "numpy", "pandas", "matplotlib", "scipy", "scikit-learn",
  "seaborn", "sympy", "pillow", "statsmodels", "networkx",
  "sqlalchemy", "pyyaml", "lxml", "beautifulsoup4", "regex",
]);

// Cache already-installed packages (avoid re-install)
const installedPackages = new Set(["numpy", "pandas"]);

async function installPackages(py, packages) {
  if (!packages || packages.length === 0) return;

  const builtins = packages.filter((p) => PYODIDE_BUILTINS.has(p) && !installedPackages.has(p));
  const pypiPkgs = packages.filter((p) => !PYODIDE_BUILTINS.has(p) && !installedPackages.has(p));

  // Load Pyodide built-ins via loadPackage (faster, no network for pure wasm)
  if (builtins.length > 0) {
    await py.loadPackage(builtins);
    builtins.forEach((p) => installedPackages.add(p));
  }

  // Load PyPI packages via micropip (pure Python only)
  if (pypiPkgs.length > 0) {
    await py.loadPackage("micropip");
    const micropip = py.pyimport("micropip");
    for (const pkg of pypiPkgs) {
      try {
        await micropip.install(pkg);
        installedPackages.add(pkg);
      } catch (err) {
        self.postMessage({
          type: "stdout",
          text: `[warn] Could not install ${pkg}: ${err.message}\n`,
        });
      }
    }
  }
}
```

In the message handler, before running user code:

```javascript
// Install requested packages
await installPackages(py, packages);
```

### 4.2 Handle micropip errors gracefully

If a package is not pure Python, `micropip.install()` throws
`ValueError: Can't find a pure Python 3 wheel`. Catch and report to user via
`stdout` chunk — don't fail the entire execution.

**Files changed:** 1
**Risk:** Medium (async package loading adds latency, needs error handling)
**Tests:** Manual browser test — install a pure Python package, verify availability

---

## Phase 5 — Node.js Worker: pip3 pre-install

**Goal:** Install additional packages on the server before running user code.

### 5.1 Update Python wrapper in Node.js worker

**File:** `src/lib/runtime/workers/pyodide-node-worker.js`

```python
# Add to PYTHON_WRAPPER, before main():

def _install_packages(packages):
    """Pre-install packages via pip before user code runs."""
    if not packages:
        return
    import subprocess as _sp, sys as _sys
    for pkg in packages:
        try:
            _sp.run(
                [_sys.executable, "-m", "pip", "install", "-q", "--user", pkg],
                timeout=60,
                capture_output=True,
                text=True,
            )
        except Exception as e:
            print(f"[warn] pip install {pkg} failed: {e}")
```

In `main()`, call before exec:

```python
packages = data.get('packages', [])
if packages:
    _install_packages(packages)
```

### 5.2 Pass packages through worker message

```javascript
// In parentPort.on("message"):
const input = JSON.stringify({
  code,
  variables: variables ?? {},
  packages: packages ?? [],  // NEW
});
```

### 5.3 Increase timeout for package installs

```javascript
// If packages are requested, add 60s to timeout
const effectiveTimeout = (packages?.length > 0) ? timeout + 60000 : timeout;
```

### 5.4 Security: subprocess is used by pip, not by user code

The Python wrapper calls `subprocess.run()` internally for pip install,
but this is in the wrapper code — NOT in user code. The handler's BLOCKED_PATTERNS
still prevent user code from calling `import subprocess` directly.

**Files changed:** 1
**Risk:** Medium (pip install adds latency; packages persist in worker process)
**Tests:** Integration test — install a small package, verify import works

---

## Phase 6 — Property Panel Run Preview (OPTIONAL)

**Goal:** Test Python code directly from the property panel without running the full flow.

### 6.1 Add Run button below code textarea

**File:** `src/components/builder/property-panel.tsx`

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleRunPreview}
  disabled={isRunning}
>
  {isRunning ? <Loader2 className="mr-2 size-3 animate-spin" /> : <Play className="mr-2 size-3" />}
  Run Preview
</Button>
```

### 6.2 Preview output section

```tsx
{previewResult && (
  <div className="mt-2 space-y-2 rounded border border-border p-3">
    {previewResult.output && (
      <pre className="text-xs whitespace-pre-wrap">{previewResult.output}</pre>
    )}
    {previewResult.plots?.map((src, i) => (
      <img key={i} src={src} className="max-w-full rounded" alt={`Plot ${i+1}`} />
    ))}
    {previewResult.error && (
      <pre className="text-xs text-red-400">{previewResult.error}</pre>
    )}
  </div>
)}
```

### 6.3 Execution logic

Call `executePython()` directly from the client side (browser path via Pyodide).
No API call needed — the browser worker handles it.

**Files changed:** 1
**Risk:** Low (optional feature, self-contained)
**Tests:** Manual test

---

## Implementation Order

```
Phase 1 (metadata pipeline) ← MUST be first, unblocks Phase 2
  ↓
Phase 2 (plot rendering)    ← Visible result, validates Phase 1
  ↓
Phase 3 (packages field)    ← Unblocks Phases 4+5
  ↓
Phase 4 (browser micropip)  ← Can run in parallel with Phase 5
Phase 5 (server pip3)       ← Can run in parallel with Phase 4
  ↓
Phase 6 (run preview)       ← Optional, depends on 2+3
```

## File Change Summary

| Phase | Files Changed | New Files | Lines (est.) |
|-------|--------------|-----------|-------------|
| 1     | 6            | 0         | ~60         |
| 2     | 3            | 1         | ~50         |
| 3     | 4            | 0         | ~50         |
| 4     | 1            | 0         | ~50         |
| 5     | 1            | 0         | ~40         |
| 6     | 1            | 0         | ~60         |
| **Total** | **12** (some overlap) | **1** | **~310** |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| micropip fails on C-extension packages | Graceful error + user warning, don't crash execution |
| pip install adds 30-60s latency on server | Cache installed packages in worker session; increase timeout |
| Large base64 plots inflate DB storage | Limit to 5 plots per execution, max 2MB per plot |
| StreamChunk metadata breaks older clients | metadata is optional (backward compatible) |
| Package name injection (e.g. "os; rm -rf") | Regex validation + blocklist in handler |

## Pre-Push Checklist (per phase)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (existing + new tests)
- [ ] `pnpm precheck` passes
- [ ] Manual test: create Python node → write matplotlib code → see plot in chat
- [ ] Manual test: add package → verify install → use in code
