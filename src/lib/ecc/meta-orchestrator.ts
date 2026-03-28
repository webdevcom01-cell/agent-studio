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

const ROUTING_TABLE: Record<string, string[]> = {
  "new-feature":     ["ecc-planner", "ecc-tdd-guide", "ecc-code-reviewer"],
  "bug-fix":         ["ecc-tdd-guide", "ecc-code-reviewer", "ecc-security-reviewer"],
  "security-audit":  ["ecc-security-reviewer", "ecc-security-engineer"],
  "code-review":     ["ecc-code-reviewer"],
  "architecture":    ["ecc-architect", "ecc-planner"],
  "documentation":   ["ecc-doc-updater"],
  "performance":     ["ecc-performance-benchmarker", "ecc-architect"],
  "refactor":        ["ecc-planner", "ecc-refactor-cleaner", "ecc-code-reviewer"],
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

  const complexity = pipeline.length <= 1
    ? "simple"
    : pipeline.length <= 3
      ? "moderate"
      : "complex";

  return {
    taskType: bestMatch,
    complexity,
    pipeline,
    rationale: `Detected task type "${bestMatch}" from keywords. Routing to ${pipeline.length} agent(s).`,
  };
}

export function getRoutingTable(): Record<string, string[]> {
  return { ...ROUTING_TABLE };
}

export function getAvailablePipelines(): string[] {
  return Object.keys(ROUTING_TABLE);
}
