import { z } from "zod";
import { logger } from "@/lib/logger";

// Treat empty strings as undefined for optional keys
const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_GITHUB_ID: optionalStr,
  AUTH_GITHUB_SECRET: optionalStr,
  AUTH_GOOGLE_ID: optionalStr,
  AUTH_GOOGLE_SECRET: optionalStr,
  // Generic OIDC provider (Okta, Azure AD, Keycloak, Auth0, …)
  AUTH_OIDC_ISSUER: optionalStr,
  AUTH_OIDC_CLIENT_ID: optionalStr,
  AUTH_OIDC_CLIENT_SECRET: optionalStr,
  AUTH_OIDC_DISPLAY_NAME: optionalStr,
  ANTHROPIC_API_KEY: optionalStr,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalStr,
  GROQ_API_KEY: optionalStr,
  MISTRAL_API_KEY: optionalStr,
  MOONSHOT_API_KEY: optionalStr,
  COHERE_API_KEY: optionalStr,
  CRON_SECRET: optionalStr,
  NOTION_CLIENT_ID: optionalStr,
  NOTION_CLIENT_SECRET: optionalStr,
  GOOGLE_WORKSPACE_CLIENT_ID: optionalStr,
  GOOGLE_WORKSPACE_CLIENT_SECRET: optionalStr,
  REDIS_URL: optionalStr,
  WEBHOOK_ENCRYPTION_KEY: optionalStr,
  OAUTH_ENCRYPTION_KEY: optionalStr,
  DATABASE_READ_URL: optionalStr,
  CDN_URL: optionalStr,
  OBSIDIAN_VAULT_REPO: optionalStr,
  OBSIDIAN_GITHUB_TOKEN: optionalStr,
  OBSIDIAN_VAULT_BRANCH: optionalStr,
  OBSIDIAN_VAULT_PATH: optionalStr,
  E2B_API_KEY: optionalStr,
  ECC_MCP_URL: optionalStr,
  ECC_ENABLED: optionalStr,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalStr,
  OTEL_SERVICE_NAME: optionalStr,
  TAVILY_API_KEY: optionalStr,
  BRAVE_SEARCH_API_KEY: optionalStr,
  FAL_API_KEY: optionalStr,
  STABILITY_API_KEY: optionalStr,
  ELEVENLABS_API_KEY: optionalStr,
  DEEPGRAM_API_KEY: optionalStr,
  DATABASE_QUERY_MAX_ROWS: optionalStr,
  DATABASE_QUERY_TIMEOUT_MS: optionalStr,
  AWS_ACCESS_KEY_ID: optionalStr,
  AWS_SECRET_ACCESS_KEY: optionalStr,
  AWS_REGION: optionalStr,
  AWS_S3_BUCKET: optionalStr,
  MCP_TASK_POLL_INTERVAL_MS: optionalStr,
  MCP_TASK_MAX_DURATION_MS: optionalStr,
  GUARDRAILS_PROVIDER: optionalStr,
  AZURE_CONTENT_SAFETY_KEY: optionalStr,
  AZURE_CONTENT_SAFETY_ENDPOINT: optionalStr,
  CODE_INTERPRETER_TIMEOUT_MS: optionalStr,
  CODE_INTERPRETER_MEMORY_MB: optionalStr,
  RESEND_API_KEY: optionalStr,
  RESEND_FROM_EMAIL: optionalStr,
  SENTRY_DSN: optionalStr,
  /** Comma-separated list of user IDs allowed to call admin endpoints.
   *  When unset, admin endpoints fall back to any authenticated user (dev-friendly). */
  ADMIN_USER_IDS: optionalStr,
  /** Base URL of local Ollama server — enables local model inference.
   *  Default: http://localhost:11434/v1  (only works in local dev, not Railway). */
  OLLAMA_BASE_URL: optionalStr,
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  source: Record<string, string | undefined> = process.env
): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    const message = `Missing or invalid environment variables:\n${missing}\n\nSee .env.example for required variables.`;
    logger.error(message);
    throw new Error(message);
  }

  if (!result.data.AUTH_GITHUB_ID && !result.data.AUTH_GOOGLE_ID) {
    logger.warn("No OAuth providers configured — AUTH_GITHUB_ID or AUTH_GOOGLE_ID required for login");
  }
  if (!result.data.ANTHROPIC_API_KEY) {
    logger.warn("ANTHROPIC_API_KEY not set — Anthropic models will be unavailable");
  }
  if (!result.data.GOOGLE_GENERATIVE_AI_API_KEY) {
    logger.warn("GOOGLE_GENERATIVE_AI_API_KEY not set — Gemini models will be unavailable");
  }
  if (!result.data.GROQ_API_KEY) {
    logger.warn("GROQ_API_KEY not set — Groq models will be unavailable");
  }
  if (!result.data.MISTRAL_API_KEY) {
    logger.warn("MISTRAL_API_KEY not set — Mistral models will be unavailable");
  }
  if (!result.data.MOONSHOT_API_KEY) {
    logger.warn("MOONSHOT_API_KEY not set — Kimi models will be unavailable");
  }

  return result.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = validateEnv();
  }
  return cached;
}
