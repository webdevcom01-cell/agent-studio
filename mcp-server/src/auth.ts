export type McpAuthMode = "ADMIN" | "USER";

export interface McpAuthContext {
  mode: McpAuthMode;
  // ADMIN mode: direktan DB pristup (samo za interne/dev svrhe)
  // USER mode: API ključ → REST API pozivi (za krajnje korisnike)
  apiKey?: string;
  baseUrl?: string;
  userId?: string;
}

export function resolveAuthMode(): McpAuthMode {
  if (process.env.AGENT_STUDIO_API_KEY && process.env.AGENT_STUDIO_URL) {
    return "USER";
  }
  if (process.env.DATABASE_URL) {
    return "ADMIN";
  }
  throw new Error(
    "MCP Server: set either (AGENT_STUDIO_API_KEY + AGENT_STUDIO_URL) or DATABASE_URL",
  );
}

/**
 * Validate an API key against the Agent Studio /api/keys/validate endpoint.
 * Returns userId on success, null on any error or invalid key.
 */
export async function validateApiKey(
  apiKey: string,
  baseUrl: string,
): Promise<{ userId: string; organizationId: string | null } | null> {
  try {
    const url = baseUrl.replace(/\/$/, "");
    const res = await fetch(`${url}/api/keys/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { valid?: boolean; userId?: string; organizationId?: string };
    if (!data.valid || !data.userId) return null;
    return { userId: data.userId, organizationId: data.organizationId ?? null };
  } catch {
    return null;
  }
}
