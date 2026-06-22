// vitest.rls.config.ts — dedicated config for RLS verification tests.
//
// The main vitest.config.ts limits `include` to "src/**", which excludes the
// RLS tests under skills/rls-rollout/tests/. This config inherits everything
// from the main config (aliases, setup, plugins) and:
//   1) adds the skills/**/tests path so vitest runs cross-tenant.test.ts, and
//   2) loads .env.test into process.env (vitest does NOT do this automatically),
//      so the RLS helper finds DATABASE_URL_APP_USER / DATABASE_URL_ADMIN_USER.
//
// Run:  pnpm vitest run --config vitest.rls.config.ts skills/rls-rollout/tests/cross-tenant.test.ts
// (or:  pnpm test:rls  — see package.json scripts)
import base from "./vitest.config";
import { mergeConfig, defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// Load .env.test (mode "test", all keys — empty prefix) WITHOUT clobbering any
// real env vars exported in the shell. Skipping clobber means a deliberate
// shell `export` still wins, which is useful for one-off overrides.
const loaded = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(loaded)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["skills/**/tests/**/*.test.{ts,tsx}"],
    },
  }),
);
