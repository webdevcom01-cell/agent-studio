/**
 * Structural tests for EmbedError component.
 * Verifies the component file exports and doesn't contain
 * "Back to Dashboard" link (which would be wrong in an iframe embed context).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const errorSource = readFileSync(
  resolve(__dirname, "../[agentId]/error.tsx"),
  "utf-8"
);

describe("embed error.tsx — structural checks", () => {
  it("exports a default function", () => {
    expect(errorSource).toContain("export default function");
  });

  it("does NOT contain 'Back to Dashboard' link (embed context)", () => {
    expect(errorSource).not.toContain("Dashboard");
    expect(errorSource).not.toContain('href="/"');
  });

  it("contains user-friendly error text", () => {
    expect(errorSource).toContain("temporarily unavailable");
  });

  it("contains a Try again action", () => {
    expect(errorSource).toContain("Try again");
  });

  it("accepts error and reset props (Next.js error boundary contract)", () => {
    expect(errorSource).toContain("error:");
    expect(errorSource).toContain("reset:");
  });

  it("uses only Tailwind classes, no inline styles", () => {
    // No style={{ ... }} patterns
    expect(errorSource).not.toMatch(/style=\{\{/);
  });
});
