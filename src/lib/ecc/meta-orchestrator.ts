import { logger } from "@/lib/logger";

interface TaskAnalysis {
  taskType: string;
  complexity: "simple" | "moderate" | "complex";
  pipeline: string[];
  rationale: string;
  subtasks?: Array<{
    description: string;
    requiredAgent?: string;
    estimatedComplexity: "simple" | "moderate" | "complex";
  }>;
}

/**
 * Enriched pipeline step returned by buildPipelineConfig().
 * Infrastructure nodes (project_context, sandbox_verify) have type set accordingly.
 * Agent nodes carry optional outputSchema from the agent template metadata.
 */
export interface PipelineStep {
  id: string;
  type: "agent" | "project_context" | "sandbox_verify";
  outputSchema?: string;
  contextRequired?: boolean;
}

const TASK_TYPES = [
  "new-feature",
  "bug-fix",
  "security-audit",
  "code-review",
  "architecture",
  "documentation",
  "performance",
  "refactor",
  "testing",
  "deployment",
  "api-design",
  "database",
  "frontend",
] as const;

/**
 * Infrastructure nodes that are not agents — excluded from complexity calculation.
 * These run as built-in pipeline nodes, not as agent calls.
 */
const INFRASTRUCTURE_NODES = new Set(["project_context", "sandbox_verify", "static_analysis", "pr_generation"]);

/**
 * Maps agent IDs to their default output schema.
 * Derived from defaultOutputSchema fields in ecc-agent-templates.json.
 * Update this map when adding new agents with structured output.
 */
const AGENT_OUTPUT_SCHEMA_MAP: Record<string, string> = {
  "ecc-architect":          "ArchitectureOutput",
  "ecc-code-reviewer":      "PRGateOutput",
  "ecc-security-reviewer":  "PRGateOutput",
  "ecc-reality-checker":    "PRGateOutput",
};

/**
 * Maps agent IDs that require project context to be injected before them.
 * Derived from contextRequired fields in ecc-agent-templates.json.
 */
const AGENT_CONTEXT_REQUIRED = new Set([
  "ecc-code-reviewer",
  "ecc-security-reviewer",
  "ecc-reality-checker",
]);

const ROUTING_TABLE: Record<string, string[]> = {
  "new-feature":     ["project_context", "ecc-planner", "ecc-tdd-guide", "ecc-implementer", "sandbox_verify", "static_analysis", "ecc-code-reviewer", "ecc-security-reviewer", "pr_generation"],
  "bug-fix":         ["project_context", "ecc-tdd-guide", "ecc-implementer", "sandbox_verify", "static_analysis", "ecc-code-reviewer", "ecc-security-reviewer", "pr_generation"],
  "security-audit":  ["project_context", "ecc-security-reviewer", "ecc-security-engineer"],
  "code-review":     ["project_context", "ecc-code-reviewer"],
  "architecture":    ["ecc-architect", "ecc-planner"],
  "documentation":   ["ecc-doc-updater"],
  "performance":     ["ecc-performance-benchmarker", "ecc-architect"],
  "refactor":        ["project_context", "ecc-planner", "ecc-refactor-cleaner", "sandbox_verify", "static_analysis", "ecc-code-reviewer", "pr_generation"],
  "testing":         ["ecc-tdd-guide", "ecc-e2e-runner"],
  "deployment":      ["ecc-workflow-optimizer"],
  "api-design":      ["ecc-planner", "ecc-code-reviewer"],
  "database":        ["ecc-database-reviewer"],
  "frontend":        ["ecc-frontend-developer", "ecc-accessibility-auditor"],
};

const TASK_KEYWORDS: Record<string, string[]> = {
  "new-feature":    ["feature", "implement", "add", "create", "build", "new"],
  "bug-fix":        ["bug", "fix", "broken", "error", "crash", "regression"],
  "security-audit": ["security", "audit", "vulnerability", "owasp", "pentest"],
  "code-review":    ["review", "pr", "pull request", "check"],
  "architecture":   ["architecture", "design", "system", "scale", "structure"],
  "documentation":  ["docs", "documentation", "readme", "guide", "explain"],
  "performance":    ["performance", "slow", "optimize", "latency", "benchmark"],
  "refactor":       ["refactor", "cleanup", "dead code", "consolidate", "simplify"],
  "testing":        ["test", "coverage", "tdd", "e2e", "unit test"],
  "deployment":     ["deploy", "ci", "cd", "pipeline", "release"],
  "api-design":     ["api", "endpoint", "route", "rest", "graphql"],
  "database":       ["database", "schema", "migration", "query", "index", "sql"],
  "frontend":       ["ui", "frontend", "component", "css", "tailwind", "react"],
};

