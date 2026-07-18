/**
 * Eval regression alert configuration (B6/G2).
 *
 * Read from env at call time so the kill-switch and thresholds are live —
 * flipping EVAL_ALERTS_ENABLED needs no code deploy. Fractions clamp to [0, 1].
 */

const DEFAULT_REGRESSION_DELTA = 0.15;
const DEFAULT_REGRESSION_FLOOR = 0.5;

function parseFraction(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function evalAlertsEnabled(): boolean {
  return process.env.EVAL_ALERTS_ENABLED !== "false";
}

export function getRegressionDelta(): number {
  return parseFraction(process.env.EVAL_REGRESSION_THRESHOLD, DEFAULT_REGRESSION_DELTA);
}

export function getRegressionFloor(): number {
  return parseFraction(process.env.EVAL_REGRESSION_FLOOR, DEFAULT_REGRESSION_FLOOR);
}
