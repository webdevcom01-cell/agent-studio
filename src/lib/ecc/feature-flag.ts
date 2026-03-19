/**
 * ECC Feature Flag
 *
 * Global killswitch via ECC_ENABLED env var.
 * Per-agent flag via Agent.eccEnabled field.
 *
 * Default: disabled. Set ECC_ENABLED=true on Railway to activate.
 */

export function isECCEnabled(): boolean {
  return process.env.ECC_ENABLED === "true";
}

export function isECCEnabledForAgent(eccEnabled: boolean): boolean {
  return isECCEnabled() && eccEnabled;
}
