type CircuitState = "closed" | "open" | "half-open";

interface CircuitStats {
  failures: number;
  lastFailureAt: number;
  state: CircuitState;
}

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 60_000;

const circuits = new Map<string, CircuitStats>();

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
      return;
    }
    const retryIn = Math.ceil((RESET_TIMEOUT_MS - elapsed) / 1000);
    throw new Error(
      `Circuit open for ${calleeAgentId} — too many recent failures. Retry in ${retryIn}s`
    );
  }
}

export function recordSuccess(
  callerAgentId: string,
  calleeAgentId: string
): void {
  const key = `${callerAgentId}:${calleeAgentId}`;
  circuits.delete(key);
}

export function recordFailure(
  callerAgentId: string,
  calleeAgentId: string
): void {
  const key = `${callerAgentId}:${calleeAgentId}`;
  const stats = circuits.get(key) ?? {
    failures: 0,
    lastFailureAt: 0,
    state: "closed" as CircuitState,
  };
  stats.failures += 1;
  stats.lastFailureAt = Date.now();
  if (stats.failures >= FAILURE_THRESHOLD) {
    stats.state = "open";
  }
  circuits.set(key, stats);
}

export function resetCircuits(): void {
  circuits.clear();
}
