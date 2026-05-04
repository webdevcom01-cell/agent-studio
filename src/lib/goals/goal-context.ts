import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getAgentAncestors } from "@/lib/org-chart/hierarchy";
import type { CompanyMission } from "@/generated/prisma";
import type { RuntimeContext } from "@/lib/runtime/types";

export interface AgentGoalItem {
  goalId: string;
  title: string;
  description: string | null;
  successMetric: string | null;
  priority: number;
  role: string;
  inherited: boolean;
  inheritedFrom?: string;
}

function priorityLabel(priority: number): string {
  if (priority >= 75) return "HIGH";
  if (priority >= 50) return "MEDIUM";
  return "LOW";
}

async function fetchGoalsForAgent(agentId: string) {
  return prisma.agentGoalLink.findMany({
    where: { agentId, goal: { status: "ACTIVE" } },
    include: {
      goal: {
        select: { id: true, title: true, description: true, successMetric: true, priority: true },
      },
    },
  });
}

export async function getAgentGoals(agentId: string): Promise<AgentGoalItem[]> {
  const ownLinks = await fetchGoalsForAgent(agentId);

  const seenGoalIds = new Set<string>();
  const own: AgentGoalItem[] = ownLinks.map((link) => {
    seenGoalIds.add(link.goalId);
    return {
      goalId: link.goalId,
      title: link.goal.title,
      description: link.goal.description,
      successMetric: link.goal.successMetric,
      priority: link.goal.priority,
      role: link.role,
      inherited: false,
    };
  });

  const ancestors = await getAgentAncestors(agentId);
  const inherited: AgentGoalItem[] = [];

  for (const ancestorId of ancestors) {
    const ancestorLinks = await fetchGoalsForAgent(ancestorId);
    for (const link of ancestorLinks) {
      if (!seenGoalIds.has(link.goalId)) {
        seenGoalIds.add(link.goalId);
        inherited.push({
          goalId: link.goalId,
          title: link.goal.title,
          description: link.goal.description,
          successMetric: link.goal.successMetric,
          priority: link.goal.priority,
          role: link.role,
          inherited: true,
          inheritedFrom: ancestorId,
        });
      }
    }
  }

  return [...own, ...inherited];
}

export async function getMissionForOrg(organizationId: string): Promise<CompanyMission | null> {
  return prisma.companyMission.findUnique({ where: { organizationId } });
}

export async function buildGoalPrompt(agentId: string): Promise<string> {
  const goals = await getAgentGoals(agentId);
  if (goals.length === 0) return "";

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { organizationId: true },
  });

  const parts: string[] = ["--- Company Goals & Objectives ---"];

  if (agent?.organizationId) {
    const mission = await getMissionForOrg(agent.organizationId);
    if (mission) {
      parts.push(`Mission: ${mission.statement}`);
    }
  }

  const ownGoals = goals.filter((g) => !g.inherited).sort((a, b) => b.priority - a.priority);
  const inheritedGoals = goals.filter((g) => g.inherited).sort((a, b) => b.priority - a.priority);

  if (ownGoals.length > 0) {
    parts.push("\nYour Goals:");
    for (const goal of ownGoals) {
      parts.push(`[${priorityLabel(goal.priority)}] ${goal.title} (${goal.role})`);
      if (goal.successMetric) {
        parts.push(`  Metric: ${goal.successMetric}`);
      }
    }
  }

  if (inheritedGoals.length > 0) {
    parts.push("\nInherited Goals (from parent agent):");
    for (const goal of inheritedGoals) {
      parts.push(`[${priorityLabel(goal.priority)}] ${goal.title} (${goal.role})`);
    }
  }

  parts.push("---");
  return parts.join("\n");
}

export async function injectGoalContextIntoContext(context: RuntimeContext): Promise<void> {
  if (context.variables.__goal_prompt) return;

  try {
    const goalPrompt = await buildGoalPrompt(context.agentId);
    if (goalPrompt) {
      context.variables.__goal_prompt = goalPrompt;
    }
  } catch (error) {
    logger.warn("Goal context injection failed — continuing without goals", { agentId: context.agentId, error });
  }
}
