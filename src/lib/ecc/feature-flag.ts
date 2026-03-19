/**
 * ECC Feature Flag
 *
 * Global killswitch via ECC_ENABLED env var.
 * Per-agent flag via Agent.eccEnabled field.
 *
 * Default: enabled (ECC_ENABLED !== "false").
 */

export function isECCEnabled(): boolean {
  return process.env.ECC_ENABLED !== "false";
}

export function isECCEnabledForAgent(eccEnabled: boolean): boolean {
  return isECCEnabled() && eccEnabled;
}
