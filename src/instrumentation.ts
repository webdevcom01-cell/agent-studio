export async function register(): Promise<void> {
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
