import { describe, it, expect, vi, beforeEach } from "vitest";
import { EccCircuitBreaker } from "../mcp-circuit-breaker";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeBreaker(opts = {}) {
  return new EccCircuitBreaker({
    failureThreshold: 3,
    recoveryTimeoutMs: 100,
    successThreshold: 2,
    ...opts,
  });
}

describe("EccCircuitBreaker — CLOSED state", () => {
  it("starts in CLOSED state", () => {
    expect(makeBreaker().currentState).toBe("CLOSED");
  });

  it("passes through successful calls", async () => {
    const cb = makeBreaker();
    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("returns null (not throws) on failure", async () => {
    const cb = makeBreaker();
    const result = await cb.execute(() => Promise.reject(new Error("boom")));
    expect(result).toBeNull();
  });
});

describe("EccCircuitBreaker — OPEN state transition", () => {
  it("opens after failureThreshold consecutive failures", async () => {
    const cb = makeBreaker();

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }

    expect(cb.currentState).toBe("OPEN");
  });

  it("fast-fails (returns null immediately) when OPEN", async () => {
    const cb = makeBreaker();
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }

    const fn = vi.fn().mockResolvedValue("result");
    const result = await cb.execute(fn);

    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not count non-consecutive failures toward threshold", async () => {
    const cb = makeBreaker();

    await cb.execute(() => Promise.reject(new Error("fail")));
    await cb.execute(() => Promise.resolve("ok")); // resets count
    await cb.execute(() => Promise.reject(new Error("fail")));

    expect(cb.currentState).toBe("CLOSED");
  });
});

describe("EccCircuitBreaker — HALF_OPEN and recovery", () => {
  it("transitions to HALF_OPEN after recovery timeout", async () => {
    const cb = makeBreaker({ recoveryTimeoutMs: 10 });

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }
    expect(cb.currentState).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 20));

    // Next call should probe (HALF_OPEN)
    const result = await cb.execute(() => Promise.resolve("probe ok"));
    expect(result).toBe("probe ok");
    expect(cb.currentState).toBe("HALF_OPEN");
  });

  it("closes after successThreshold successes in HALF_OPEN", async () => {
    const cb = makeBreaker({ recoveryTimeoutMs: 10, successThreshold: 2 });

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }

    await new Promise((r) => setTimeout(r, 20));

    await cb.execute(() => Promise.resolve("s1"));
    expect(cb.currentState).toBe("HALF_OPEN");

    await cb.execute(() => Promise.resolve("s2"));
    expect(cb.currentState).toBe("CLOSED");
  });

  it("re-opens on failure in HALF_OPEN", async () => {
    const cb = makeBreaker({ recoveryTimeoutMs: 10 });

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }

    await new Promise((r) => setTimeout(r, 20));

    await cb.execute(() => Promise.reject(new Error("probe fail")));
    expect(cb.currentState).toBe("OPEN");
  });
});

describe("EccCircuitBreaker — executeWithTimeout", () => {
  it("returns null when function exceeds timeout", async () => {
    const cb = makeBreaker();
    const slow = () => new Promise<string>((r) => setTimeout(() => r("done"), 200));

    const result = await cb.executeWithTimeout(slow, 10);
    expect(result).toBeNull();
  });

  it("returns result when function completes within timeout", async () => {
    const cb = makeBreaker();
    const fast = () => Promise.resolve("fast");

    const result = await cb.executeWithTimeout(fast, 500);
    expect(result).toBe("fast");
  });
});

describe("EccCircuitBreaker — getStatus / reset", () => {
  it("getStatus reflects current state", async () => {
    const cb = makeBreaker();
    const status = cb.getStatus();

    expect(status.state).toBe("CLOSED");
    expect(status.failureCount).toBe(0);
    expect(status.lastFailureTime).toBeNull();
  });

  it("reset restores CLOSED state", async () => {
    const cb = makeBreaker();

    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error("fail")));
    }
    expect(cb.currentState).toBe("OPEN");

    cb.reset();
    expect(cb.currentState).toBe("CLOSED");
    expect(cb.getStatus().failureCount).toBe(0);
  });
});
