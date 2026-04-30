import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { getModel } from "@/lib/ai";
import { generateObject } from "ai";
import { z } from "zod";

interface RouteConfig {
  id: string;
  label: string;
  description: string;
  examples: string[];
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_OUTPUT_VARIABLE = "router_result";

/**
 * semantic_router — LLM-based intent classifier with dynamic output handles.
 * Each route maps to a sourceHandle for multi-output routing.
 */
export const semanticRouterHandler: NodeHandler = async (node, context) => {
  const inputVariable = (node.data.inputVariable as string) ?? "";
  const routes = parseRoutes(node.data.routes as unknown);
  const fallbackRoute = (node.data.fallbackRoute as string) ?? "fallback";
  const modelId = (node.data.model as string) || "gpt-4.1-mini";
  const confidenceThreshold =
    (node.data.confidenceThreshold as number) ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (routes.length === 0) {
    return {
      messages: [
        { role: "assistant", content: "Semantic Router has no routes configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const inputText = inputVariable
    ? resolveTemplate(`{{${inputVariable}}}`, context.variables)
    : "";

  if (!inputText || inputText === `{{${inputVariable}}}`) {
    return {
      messages: [],
      nextNodeId: fallbackRoute,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          selectedRoute: fallbackRoute,
          confidence: 0,
          reasoning: "No input text provided",
          allScores: [],
        },
      },
    };
  }

  try {
    const routeIds = routes.map((r) => r.id);

    const classificationSchema = z.object({
      selectedRoute: z.string(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
      allScores: z.array(
        z.object({
          route: z.string(),
          score: z.number().min(0).max(1),
        }),
      ),
    });

    const routeDescriptions = routes
      .map((r) => {
        const examples =
          r.examples.length > 0
            ? `\n    Examples: ${r.examples.join(", ")}`
            : "";
        return `  - "${r.id}" (${r.label}): ${r.description}${examples}`;
      })
      .join("\n");

    const { object } = await generateObject({
      model: getModel(modelId),
      schema: classificationSchema,
      prompt: `Classify the following user input into one of these routes:

${routeDescriptions}

User input: "${inputText}"

Return the best matching route ID from [${routeIds.map((id) => `"${id}"`).join(", ")}], a confidence score (0.0-1.0), reasoning, and scores for all routes.`,
    });

    const meetsThreshold = object.confidence >= confidenceThreshold;
    const selectedRoute = meetsThreshold ? object.selectedRoute : fallbackRoute;

    // Validate the route exists
    const validRoute = routeIds.includes(selectedRoute)
      ? selectedRoute
      : fallbackRoute;

    return {
      messages: [],
      nextNodeId: validRoute,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          selectedRoute: validRoute,
          confidence: object.confidence,
          reasoning: object.reasoning,
          allScores: object.allScores,
        },
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: fallbackRoute,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          selectedRoute: fallbackRoute,
          confidence: 0,
          reasoning: `Classification failed: ${errorMsg}`,
          allScores: [],
        },
      },
    };
  }
};

function parseRoutes(raw: unknown): RouteConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is RouteConfig =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as Record<string, unknown>).id === "string" &&
      typeof (r as Record<string, unknown>).label === "string",
  ).map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description ?? "",
    examples: Array.isArray(r.examples) ? r.examples : [],
  }));
}
