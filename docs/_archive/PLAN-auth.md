# PLAN: Add Authentication to Agent Studio

## 1. Problem Statement

The Agent Studio dashboard, builder, knowledge base, and all admin API routes are publicly accessible. Anyone with the URL can create, modify, and delete agents. The embeddable chat widget and chat API must remain public for end-users, but all admin functionality needs protection.

## 2. Solution

**NextAuth.js v5** (`next-auth@beta`) with **GitHub + Google OAuth** providers.

Why NextAuth v5:
- Native App Router support (Route Handlers, not API routes)
- Edge-compatible middleware for route protection
- Session available in both Server and Client Components
- Prisma Adapter for storing sessions/accounts in existing DB
- No custom auth code to maintain

## 3. Route Classification

### Public Routes (NO auth required)
| Route | Reason |
|-------|--------|
| `/embed/*` | Embeddable chat widget for external sites |
| `/chat/[agentId]` | Shareable chat link for end-users |
| `/api/agents/[agentId]/chat` | Chat API (used by embed + chat pages) |
| `/api/auth/*` | NextAuth sign-in/sign-out/callback routes |
| `/_next/*` | Next.js static assets |
| `/favicon.ico` | Browser icon |
| `/embed.js` | Widget script for external sites |
| `/test-embed.html` | Widget test page |

### Protected Routes (auth required)
| Route | Type |
|-------|------|
| `/` (dashboard) | Page |
| `/builder/[agentId]` | Page |
| `/knowledge/[agentId]` | Page |
| `/api/agents` (GET, POST) | API |
| `/api/agents/[agentId]` (GET, PATCH, DELETE) | API |
| `/api/agents/[agentId]/flow` (GET, PUT) | API |
| `/api/agents/[agentId]/knowledge/*` | API |
| `/api/agents/[agentId]/export` | API |
| `/api/agents/import` | API |

### New Routes (created by this feature)
| Route | Type |
|-------|------|
| `/api/auth/[...nextauth]` | NextAuth handler (auto-created) |
| `/login` | Custom sign-in page |

## 4. Files to Create

| File | Description |
|------|-------------|
| `src/lib/auth.ts` | NextAuth config (providers, adapter, callbacks, session strategy) |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler (exports GET, POST from auth config) |
| `src/app/login/page.tsx` | Custom sign-in page with GitHub + Google buttons |
| `src/middleware.ts` | Edge middleware — check session, redirect to /login if unauthenticated |

## 5. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add NextAuth models: Account, Session, VerificationToken. Extend User with `image`, `emailVerified` fields |
| `package.json` | Add `next-auth@beta`, `@auth/prisma-adapter` |
| `.env.example` | Add AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET |
| `.env.local` | Add actual auth env values |
| `src/app/layout.tsx` | Wrap children in `<SessionProvider>` |
| `src/app/page.tsx` | Add user avatar/sign-out button in header |
| `src/components/builder/flow-builder.tsx` | No change needed (protected by middleware) |

## 6. Environment Variables Needed

```env
# Auth (NextAuth v5)
AUTH_SECRET="generated-random-secret"        # npx auth secret
AUTH_GITHUB_ID="your-github-oauth-app-id"
AUTH_GITHUB_SECRET="your-github-oauth-app-secret"
AUTH_GOOGLE_ID="your-google-oauth-client-id"
AUTH_GOOGLE_SECRET="your-google-oauth-client-secret"
```

GitHub OAuth: Settings → Developer Settings → OAuth Apps → New
- Callback URL: `https://agent-studio-theta.vercel.app/api/auth/callback/github`
- Homepage: `https://agent-studio-theta.vercel.app`

Google OAuth: Google Cloud Console → Credentials → OAuth 2.0
- Authorized redirect URI: `https://agent-studio-theta.vercel.app/api/auth/callback/google`

For local dev, also add `http://localhost:3000/api/auth/callback/github` etc.

## 7. Implementation Steps

### Step 1: Install dependencies
```bash
pnpm add next-auth@beta @auth/prisma-adapter
```

### Step 2: Update Prisma schema
Add Account, Session, VerificationToken models per NextAuth Prisma Adapter spec. Extend User model with `image` and `emailVerified`.

### Step 3: Run migration
```bash
pnpm db:migrate
```

### Step 4: Create auth config (`src/lib/auth.ts`)
- Configure GitHub + Google providers
- Use PrismaAdapter
- Set `pages: { signIn: "/login" }`
- Add session callback to include `user.id`

### Step 5: Create NextAuth route handler
`src/app/api/auth/[...nextauth]/route.ts` — export GET/POST from auth config.

### Step 6: Create middleware (`src/middleware.ts`)
- Match all routes except public ones
- Check for valid session
- Redirect to `/login` if no session
- Use NextAuth `auth` middleware wrapper

### Step 7: Create login page (`src/app/login/page.tsx`)
- Centered card with app logo
- "Sign in with GitHub" button
- "Sign in with Google" button
- Redirect to dashboard after sign-in

### Step 8: Update layout.tsx
- Add `<SessionProvider>` wrapper

### Step 9: Update dashboard
- Show user avatar + name in header
- Add sign-out button

### Step 10: Link agents to authenticated user
- On agent create (POST /api/agents), set `userId` from session
- On agent list (GET /api/agents), filter by `userId`
- Existing agents without userId remain accessible (backwards compatible)

## 8. Verification Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` — all existing 110 tests pass
- [ ] Unauthenticated user visiting `/` → redirected to `/login`
- [ ] Unauthenticated user visiting `/builder/xxx` → redirected to `/login`
- [ ] Unauthenticated user visiting `/chat/xxx` → chat works (public)
- [ ] Unauthenticated user visiting `/embed/xxx` → embed works (public)
- [ ] Unauthenticated POST to `/api/agents` → 401
- [ ] Unauthenticated POST to `/api/agents/xxx/chat` → works (public)
- [ ] Sign in with GitHub → redirected to dashboard
- [ ] Sign in with Google → redirected to dashboard
- [ ] Authenticated user sees their agents only
- [ ] New agents created are linked to authenticated user
- [ ] Sign out → redirected to `/login`
- [ ] Vercel deploy succeeds
- [ ] No breaking changes to embed widget

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Existing agents have no userId | Filter query: `where: { OR: [{ userId: session.user.id }, { userId: null }] }` — first authenticated user inherits orphan agents |
| Middleware blocks embed.js | Explicit public path matcher excludes static files |
| OAuth callback URL mismatch | Document exact URLs for both local and production |
| Session cookie on different domains | Not an issue — embed uses iframe from same origin |
