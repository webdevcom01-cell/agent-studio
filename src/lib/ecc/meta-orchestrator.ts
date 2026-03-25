import type { ParsedSkill } from "./types";

interface TaskAnalysis {
  taskType: string;
  complexity: "simple" | "moderate" | "complex";
  pipeline: string[];
  rationale: string;
}

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

export function analyzeTask(description: string): TaskAnalysis {
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
