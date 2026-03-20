/**
 * Circuit breaker for agent-to-agent calls.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED (on probe success) or OPEN (on probe failure)
 *
 * Also provides depth limiting and visited-agents cycle detection
 * to prevent runaway recursion in agent chains.
 *
 * Error codes follow JSON-RPC 2.0 convention (-32000 to -32099 for server errors).
 */

type CircuitState = "closed" | "open" | "half-open";

interface CircuitStats {
  failures: number;
  lastFailureAt: number;
  state: CircuitState;
  /** Number of probe calls allowed in half-open state (1 at a time) */
  probeInFlight: boolean;
}

/** JSON-RPC 2.0 server error codes for A2A circuit breaker states */
export const A2A_ERROR_CODES = {
  CIRCUIT_OPEN: -32001,
  DEPTH_LIMIT_EXCEEDED: -32002,
  CYCLE_DETECTED: -32003,
  RATE_LIMITED: -32004,
  PROBE_IN_FLIGHT: -32005,
} as const;

export interface A2AError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export class A2ACircuitError extends Error {
  readonly code: number;
  readonly data?: Record<string, unknown>;

  constructor(error: A2AError) {
    super(error.message);
    this.name = "A2ACircuitError";
    this.code = error.code;
    this.data = error.data;
  }

  toJsonRpc(): { code: number; message: string; data?: Record<string, unknown> } {
    return { code: this.code, message: this.message, data: this.data };
  }
}

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 60_000;

/** Configurable max depth for agent call chains (default 10) */
export const MAX_AGENT_DEPTH = 10;

const circuits = new Map<string, CircuitStats>();

/**
 * Checks circuit breaker state for a caller→callee pair.
 * In HALF_OPEN state, allows exactly one probe call through.
 * Throws A2ACircuitError with JSON-RPC 2.0 error codes.
 */
export function checkCircuit(
  callerAgentId: string,
  calleeAgentId: string
): void {
  const key = `${callerAgentId}:${calleeAgentId}`;
  const stats = circuits.get(key);

  if (!stats || stats.state === "closed") return;

  if (stats.state === "open") {
    const elapsed = Date.now() - stats.lastFailureAt;
    if (elapsed > RESET_TIMEOUT_MS) {
      stats.state = "half-open";
      stats.probeInFlight = false;
      // Allow the first probe call through
      stats.probeInFlight = true;
      return;
    }
    const retryIn = Math.ceil((RESET_TIMEOUT_MS - elapsed) / 1000);
    throw new A2ACircuitError({
      code: A2A_ERROR_CODES.CIRCUIT_OPEN,
      message: `Circuit open for ${calleeAgentId} — too many recent failures. Retry in ${retryIn}s`,
      data: { calleeAgentId, retryInSeconds: retryIn, state: "open" },
    });
  }

  if (stats.state === "half-open") {
    if (stats.probeInFlight) {
      // A probe is already in flight — reject additional calls
      throw new A2ACircuitError({
        code: A2A_ERROR_CODES.PROBE_IN_FLIGHT,
        message: `Circuit half-open for ${calleeAgentId} — probe call in progress`,
        data: { calleeAgentId, state: "half-open" },
      });
    }
    // Allow one probe call
    stats.probeInFlight = true;
  }
}

/**
 * Records a successful call. Resets circuit to closed.
 */
export function recordSuccess(
  callerAgentId: string,
  calleeAgentId: string
): void {
  const key = `${callerAgentId}:${calleeAgentId}`;
  circuits.delete(key);
}

/**
 * Records a failed call. Opens circuit after threshold failures.
 * In half-open state, a failure immediately reopens the circuit.
 */
export function recordFailure(
  callerAgentId: string,
  calleeAgentId: string
): void {
  const key = `${callerAgentId}:${calleeAgentId}`;
  const stats = circuits.get(key) ?? {
    failures: 0,
    lastFailureAt: 0,
    state: "closed" as CircuitState,
    probeInFlight: false,
  };

  stats.failures += 1;
  stats.lastFailureAt = Date.now();

  if (stats.state === "half-open") {
    // Probe failed — reopen circuit
    stats.state = "open";
    stats.probeInFlight = false;
  } else if (stats.failures >= FAILURE_THRESHOLD) {
    stats.state = "open";
  }

  circuits.set(key, stats);
}

/**
 * Checks depth limit for an agent call chain.
 * Throws A2ACircuitError if depth exceeds MAX_AGENT_DEPTH.
 */
export function checkDepthLimit(
  depth: number,
  callStack: string[]
): void {
  if (depth >= MAX_AGENT_DEPTH) {
    throw new A2ACircuitError({
      code: A2A_ERROR_CODES.DEPTH_LIMIT_EXCEEDED,
      message: `Max agent call depth (${MAX_AGENT_DEPTH}) exceeded. Chain: ${callStack.join(" → ")}`,
      data: { depth, maxDepth: MAX_AGENT_DEPTH, callStack },
    });
  }
}

/**
 * Checks for circular calls in the agent chain.
 * Throws A2ACircuitError if the target agent is already in the call stack.
 */
export function checkCycleDetection(
  targetAgentId: string,
  callStack: string[]
): void {
  if (callStack.includes(targetAgentId)) {
    const cycle = [...callStack, targetAgentId].join(" → ");
    throw new A2ACircuitError({
      code: A2A_ERROR_CODES.CYCLE_DETECTED,
      message: `Circular agent call detected: ${cycle}`,
      data: { targetAgentId, callStack, cycle },
    });
  }
}

/**
 * Returns the current state of a circuit (for monitoring/UI).
 */
export function getCircuitState(
  callerAgentId: string,
  calleeAgentId: string
): CircuitState {
  const key = `${callerAgentId}:${calleeAgentId}`;
  const stats = circuits.get(key);
  return stats?.state ?? "closed";
}

export function resetCircuits(): void {
  circuits.clear();
}
