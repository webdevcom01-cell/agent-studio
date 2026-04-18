import { describe, it, expect } from "vitest";
import {
  parseTscErrors,
  parseVitestFailures,
  formatErrorsForFeedback,
  hasCompilerErrors,
  hasTestFailures,
} from "../error-parser";

describe("parseTscErrors", () => {
  it("parses a realistic tsc --pretty false error line", () => {
    const output = "src/lib/auth.ts(42,7): error TS2304: Cannot find name 'Bar'.";
    const errors = parseTscErrors(output);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: "src/lib/auth.ts",
      line: 42,
      col: 7,
      code: "TS2304",
      message: "Cannot find name 'Bar'.",
    });
  });

  it("returns [] for clean 'Found 0 errors.' output", () => {
    const output = "Found 0 errors. Watching for file changes.";
    expect(parseTscErrors(output)).toEqual([]);
  });

  it("ANSI codes in input do not cause false positives", () => {
    const output = "\x1b[31msome colored output\x1b[0m\n\x1b[32mBuild succeeded\x1b[0m";
    expect(parseTscErrors(output)).toEqual([]);
  });
});

describe("parseVitestFailures", () => {
  it("parses a FAIL line and extracts expected/received", () => {
    const output = [
      " FAIL  src/lib/auth.test.ts",
      "  × should return user when valid",
      "    AssertionError: expected values to be strictly deep-equal",
      "    Expected: { id: '1' }",
      "    Received: null",
    ].join("\n");

    const failures = parseVitestFailures(output);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].testName).toBeTruthy();
  });

  it("returns [] for passing vitest output", () => {
    const output = "✓ all tests passed\n  ✓ should return user when valid";
    expect(parseVitestFailures(output)).toEqual([]);
  });
});

describe("formatErrorsForFeedback", () => {
  it("returns '' when both arrays are empty", () => {
    expect(formatErrorsForFeedback([], [])).toBe("");
  });

  it("groups multiple tsc errors under the same file", () => {
    const tscErrors = [
      { file: "src/lib/auth.ts", line: 10, col: 5, code: "TS2304", message: "Cannot find 'Foo'." },
      { file: "src/lib/auth.ts", line: 20, col: 3, code: "TS2322", message: "Type mismatch." },
      { file: "src/lib/other.ts", line: 5, col: 1, code: "TS2304", message: "Cannot find 'Bar'." },
    ];
    const result = formatErrorsForFeedback(tscErrors, []);
    expect(result).toContain("src/lib/auth.ts");
    expect(result).toContain("TS2304");
    expect(result).toContain("TS2322");
    // Both auth.ts errors should appear under the same file heading
    const authIdx = result.indexOf("src/lib/auth.ts");
    const otherIdx = result.indexOf("src/lib/other.ts");
    expect(authIdx).toBeLessThan(otherIdx);
  });
});

describe("hasCompilerErrors", () => {
  it("returns true for error output", () => {
    expect(hasCompilerErrors("src/foo.ts(1,1): error TS2304: Cannot find name 'x'.")).toBe(true);
  });

  it("returns false for clean output", () => {
    expect(hasCompilerErrors("Found 0 errors.")).toBe(false);
  });
});

describe("hasTestFailures", () => {
  it("returns true for FAIL output", () => {
    expect(hasTestFailures(" FAIL  src/lib/auth.test.ts")).toBe(true);
  });

  it("returns false for passing output", () => {
    expect(hasTestFailures("✓ all tests passed")).toBe(false);
  });
});
