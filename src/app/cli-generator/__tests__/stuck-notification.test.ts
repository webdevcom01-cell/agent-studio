/**
 * Structural tests for the CLI Generator stuck notification feature.
 * Verifies source-level patterns without needing React rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const pageSource = readFileSync(
  resolve(__dirname, "../page.tsx"),
  "utf-8",
);

describe("CLI Generator page — stuck notification", () => {
  it("declares notifiedStuckRef to guard against duplicate toasts", () => {
    expect(pageSource).toContain("notifiedStuckRef");
    expect(pageSource).toContain('useRef<Set<string>>(new Set())');
  });

  it("fires toast.warning when a generation is stuck", () => {
    expect(pageSource).toContain("toast.warning");
    expect(pageSource).toContain("appears stuck");
  });

  it("only notifies once per generation (guards with notifiedStuckRef)", () => {
    expect(pageSource).toContain("notifiedStuckRef.current.has(gen.id)");
    expect(pageSource).toContain("notifiedStuckRef.current.add(gen.id)");
  });

  it("notification fires regardless of selection (iterates all generations)", () => {
    // The F2 useEffect must iterate generations array, not depend on selectedId
    const f2Block = pageSource.slice(
      pageSource.indexOf("F2: Proactive stuck notification"),
      pageSource.indexOf("F1: Auto-resume stuck generations"),
    );
    expect(f2Block).toContain("for (const gen of generations)");
    expect(f2Block).not.toContain("selectedId");
  });

  it("toast has extended duration for visibility", () => {
    expect(pageSource).toContain("duration: 8000");
  });
});
