/**
 * ECC MCP Circuit Breaker
 *
 * Protects against Python MCP server failures with three states:
 *   CLOSED   → requests pass through normally
 *   OPEN     → requests fail fast (no calls to Python server)
 *   HALF_OPEN→ one probe request allowed to test recovery
 *
 * 2026 enterprise pattern:
 *   - Failure threshold:   5 consecutive errors → OPEN
 *   - Recovery timeout:    30 s before HALF_OPEN probe
 *   - Success threshold:   2 consecutive successes in HALF_OPEN → CLOSED
 *   - Graceful fallback:   all callers get null result (not an error)
 */

import { logger } from "@/lib/logger";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number;   // default 5
  recoveryTimeoutMs?: number;  // default 30_000
  successThreshold?: number;   // default 2
  name?: string;
}

export class EccCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
    this.name = options.name ?? "ecc-mcp";
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute an async call through the circuit breaker.
   * Returns null (graceful degradation) instead of throwing when circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.state = "HALF_OPEN";
        logger.info("ECC circuit breaker: HALF_OPEN probe", { name: this.name });
      } else {
        logger.warn("ECC circuit breaker: OPEN — fast fail", { name: this.name });
        return null;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      return null;  // graceful degradation — never propagate to caller
    }
  }

  /**
   * Wrap a call with a timeout. Returns null if the timeout expires.
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | null> {
    return this.execute(() =>
      Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`ECC MCP timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]),
    );
  }

  // ── State transitions ──────────────────────────────────────────────────────

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = "CLOSED";
        this.successCount = 0;
        this.lastFailureTime = null;
        logger.info("ECC circuit breaker: CLOSED (recovered)", { name: this.name });
      }
    }
  }

  private onFailure(err: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    logger.warn("ECC circuit breaker: failure recorded", {
      name: this.name,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: String(err),
    });

    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      logger.error("ECC circuit breaker: OPEN (Python MCP server degraded)", new Error(String(err)), {
        name: this.name,
        failureCount: this.failureCount,
      });
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== null &&
      Date.now() - this.lastFailureTime >= this.recoveryTimeoutMs
    );
  }

  /** For testing / health endpoint */
  getStatus(): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /** Manually reset — for testing only */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

// ── Singleton for ECC MCP server ──────────────────────────────────────────────
// Shared across all requests in the same Node.js process.

export const eccMcpCircuitBreaker = new EccCircuitBreaker({
  name: "ecc-mcp-python",
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  successThreshold: 2,
});
