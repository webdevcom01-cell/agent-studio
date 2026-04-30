import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { getModel } from "@/lib/ai";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * structured_output — Forces the LLM to return JSON matching a given JSON Schema.
 * Uses Vercel AI SDK generateObject() with a Zod schema derived from the node config.
 */
export const structuredOutputHandler: NodeHandler = async (node, context) => {
  const prompt = resolveTemplate(
    (node.data.prompt as string) ?? "",
    context.variables,
  );
  const schemaText = (node.data.jsonSchema as string) ?? "{}";
  const outputVariable =
    (node.data.outputVariable as string) || "structured_result";
  const outputFormat = (node.data.outputFormat as string) ?? "object";
  const secondaryOutputVariable =
    (node.data.secondaryOutputVariable as string) || "";
  const modelId = (node.data.model as string) || "gpt-4.1-mini";

  if (!prompt) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Structured Output node has no prompt configured.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  let parsedSchema: Record<string, unknown>;
  try {
    parsedSchema = JSON.parse(schemaText) as Record<string, unknown>;
  } catch {
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: "[Error: Invalid JSON Schema]",
      },
    };
  }

  try {
    const zodSchema = jsonSchemaToZod(parsedSchema);

    const { object } = await generateObject({
      model: getModel(modelId),
      schema: zodSchema,
      prompt,
    });

    const primaryValue = outputFormat === "string"
      ? JSON.stringify(object, null, 2)
      : object;

    const vars: Record<string, unknown> = {
      ...context.variables,
      [outputVariable]: primaryValue,
    };

    if (secondaryOutputVariable) {
      vars[secondaryOutputVariable] = outputFormat === "string"
        ? object
        : JSON.stringify(object, null, 2);
    }

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: vars,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};

/**
 * Converts a simple JSON Schema object into a Zod schema.
 * Supports: string, number, integer, boolean, array, object with properties.
 */
function jsonSchemaToZod(
  schema: Record<string, unknown>,
): z.ZodTypeAny {
  const type = schema.type as string | undefined;

  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = (schema.items as Record<string, unknown>) ?? {};
      return z.array(jsonSchemaToZod(items));
    }
    case "object": {
      const properties =
        (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      const required = (schema.required as string[]) ?? [];
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, propSchema] of Object.entries(properties)) {
        const field = jsonSchemaToZod(propSchema);
        shape[key] = required.includes(key) ? field : field.optional();
      }

      return z.object(shape);
    }
    default:
      return z.unknown();
  }
}
