import type { CLIGenerationStatus } from "@/generated/prisma";

export type GeneratedFiles = Record<string, string>;

export interface AIPhaseOutput {
  result: unknown;
  generatedFiles?: GeneratedFiles;
  tokensUsed?: { input: number; output: number };
  /** Which AI model actually ran (primary or fallback). */
  modelUsed?: string;
}

export interface PhaseResult {
  phase: number;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
  generatedFiles?: GeneratedFiles;
  tokensUsed?: { input: number; output: number };
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
  { phase: 3, name: "write-tests", label: "Writing Tests" },
  { phase: 4, name: "document", label: "Generating Documentation" },
  { phase: 5, name: "publish", label: "Publishing CLI Bridge" },
] as const;

export const PHASE_COUNT = PIPELINE_PHASES.length;

export const STATUS_FOR_PHASE: Record<number, CLIGenerationStatus> = {
  0: "ANALYZING",
  1: "DESIGNING",
  2: "IMPLEMENTING",
  3: "TESTING",
  4: "DOCUMENTING",
  5: "PUBLISHING",
};

/** Generations not updated within this window are considered stuck. */
export const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Creates the initial phases array for a new generation (all pending). */
export function createInitialPhases(): PhaseResult[] {
  return PIPELINE_PHASES.map(({ phase, name }) => ({
    phase,
    name,
    status: "pending" as const,
  }));
}
