# PLAN: Embeddable Chat Widget Improvements

## Current State Summary

| Component | File | Current Behavior |
|-----------|------|-----------------|
| Widget script | `public/embed.js` | Reads `data-agent-id`, `data-position`, `data-color`, `data-title` from script tag. Creates bubble + iframe. Toggles open/close. Listens for `agent-studio-close` postMessage. |
| Embed page | `src/app/embed/[agentId]/page.tsx` | Fetches agent name, renders chat UI with messages, input, reset button. Uses `useStreamingChat` hook. No URL param support. |
| Chat hook | `src/components/chat/use-streaming-chat.ts` | Manages messages, conversationId (in-memory ref), streaming NDJSON parsing. `resetChat` clears everything. No persistence. |

---

## Improvement 1: Per-Agent Customization via URL Params

### Problem
`embed.js` reads `data-color`, `data-title`, `data-welcome-message` but only uses color/title locally. The iframe page has no way to receive these — it always shows hardcoded "How can I help you?" and default theme.

### Proposed Change

**File: `public/embed.js`** — pass config as URL params to iframe:

```js
// Current
iframe.src = baseUrl + "/embed/" + agentId;

// New
var welcomeMessage = script.getAttribute("data-welcome-message") || "";
var iframeParams = new URLSearchParams();
if (color) iframeParams.set("color", color);
if (title) iframeParams.set("title", title);
if (welcomeMessage) iframeParams.set("welcome", welcomeMessage);
iframe.src = baseUrl + "/embed/" + agentId + "?" + iframeParams.toString();
```

**File: `src/app/embed/[agentId]/page.tsx`** — read URL params via `useSearchParams()`:

```tsx
const searchParams = useSearchParams();
const customColor = searchParams.get("color");
const welcomeMessage = searchParams.get("welcome") || "How can I help you?";
const customTitle = searchParams.get("title");
```

- Apply `customColor` to header background and send button via inline CSS variable `--widget-primary`
- Use `welcomeMessage` in the empty state placeholder
- Use `customTitle` as fallback agent name if API call hasn't loaded yet

### Impact
- **Medium** — Enables hosts to customize the widget per embed without deploying code changes.
- Wrap page content in `<Suspense>` since `useSearchParams()` requires it in App Router.

---

## Improvement 2: Proactive Message (Auto-Open After 30s)

### Problem
Users may not notice the chat widget. A proactive "nudge" after 30 seconds draws attention and increases engagement — but only once per session to avoid annoyance.

### Proposed Change

**File: `public/embed.js`** — add proactive open timer:

```js
var PROACTIVE_DELAY_MS = 30000;
var proactiveKey = "as-proactive-" + agentId;

if (!sessionStorage.getItem(proactiveKey)) {
  var proactiveTimer = setTimeout(function () {
    if (!isOpen) {
      toggleChat();
      sessionStorage.setItem(proactiveKey, "1");
      // Send proactive message to iframe
      iframe.contentWindow.postMessage(
        { type: "agent-studio-proactive", message: "Need help? I'm here!" },
        "*"
      );
    }
  }, PROACTIVE_DELAY_MS);

  // Cancel if user opens chat manually before timer
  bubble.addEventListener("click", function () {
    clearTimeout(proactiveTimer);
    sessionStorage.setItem(proactiveKey, "1");
  }, { once: true });
}
```

**File: `src/app/embed/[agentId]/page.tsx`** — listen for proactive message:

```tsx
useEffect(() => {
  function handleMessage(e: MessageEvent) {
    if (e.data?.type === "agent-studio-proactive" && typeof e.data.message === "string") {
      // Show proactive message as a system/assistant message
      setProactiveMessage(e.data.message);
    }
  }
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}, []);
```

- Display proactive message as a styled assistant bubble in empty state
- The proactive message text can also be customized via `data-proactive-message` attribute on the script tag

### Impact
- **Medium** — Increases engagement. One-time per session via sessionStorage. No annoyance on repeat visits.
- Zero cost — purely client-side timer.

---

## Improvement 3: Persistent Conversation via sessionStorage

### Problem
If user refreshes the host page, `conversationIdRef` is lost and a new conversation starts. The server still has the old conversation, but the client doesn't reconnect to it.

### Proposed Change

**File: `src/components/chat/use-streaming-chat.ts`** — add optional `persistKey` to save/restore conversationId:

```ts
interface UseStreamingChatOptions {
  agentId: string;
  persistKey?: string; // e.g. "embed-{agentId}"
}
```

On `done` chunk (when conversationId is received):
```ts
case "done":
  if (chunk.conversationId) {
    conversationIdRef.current = chunk.conversationId;
    setConversationId(chunk.conversationId);
    if (persistKey) {
      sessionStorage.setItem(persistKey, chunk.conversationId);
    }
  }
  break;
```

On hook init:
```ts
const [conversationId, setConversationId] = useState<string | undefined>(() => {
  if (persistKey && typeof window !== "undefined") {
    return sessionStorage.getItem(persistKey) ?? undefined;
  }
  return undefined;
});

// Sync ref on init
useEffect(() => {
  if (conversationId) {
    conversationIdRef.current = conversationId;
  }
}, [conversationId]);
```

On `resetChat`:
```ts
const resetChat = useCallback(() => {
  setMessages([]);
  conversationIdRef.current = undefined;
  setConversationId(undefined);
  if (persistKey) {
    sessionStorage.removeItem(persistKey);
  }
}, [persistKey]);
```

**File: `src/app/embed/[agentId]/page.tsx`** — pass persistKey:

```tsx
const { messages, input, setInput, isLoading, sendMessage, resetChat } =
  useStreamingChat({ agentId, persistKey: `as-conv-${agentId}` });
```

