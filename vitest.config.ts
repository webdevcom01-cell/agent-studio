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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force React development builds so React.act is available in tests
    conditions: ["development", "browser"],
  },
});
