import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "src/generated/**",
      "test-*.ts",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Keep parity with `next lint`, which flagged stale eslint-disable comments.
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // Catch leftover debug logging (allow in test files)
      "no-console": ["warn", { allow: ["error", "warn"] }],
      // Prefer TypeScript-aware unused vars rule
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Dev/ops CLI scripts intentionally print to stdout.
    files: ["src/scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
