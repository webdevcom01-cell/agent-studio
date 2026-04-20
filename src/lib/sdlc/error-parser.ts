export interface TscError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

export interface TestFailure {
  testName: string;
  file: string;
  expected: string;
  received: string;
  errorMessage: string;
}

export function parseTscErrors(output: string): TscError[] {
  const errors: TscError[] = [];
  const pattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

  for (const match of output.matchAll(pattern)) {
    errors.push({
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      col: parseInt(match[3], 10),
      code: match[4],
      message: match[5].trim(),
    });
  }

  return errors;
}

export function parseVitestFailures(output: string): TestFailure[] {
  const failures: TestFailure[] = [];
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match FAIL lines or ×/✗ failure markers
    const failMatch = line.match(/^\s*(?:FAIL|×|✗)\s+(.+?)(?:\s+\((.+?)\))?$/) ||
      line.match(/^\s*(?:FAIL|×|✗)\s+(.+)$/);
    if (!failMatch) continue;

    const testName = failMatch[1].trim();
    const file = failMatch[2]?.trim() ?? "";

    let expected = "";
    let received = "";
    let errorMessage = "";

    // Look ahead up to 15 lines for error details
    const lookahead = lines.slice(i + 1, i + 16);
    for (const detail of lookahead) {
      const expectedMatch = detail.match(/^\s*(?:Expected|expected)[:\s]+(.+)$/);
      const receivedMatch = detail.match(/^\s*(?:Received|received)[:\s]+(.+)$/);
      const assertionMatch = detail.match(/^\s*AssertionError:\s+(.+)$/);
      const errorMatch = detail.match(/^\s*Error:\s+(.+)$/);

      if (expectedMatch && !expected) expected = expectedMatch[1].trim();
      if (receivedMatch && !received) received = receivedMatch[1].trim();
      if (assertionMatch && !errorMessage) errorMessage = assertionMatch[1].trim();
      if (errorMatch && !errorMessage) errorMessage = errorMatch[1].trim();
    }

    failures.push({ testName, file, expected, received, errorMessage });
  }

  return failures;
}

export function formatErrorsForFeedback(
  tscErrors: TscError[],
  testFailures: TestFailure[],
): string {
  if (tscErrors.length === 0 && testFailures.length === 0) return "";

  const sections: string[] = [];

  if (tscErrors.length > 0) {
    const byFile = new Map<string, TscError[]>();
    for (const err of tscErrors) {
      const existing = byFile.get(err.file) ?? [];
      existing.push(err);
      byFile.set(err.file, existing);
    }

    const fileBlocks: string[] = [];
    for (const [file, errs] of byFile) {
      const lines = errs
        .map((e) => `  - [${e.code}] line ${e.line}:${e.col} — ${e.message}`)
        .join("\n");
      fileBlocks.push(`**${file}**\n${lines}`);
    }
    sections.push(`### TypeScript Errors\n\n${fileBlocks.join("\n\n")}`);
  }

  if (testFailures.length > 0) {
    const items = testFailures
      .map((f) => {
        const parts = [`- **${f.testName}**`];
        if (f.file) parts.push(`  File: ${f.file}`);
        if (f.errorMessage) parts.push(`  Error: ${f.errorMessage}`);
        if (f.expected) parts.push(`  Expected: ${f.expected}`);
        if (f.received) parts.push(`  Received: ${f.received}`);
        return parts.join("\n");
      })
      .join("\n");
    sections.push(`### Test Failures\n\n${items}`);
  }

  return sections.join("\n\n");
}

export interface RuntimeError {
  type: "ReferenceError" | "TypeError" | "SyntaxError" | "Cannot find module" | "other";
  message: string;
  /** The name/symbol that is undefined or missing, if detectable */
  missingSymbol?: string;
}

/**
 * Parse runtime errors that occur BEFORE any test executes.
 * These include ReferenceError (vi is not defined), TypeError, SyntaxError,
 * and module resolution errors. Vitest's test runner emits these as:
 *   ReferenceError: vi is not defined
 *   TypeError: X is not a function
 *   Cannot find module 'X'
 */
export function parseRuntimeErrors(output: string): RuntimeError[] {
  const errors: RuntimeError[] = [];
  const seen = new Set<string>();

  // ReferenceError: X is not defined
  for (const m of output.matchAll(/ReferenceError:\s+(\S+)\s+is not defined/g)) {
    const msg = m[0];
    if (seen.has(msg)) continue;
    seen.add(msg);
    errors.push({ type: "ReferenceError", message: msg, missingSymbol: m[1] });
  }

  // TypeError: X is not a function / X is not a constructor
  for (const m of output.matchAll(/TypeError:\s+(.+?)(?:\n|$)/g)) {
    const msg = m[0].trim();
    if (seen.has(msg)) continue;
    seen.add(msg);
    errors.push({ type: "TypeError", message: msg });
  }

  // SyntaxError
  for (const m of output.matchAll(/SyntaxError:\s+(.+?)(?:\n|$)/g)) {
    const msg = m[0].trim();
    if (seen.has(msg)) continue;
    seen.add(msg);
    errors.push({ type: "SyntaxError", message: msg });
  }

  // Cannot find module 'X'
  for (const m of output.matchAll(/Cannot find module ['"](.+?)['"]/g)) {
    const msg = m[0];
    if (seen.has(msg)) continue;
    seen.add(msg);
    errors.push({ type: "Cannot find module", message: msg, missingSymbol: m[1] });
  }

  return errors;
}

/**
 * Format runtime errors into a human-readable section for the feedback prompt.
 */
export function formatRuntimeErrorsForFeedback(errors: RuntimeError[]): string {
  if (errors.length === 0) return "";
  const items = errors.map((e) => {
    if (e.missingSymbol) {
      return `- ${e.type}: \`${e.missingSymbol}\` — ${e.message}`;
    }
    return `- ${e.type}: ${e.message}`;
  });
  return `### Runtime Errors (before tests ran)\n\n${items.join("\n")}`;
}

export function hasCompilerErrors(tscOutput: string): boolean {
  return parseTscErrors(tscOutput).length > 0;
}

export function hasTestFailures(vitestOutput: string): boolean {
  // Structured Vitest failures (×/✗/FAIL markers)
  if (parseVitestFailures(vitestOutput).length > 0) return true;
  // Runtime errors that prevent tests from running at all
  if (parseRuntimeErrors(vitestOutput).length > 0) return true;
  return false;
}
