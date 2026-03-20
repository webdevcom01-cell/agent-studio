import { z } from "zod";

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
  ANTHROPIC_API_KEY: optionalStr,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalStr,
  GROQ_API_KEY: optionalStr,
  MISTRAL_API_KEY: optionalStr,
  MOONSHOT_API_KEY: optionalStr,
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
  ECC_MCP_URL: optionalStr,
  ECC_ENABLED: optionalStr,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalStr,
  OTEL_SERVICE_NAME: optionalStr,
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
    console.error(message);
    throw new Error(message);
  }

  if (!result.data.AUTH_GITHUB_ID && !result.data.AUTH_GOOGLE_ID) {
    console.warn("No OAuth providers configured — AUTH_GITHUB_ID or AUTH_GOOGLE_ID required for login");
  }
  if (!result.data.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set — Anthropic models will be unavailable");
  }
  if (!result.data.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.warn("GOOGLE_GENERATIVE_AI_API_KEY not set — Gemini models will be unavailable");
  }
  if (!result.data.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY not set — Groq models will be unavailable");
  }
  if (!result.data.MISTRAL_API_KEY) {
    console.warn("MISTRAL_API_KEY not set — Mistral models will be unavailable");
  }
  if (!result.data.MOONSHOT_API_KEY) {
    console.warn("MOONSHOT_API_KEY not set — Kimi models will be unavailable");
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

export function resetEnvCache(): void {
  cached = null;
}
