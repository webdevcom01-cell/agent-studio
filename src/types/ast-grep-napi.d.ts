/**
 * Ambient declaration for @ast-grep/napi — Rust native addon.
 * The actual types are duck-typed in src/lib/ast/ast-grep-client.ts
 * to avoid a hard dependency on the native addon being installed.
 */
declare module "@ast-grep/napi" {
  // Runtime types are handled via duck-typed interfaces in ast-grep-client.ts.
  // This declaration satisfies the TypeScript module resolver so the dynamic
  // import compiles even when the native addon is absent in the build env.
  const Lang: Record<string, unknown>;
  function parse(lang: unknown, source: string): unknown;
  export { Lang, parse };
}
