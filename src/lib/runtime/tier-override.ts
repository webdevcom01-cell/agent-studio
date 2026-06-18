/**
 * Per-node cost-tier override resolution (N4).
 *
 * The `cost_monitor` node sets `__model_tier_override` in flow variables to push
 * downstream AI nodes onto a cheaper model tier under budget pressure. That
 * override is global and sticky for the rest of the run. A node can opt OUT by
 * setting `ignoreTierOverride: true` in its data — useful for quality-critical
 * generation that must NOT be silently downgraded to a cheaper model.
 *
 * Returns the active tier, or `undefined` when there is no (valid) override or
 * the node has opted out.
 */
export type ModelTier = "fast" | "balanced" | "powerful";

export function resolveEffectiveTierOverride(
  nodeData: Record<string, unknown>,
  variables: Record<string, unknown>,
): ModelTier | undefined {
  // Explicit opt-out must be exactly `true` (not just truthy).
  if (nodeData.ignoreTierOverride === true) return undefined;

  const o = variables.__model_tier_override;
  return o === "fast" || o === "balanced" || o === "powerful" ? o : undefined;
}
