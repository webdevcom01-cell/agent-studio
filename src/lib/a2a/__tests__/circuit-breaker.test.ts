import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  resetCircuits,
  checkDepthLimit,
  checkCycleDetection,
  getCircuitState,
  MAX_AGENT_DEPTH,
  A2A_ERROR_CODES,
  A2ACircuitError,
} from "../circuit-breaker";

beforeEach(() => {
  resetCircuits();
});

describe("CircuitBreaker", () => {
  describe("basic state transitions", () => {
    it("allows calls when circuit is closed", () => {
      expect(() => checkCircuit("a1", "a2")).not.toThrow();
      expect(getCircuitState("a1", "a2")).toBe("closed");
    });

    it("opens circuit after 3 consecutive failures", () => {
      recordFailure("a1", "a2");
      recordFailure("a1", "a2");
      expect(() => checkCircuit("a1", "a2")).not.toThrow();

      recordFailure("a1", "a2");
      expect(() => checkCircuit("a1", "a2")).toThrow(A2ACircuitError);
      expect(getCircuitState("a1", "a2")).toBe("open");
    });

    it("throws A2ACircuitError with CIRCUIT_OPEN code when open", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");

      try {
        checkCircuit("a1", "a2");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(A2ACircuitError);
        const error = err as A2ACircuitError;
        expect(error.code).toBe(A2A_ERROR_CODES.CIRCUIT_OPEN);
        expect(error.data?.calleeAgentId).toBe("a2");
        expect(error.data?.state).toBe("open");
      }
    });

    it("resets to closed on success", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");
      recordSuccess("a1", "a2");
      expect(() => checkCircuit("a1", "a2")).not.toThrow();
      expect(getCircuitState("a1", "a2")).toBe("closed");
    });

    it("does not affect other agent pairs", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");
      expect(() => checkCircuit("a1", "a3")).not.toThrow();
      expect(() => checkCircuit("a2", "a1")).not.toThrow();
    });
  });

  describe("OPEN → HALF_OPEN recovery", () => {
    it("transitions to half-open after reset timeout", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");
      expect(() => checkCircuit("a1", "a2")).toThrow();

      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      // First call after timeout → transitions to half-open and allows probe
      expect(() => checkCircuit("a1", "a2")).not.toThrow();

      vi.useRealTimers();
    });

    it("allows exactly one probe call in half-open state", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");

      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      // First call goes through (probe)
      expect(() => checkCircuit("a1", "a2")).not.toThrow();

      // Second call rejected — probe already in flight
      try {
        checkCircuit("a1", "a2");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(A2ACircuitError);
        expect((err as A2ACircuitError).code).toBe(A2A_ERROR_CODES.PROBE_IN_FLIGHT);
      }

      vi.useRealTimers();
    });

    it("probe success → circuit closes", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");

      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);
      checkCircuit("a1", "a2"); // probe goes through

      recordSuccess("a1", "a2");
      expect(getCircuitState("a1", "a2")).toBe("closed");
      expect(() => checkCircuit("a1", "a2")).not.toThrow();

      vi.useRealTimers();
    });

    it("probe failure → circuit reopens", () => {
      for (let i = 0; i < 3; i++) recordFailure("a1", "a2");

      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);
      checkCircuit("a1", "a2"); // probe goes through

      recordFailure("a1", "a2"); // probe fails
      expect(getCircuitState("a1", "a2")).toBe("open");
      expect(() => checkCircuit("a1", "a2")).toThrow(A2ACircuitError);

      vi.useRealTimers();
    });
  });

  describe("JSON-RPC 2.0 error serialization", () => {
    it("toJsonRpc() returns correct structure", () => {
      const err = new A2ACircuitError({
        code: A2A_ERROR_CODES.CIRCUIT_OPEN,
        message: "Circuit open",
        data: { calleeAgentId: "a2" },
      });

      const rpc = err.toJsonRpc();
      expect(rpc.code).toBe(-32001);
      expect(rpc.message).toBe("Circuit open");
      expect(rpc.data).toEqual({ calleeAgentId: "a2" });
    });

    it("error codes are in JSON-RPC 2.0 server error range", () => {
      for (const code of Object.values(A2A_ERROR_CODES)) {
        expect(code).toBeGreaterThanOrEqual(-32099);
        expect(code).toBeLessThanOrEqual(-32000);
      }
    });
  });
});

describe("checkDepthLimit", () => {
  it("MAX_AGENT_DEPTH is 10", () => {
    expect(MAX_AGENT_DEPTH).toBe(10);
  });

  it("allows calls within depth limit", () => {
    expect(() => checkDepthLimit(0, ["a1"])).not.toThrow();
    expect(() => checkDepthLimit(9, ["a1"])).not.toThrow();
  });

  it("throws at max depth", () => {
    try {
      checkDepthLimit(10, ["a1", "a2", "a3"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(A2ACircuitError);
      const error = err as A2ACircuitError;
      expect(error.code).toBe(A2A_ERROR_CODES.DEPTH_LIMIT_EXCEEDED);
      expect(error.data?.depth).toBe(10);
      expect(error.data?.maxDepth).toBe(10);
    }
  });

  it("throws above max depth", () => {
    expect(() => checkDepthLimit(15, ["a1"])).toThrow(A2ACircuitError);
  });
});

describe("checkCycleDetection", () => {
  it("allows non-circular calls", () => {
    expect(() => checkCycleDetection("a3", ["a1", "a2"])).not.toThrow();
  });

  it("detects direct cycle (A → A)", () => {
    try {
      checkCycleDetection("a1", ["a1"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(A2ACircuitError);
      const error = err as A2ACircuitError;
      expect(error.code).toBe(A2A_ERROR_CODES.CYCLE_DETECTED);
      expect(error.data?.cycle).toBe("a1 → a1");
    }
  });

  it("detects indirect cycle (A → B → C → A)", () => {
    try {
      checkCycleDetection("a1", ["a1", "a2", "a3"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(A2ACircuitError);
      const error = err as A2ACircuitError;
      expect(error.code).toBe(A2A_ERROR_CODES.CYCLE_DETECTED);
      expect(error.data?.cycle).toBe("a1 → a2 → a3 → a1");
    }
  });

  it("detects mid-chain cycle (A → B → C → B)", () => {
    expect(() => checkCycleDetection("a2", ["a1", "a2", "a3"])).toThrow(
      A2ACircuitError
    );
  });

  it("allows empty call stack", () => {
    expect(() => checkCycleDetection("a1", [])).not.toThrow();
  });
});