/**
 * Analyze a task description and route to the best agent pipeline.
 * Uses LLM-based classification when available, falls back to keyword matching.
 */
export async function analyzeTask(
  description: string,
  options?: { useLLM?: boolean },
): Promise<TaskAnalysis> {
  const useLLM = options?.useLLM ?? true;

  // Try LLM-based classification first
  if (useLLM) {
    try {
      return await analyzeTaskWithLLM(description);
    } catch (error) {
      logger.warn("LLM task analysis failed, falling back to keywords", {
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  }

  // Fallback: keyword matching
  return analyzeTaskWithKeywords(description);
}

/**
 * LLM-based task analysis — uses a fast model for classification.
 * Cost: ~$0.001 per classification.
 */
async function analyzeTaskWithLLM(description: string): Promise<TaskAnalysis> {
  const { getModelByTier } = await import("@/lib/ai");
  const { generateObject } = await import("ai");
  const { z } = await import("zod");

  const TaskAnalysisSchema = z.object({
    taskType: z.enum(TASK_TYPES),
    complexity: z.enum(["simple", "moderate", "complex"]),
    subtasks: z.array(z.object({
      description: z.string(),
      requiredAgent: z.string().optional(),
      estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
    })).max(8),
    reasoning: z.string(),
  });

  // Use fast model for classification (cheap + quick)
  const model = getModelByTier("fast");

  const result = await generateObject({
    model,
    schema: TaskAnalysisSchema,
    prompt: `Classify this development task and suggest a pipeline.

TASK: ${description}

Available task types: ${TASK_TYPES.join(", ")}

Available agents: ${Object.entries(ROUTING_TABLE)
      .map(([type, agents]) => `${type}: ${agents.join(", ")}`)
      .join("\n")}

Classify the task, estimate complexity, and optionally break into subtasks.`,
    temperature: 0.2,
  });

  const analysis = result.object;
  const pipeline = ROUTING_TABLE[analysis.taskType] ?? ["ecc-code-reviewer"];

  return {
    taskType: analysis.taskType,
    complexity: analysis.complexity,
    pipeline,
    rationale: analysis.reasoning,
    subtasks: analysis.subtasks,
  };
}

/**
 * Keyword-based task analysis — deterministic fallback, zero cost.
 */
function analyzeTaskWithKeywords(description: string): TaskAnalysis {
  const lower = description.toLowerCase();

  let bestMatch = "code-review";
  let bestScore = 0;

  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = taskType;
    }
  }

  const pipeline = ROUTING_TABLE[bestMatch] ?? ["ecc-code-reviewer"];

  // Count only agent nodes — infrastructure nodes don't add cognitive complexity
  const agentCount = pipeline.filter((step) => !INFRASTRUCTURE_NODES.has(step)).length;
  const complexity = agentCount <= 1
    ? "simple"
    : agentCount <= 3
      ? "moderate"
      : "complex";

  return {
    taskType: bestMatch,
    complexity,
    pipeline,
    rationale: `Detected task type "${bestMatch}" from keywords. Routing to ${agentCount} agent(s).`,
  };
}

export function getRoutingTable(): Record<string, string[]> {
  return { ...ROUTING_TABLE };
}

export function getAvailablePipelines(): string[] {
  return Object.keys(ROUTING_TABLE);
}

/**
 * Enriches a flat pipeline array into structured PipelineStep objects.
 * For each step:
 *   - "project_context" and "sandbox_verify" → infrastructure type
 *   - Agent IDs → type "agent" with outputSchema + contextRequired from template metadata
 *
 * Used by the orchestrator to configure node properties when building a flow.
 *
 * @example
 * buildPipelineConfig(["project_context", "ecc-code-reviewer", "sandbox_verify"])
 * // → [
 * //     { id: "project_context", type: "project_context" },
 * //     { id: "ecc-code-reviewer", type: "agent", outputSchema: "PRGateOutput", contextRequired: true },
 * //     { id: "sandbox_verify", type: "sandbox_verify" },
 * //   ]
 */
export function buildPipelineConfig(pipeline: string[]): PipelineStep[] {
  return pipeline.map((stepId) => {
    if (stepId === "project_context") {
      return { id: stepId, type: "project_context" as const };
    }
    if (stepId === "sandbox_verify") {
      return { id: stepId, type: "sandbox_verify" as const };
    }
    const step: PipelineStep = { id: stepId, type: "agent" as const };
    const outputSchema = AGENT_OUTPUT_SCHEMA_MAP[stepId];
    if (outputSchema) {
      step.outputSchema = outputSchema;
    }
    if (AGENT_CONTEXT_REQUIRED.has(stepId)) {
      step.contextRequired = true;
    }
    return step;
  });
}
