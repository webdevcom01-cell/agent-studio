/**
 * config.ts — INTENTIONALLY VULNERABLE (for DevOps Swarm demo)
 * Vulnerability: Hardcoded Secrets
 * CWE-798: Use of Hard-coded Credentials
 *
 * NOTE: These are FAKE placeholder strings used to demonstrate CWE-798.
 * They follow the format of real credentials but are not valid.
 * A real scanner (semgrep CWE-798 rule) will flag the hardcoding pattern.
 */

// ❌ VULNERABLE: Hardcoded credentials — should be loaded from environment variables
export const config = {
  database: {
    host: "db.production.internal",
    password: "HARDCODED_DB_PASSWORD_DEMO",          // CWE-798: never hardcode
    connectionString: "postgresql://admin:HARDCODED_PASS@localhost:5432/mydb",
  },
  api: {
    stripeKey: "sk_live_DEMO_PLACEHOLDER_NOT_REAL",   // CWE-798: use process.env.STRIPE_KEY
    openaiKey: "DEMO_OPENAI_KEY_PLACEHOLDER_ONLY",    // CWE-798: use process.env.OPENAI_API_KEY
    jwtSecret: "HARDCODED_JWT_SECRET_DEMO_INSECURE",  // CWE-798: use random 256-bit secret from env
    adminToken: "HARDCODED_ADMIN_TOKEN_DEMO",         // CWE-798: rotate and store in secrets manager
  },
  aws: {
    accessKeyId: "AKIAIOSFODNN7EXAMPLEFAKE",          // CWE-798: use IAM roles instead
    secretAccessKey: "DEMO_AWS_SECRET_PLACEHOLDER_NOT_REAL_KEY",
    region: "us-east-1",
  }
};

// ✅ CORRECT approach (for reference):
// export const config = {
//   api: {
//     stripeKey: process.env.STRIPE_KEY,
//     openaiKey: process.env.OPENAI_API_KEY,
//     jwtSecret: process.env.JWT_SECRET,
//   }
// };
