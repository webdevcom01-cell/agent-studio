import type { CLIGenerationStatus } from "@/generated/prisma";

export interface PhaseResult {
  phase: number;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface PipelineConfig {
  applicationName: string;
  description?: string;
  capabilities?: string[];
  platform?: string;
}

export interface PipelineProgress {
  generationId: string;
  status: CLIGenerationStatus;
  currentPhase: number;
  phases: PhaseResult[];
  cliConfig?: unknown;
  errorMessage?: string;
}

export type PhaseExecutor = (
  config: PipelineConfig,
  previousResults: PhaseResult[],
) => Promise<unknown>;

export const PIPELINE_PHASES = [
  { phase: 0, name: "analyze", label: "Analyzing Application" },
  { phase: 1, name: "design", label: "Designing CLI Interface" },
  { phase: 2, name: "implement", label: "Implementing CLI Commands" },
  { phase: 3, name: "plan-tests", label: "Planning Tests" },
  { phase: 4, name: "write-tests", label: "Writing Tests" },
  { phase: 5, name: "document", label: "Generating Documentation" },
  { phase: 6, name: "publish", label: "Publishing CLI Bridge" },
] as const;

export const PHASE_COUNT = PIPELINE_PHASES.length;

export const STATUS_FOR_PHASE: Record<number, CLIGenerationStatus> = {
  0: "ANALYZING",
  1: "DESIGNING",
  2: "IMPLEMENTING",
  3: "TESTING",
  4: "TESTING",
  5: "DOCUMENTING",
  6: "PUBLISHING",
};
