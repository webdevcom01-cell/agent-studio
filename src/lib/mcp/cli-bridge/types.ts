import { z } from "zod";

export const cliParameterSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  flag: z.string().optional(),
});

export const cliCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  parameters: z.array(cliParameterSchema).default([]),
  subcommands: z.array(z.string()).default([]),
});

export const cliConfigSchema = z.object({
  cliPath: z.string().min(1),
  cliName: z.string().min(1),
  version: z.string().default("unknown"),
  commands: z.array(cliCommandSchema).default([]),
  workingDirectory: z.string().optional(),
  envVars: z.record(z.string()).default({}),
  timeout: z.number().min(1000).max(300_000).default(30_000),
  sessionMode: z.enum(["oneshot", "repl"]).default("oneshot"),
});

export type CLIParameter = z.infer<typeof cliParameterSchema>;
export type CLICommand = z.infer<typeof cliCommandSchema>;
export type CLIConfig = z.infer<typeof cliConfigSchema>;

export interface CLIToolSchema {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
  }>;
}

export interface CLIExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface CLISessionInfo {
  id: string;
  cliName: string;
  createdAt: number;
  lastUsedAt: number;
  isAlive: boolean;
}
