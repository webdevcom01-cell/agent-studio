import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        // next-auth v5 beta uses bare `next/server` specifiers internally (no .js
        // extension) which fail under strict ESM when pnpm resolves the package
        // with its own nested `next` copy (e.g. CI --frozen-lockfile).
        // Inlining forces Vite to transform the package and resolve those imports.
        inline: ["next-auth"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**",
        "src/types/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/data/**",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/instrumentation.ts",
      ],
      // Target: 70% lines. Warn only — do not fail CI until baseline is established.
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force React development builds so React.act is available in tests
    conditions: ["development", "browser"],
  },
});
