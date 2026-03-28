import type { NodeHandler } from "../types";

const DEFAULT_OUTPUT_VARIABLE = "ab_variant";

interface ABVariant {
  id: string;
  weight: number;
}

/**
 * ab_test — A/B traffic splitting with weighted routing.
 * Assigns a variant based on configured weights and routes to the corresponding branch.
 */
export const abTestHandler: NodeHandler = async (node, context) => {
  const variants = parseVariants(node.data.variants as unknown);
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const stickyKey = (node.data.stickyKey as string) ?? "";

  if (variants.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content: "A/B Test node has no variants configured.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // Sticky assignment: if a user/conversation already has a variant, reuse it
  if (stickyKey) {
    const existingVariant = context.variables[stickyKey];
    if (
      typeof existingVariant === "string" &&
      variants.some((v) => v.id === existingVariant)
    ) {
      const nextNodeId = findVariantEdge(node.id, existingVariant, context);
      return {
        messages: [],
        nextNodeId,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [outputVariable]: existingVariant,
          [`${outputVariable}_source`]: "sticky",
        },
      };
    }
  }

  const selected = weightedRandom(variants);

  const nextNodeId = findVariantEdge(node.id, selected.id, context);

  return {
    messages: [],
    nextNodeId,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      [outputVariable]: selected.id,
      ...(stickyKey ? { [stickyKey]: selected.id } : {}),
      [`${outputVariable}_source`]: "random",
    },
  };
};

function parseVariants(raw: unknown): ABVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is { id: string; weight: number } =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as Record<string, unknown>).id === "string" &&
        typeof (v as Record<string, unknown>).weight === "number",
    )
    .map((v) => ({ id: v.id, weight: Math.max(0, v.weight) }));
}

function weightedRandom(variants: ABVariant[]): ABVariant {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return variants[0];

  const rand = Math.random() * totalWeight;
  let cumulative = 0;

  for (const variant of variants) {
    cumulative += variant.weight;
    if (rand < cumulative) return variant;
  }

  return variants[variants.length - 1];
}

function findVariantEdge(
  nodeId: string,
  variantId: string,
  context: { flowContent: { edges: { source: string; sourceHandle?: string; target: string; label?: string }[] } },
): string | null {
  const edge = context.flowContent.edges.find(
    (e) =>
      e.source === nodeId &&
      (e.sourceHandle === variantId || e.label === variantId),
  );
  return edge?.target ?? null;
}
