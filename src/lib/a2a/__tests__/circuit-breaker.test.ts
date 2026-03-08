import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  resetCircuits,
} from "../circuit-breaker";

beforeEach(() => {
  resetCircuits();
});

describe("CircuitBreaker", () => {
  it("allows calls when circuit is closed", () => {
    expect(() => checkCircuit("a1", "a2")).not.toThrow();
  });

  it("opens circuit after 3 consecutive failures", () => {
    recordFailure("a1", "a2");
    recordFailure("a1", "a2");
    expect(() => checkCircuit("a1", "a2")).not.toThrow();

    recordFailure("a1", "a2");
    expect(() => checkCircuit("a1", "a2")).toThrow("Circuit open");
  });

  it("throws when circuit is open", () => {
    for (let i = 0; i < 3; i++) {
      recordFailure("a1", "a2");
    }

    expect(() => checkCircuit("a1", "a2")).toThrow(
      /Circuit open for a2/
    );
  });

  it("transitions to half-open after reset timeout", () => {
    for (let i = 0; i < 3; i++) {
      recordFailure("a1", "a2");
    }

    expect(() => checkCircuit("a1", "a2")).toThrow();

    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    expect(() => checkCircuit("a1", "a2")).not.toThrow();

    vi.useRealTimers();
  });

  it("resets to closed on success from half-open", () => {
    for (let i = 0; i < 3; i++) {
      recordFailure("a1", "a2");
    }

    recordSuccess("a1", "a2");

    expect(() => checkCircuit("a1", "a2")).not.toThrow();
  });

  it("does not affect other agent pairs", () => {
    for (let i = 0; i < 3; i++) {
      recordFailure("a1", "a2");
    }

    expect(() => checkCircuit("a1", "a3")).not.toThrow();
    expect(() => checkCircuit("a2", "a1")).not.toThrow();
  });
});
