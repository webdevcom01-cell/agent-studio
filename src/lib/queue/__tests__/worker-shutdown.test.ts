/**
 * Structural tests for worker.ts graceful-shutdown logic.
 * These tests parse the source file rather than importing it (the file
 * requires REDIS_URL and bullmq at runtime) and verify the required
 * shutdown patterns are present.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../worker.ts"),
  "utf-8",
);

describe("worker.ts — graceful shutdown", () => {
  it("captures worker instance in isDirectRun block", () => {
    // Must assign createWorker() result to a variable so signals can close it
    expect(SRC).toMatch(/const worker = createWorker\(\)/);
  });

  it("registers SIGTERM handler", () => {
    expect(SRC).toMatch(/process\.on\(\s*["']SIGTERM["']/);
  });

  it("registers SIGINT handler", () => {
    expect(SRC).toMatch(/process\.on\(\s*["']SIGINT["']/);
  });

  it("calls worker.close() in shutdown function", () => {
    expect(SRC).toMatch(/await worker\.close\(\)/);
  });

  it("logs shutdown initiation with signal name", () => {
    expect(SRC).toMatch(/Graceful shutdown initiated/);
  });

  it("logs successful drain after close", () => {
    expect(SRC).toMatch(/Worker drained and closed/);
  });
});
