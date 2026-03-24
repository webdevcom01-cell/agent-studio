import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENV_PATH = join(process.cwd(), ".env");

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function checkEnvExists(): boolean {
  return existsSync(ENV_PATH);
}

export function writeEnvFile(vars: Record<string, string>): void {
  const lines = Object.entries(vars).map(
    ([key, value]) => `${key}="${value}"`
  );
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}
