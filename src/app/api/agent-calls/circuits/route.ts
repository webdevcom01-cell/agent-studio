/**
 * GET /api/agent-calls/circuits
 *
 * Returns real-time circuit breaker states for all agent pairs.
 * Used by the agent-call-monitor UI for dashboard visualization.
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { getAllCircuitStates } from "@/lib/a2a/circuit-breaker";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const circuits = getAllCircuitStates();

  const parsed = circuits.map((c) => {
    const [caller, callee] = c.key.split(":");
    return {
      callerAgentId: caller,
      calleeAgentId: callee,
      state: c.state,
      failures: c.failures,
      lastFailureAt: c.lastFailureAt > 0 ? new Date(c.lastFailureAt).toISOString() : null,
      probeInFlight: c.probeInFlight,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      circuits: parsed,
      summary: {
        total: parsed.length,
        open: parsed.filter((c) => c.state === "open").length,
        halfOpen: parsed.filter((c) => c.state === "half-open").length,
        closed: parsed.filter((c) => c.state === "closed").length,
      },
    },
  });
}