**File: `src/app/chat/[agentId]/page.tsx`** — no change needed (full chat page doesn't need embed persistence).

### Problem: Loading Previous Messages
Restoring `conversationId` alone means the user sees an empty chat but the server continues the old conversation. Two options:

**Option A (simple):** Accept this — the server responds in context even if the UI doesn't show old messages. The first bot response will still be contextually aware.

**Option B (better UX):** Add a GET endpoint to fetch conversation messages, and load them on mount when a persisted conversationId exists.

Recommend **Option A** for now — it's simpler and the conversation context is preserved server-side. Option B can be a follow-up.

### Impact
- **High** — Users don't lose their conversation on page refresh. Critical for embed use case where users navigate around a host site.
- No server changes for Option A.

---

## Improvement 4: Unread Badge with Count

### Problem
Current green badge is static — it's always visible as a "status dot". When the widget is closed and the bot sends a message (e.g., proactive message, or delayed response), there's no visual indicator.

### Proposed Change

**File: `public/embed.js`** — replace static badge with dynamic counter:

```js
var unreadCount = 0;

// Replace static badge styles
// Old: ".as-widget-badge{...width:12px;height:12px;background:#22c55e...}"
// New:
".as-widget-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;border-radius:9px;border:2px solid #fff;font-size:11px;font-weight:700;color:#fff;display:none;align-items:center;justify-content:center;padding:0 4px;font-family:system-ui,sans-serif}"
".as-widget-badge.as-has-unread{display:flex}"
```

Listen for unread message events from iframe:
```js
window.addEventListener("message", function (e) {
  if (e.data && e.data.type === "agent-studio-close") {
    if (isOpen) toggleChat();
  }
  if (e.data && e.data.type === "agent-studio-new-message") {
    if (!isOpen) {
      unreadCount += (typeof e.data.count === "number") ? e.data.count : 1;
      updateBadge();
    }
  }
});

function updateBadge() {
  var badge = bubble.querySelector(".as-widget-badge");
  if (!badge) return;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.classList.add("as-has-unread");
  } else {
    badge.classList.remove("as-has-unread");
    badge.textContent = "";
  }
}
```

On toggleChat (when opening, clear unread):
```js
function toggleChat() {
  isOpen = !isOpen;
  if (isOpen) {
    unreadCount = 0;
    updateBadge();
  }
  // ... rest of existing toggle logic
}
```

**File: `src/app/embed/[agentId]/page.tsx`** — notify parent on new assistant message:

Inside the `useEffect` that watches `messages`, check if the last message is from assistant and post to parent:

```tsx
useEffect(() => {
  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "assistant" && lastMsg.content) {
    window.parent?.postMessage({ type: "agent-studio-new-message", count: 1 }, "*");
  }
}, [messages]);
```

### Impact
- **Medium** — Clear visual indicator that there are unread messages. Standard pattern in all chat widgets.
- The count resets when widget opens.

---

## Improvement 5: Better Mobile UX (Full-Screen + Close Button)

### Problem
Current CSS rule `@media(max-width:480px)` makes the iframe full-screen, but there's no close button inside the iframe header — the user has to find the bubble behind the full-screen overlay. On mobile, the bubble is hidden behind the iframe.

### Proposed Change

**File: `public/embed.js`** — add mobile styles for bubble when open:

```js
// Add to styles
"@media(max-width:480px){.as-widget-bubble.as-chat-open{bottom:auto;top:12px;" + position + ":12px;width:40px;height:40px;z-index:1000000;background:rgba(0,0,0,.5)}}"
"@media(max-width:480px){.as-widget-frame{bottom:0;left:0;right:0;width:100vw;height:100dvh;max-height:100dvh;border-radius:0}}"
"@media(max-width:480px){.as-widget-label{display:none}}"
```

On toggleChat, add class to bubble:
```js
function toggleChat() {
  isOpen = !isOpen;
  bubble.classList.toggle("as-chat-open", isOpen);
  // ... existing logic
}
```

**File: `src/app/embed/[agentId]/page.tsx`** — add close button in header that posts message to parent:

```tsx
<button
  onClick={() => window.parent?.postMessage({ type: "agent-studio-close" }, "*")}
  className="p-1.5 rounded-md hover:bg-primary-foreground/20 transition-colors sm:hidden"
  title="Close"
>
  <X className="size-3.5" />
</button>
```

- Use `sm:hidden` so close button only shows on mobile (< 640px)
- Also use `100dvh` instead of `100vh` for proper mobile viewport handling (avoids address bar issue)

### Impact
- **High** — Mobile is currently broken UX. Users can't close the widget without scrolling to find the bubble. This fixes it with a standard mobile chat pattern.
- Zero performance cost.

---

## Implementation Order

| Step | Improvement | Files Changed | Complexity |
|------|-----------|---------------|-----------|
| 1 | Per-agent customization | `embed.js`, `embed/page.tsx` | Low |
| 2 | Better mobile UX | `embed.js`, `embed/page.tsx` | Low |
| 3 | Unread badge | `embed.js`, `embed/page.tsx` | Low |
| 4 | Persistent conversation | `use-streaming-chat.ts`, `embed/page.tsx` | Low |
| 5 | Proactive message | `embed.js`, `embed/page.tsx` | Low |

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
- [ ] `pnpm build` passes
- [ ] Manual test: embed widget opens/closes on desktop
- [ ] Manual test: widget opens full-screen on mobile with close button
- [ ] Manual test: custom color/title/welcome via data attributes
- [ ] Manual test: unread badge shows count when widget is closed
- [ ] Manual test: conversation persists after page refresh
- [ ] Manual test: proactive message appears after 30s (only once)
