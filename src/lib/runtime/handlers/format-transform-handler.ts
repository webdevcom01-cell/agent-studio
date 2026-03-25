import type { FlowNode } from "@/types";
import type { RuntimeContext, ExecutionResult } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

type TransformFormat = "json_to_text" | "text_to_json" | "csv_to_json" | "json_to_csv" | "template" | "uppercase" | "lowercase" | "trim" | "split" | "join";

export const formatTransformHandler = async (
  node: FlowNode,
  context: RuntimeContext
): Promise<ExecutionResult> => {
  const format = (node.data.format as TransformFormat) || "template";
  const inputVariable = (node.data.inputVariable as string) || "";
  const outputVariable = (node.data.outputVariable as string) || "transform_result";
  const templateStr = (node.data.template as string) || "";
  const separator = (node.data.separator as string) || ",";

  // Resolve input from variable or direct value
  const resolvedInput = inputVariable
    ? resolveTemplate(`{{${inputVariable}}}`, context.variables)
    : resolveTemplate((node.data.inputValue as string) || "", context.variables);

  if (!resolvedInput || resolvedInput === `{{${inputVariable}}}`) {
    logger.warn("Format transform: no input data", { nodeId: node.id, inputVariable });
    return {
      messages: [{ role: "assistant", content: "⚠️ Format transform skipped — no input data provided." }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "no_input" },
      },
    };
  }

  try {
    const result = applyTransform(format, resolvedInput, {
      template: resolveTemplate(templateStr, context.variables),
      separator,
      context,
    });

    logger.info("Format transform completed", {
      nodeId: node.id,
      format,
      inputLength: resolvedInput.length,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: result,
        __last_transform: { format, success: true },
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("Format transform failed", { nodeId: node.id, format, error: errorMsg });

    return {
      messages: [{ role: "assistant", content: `⚠️ Format transform failed: ${errorMsg}` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: errorMsg },
      },
    };
  }
};

interface TransformOptions {
  template: string;
  separator: string;
  context: RuntimeContext;
}

function applyTransform(
  format: TransformFormat,
  input: string,
  options: TransformOptions
): unknown {
  switch (format) {
    case "json_to_text": {
      const obj = JSON.parse(input);
      if (options.template) {
        return resolveTemplate(options.template, { ...options.context.variables, _input: obj });
      }
      return typeof obj === "object" ? JSON.stringify(obj, null, 2) : String(obj);
    }

    case "text_to_json": {
      // Try parsing as JSON first
      try {
        return JSON.parse(input);
      } catch {
        // Fall back to key-value parsing (line-based "key: value" or "key=value")
        const lines = input.split("\n").filter((l) => l.trim());
        const result: Record<string, string> = {};
        for (const line of lines) {
          const match = line.match(/^([^:=]+)[=:](.*)$/);
          if (match) {
            result[match[1].trim()] = match[2].trim();
          }
        }
        if (Object.keys(result).length > 0) return result;
        // If nothing parsed, return as single-value object
        return { value: input };
      }
    }

    case "csv_to_json": {
      const lines = input.split("\n").filter((l) => l.trim());
      if (lines.length === 0) return [];
      const headers = lines[0].split(options.separator).map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(options.separator).map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = values[i] ?? "";
        });
        return row;
      });
      return rows;
    }

    case "json_to_csv": {
      const data = JSON.parse(input);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("json_to_csv requires an array of objects");
      }
      const keys = Object.keys(data[0]);
      const header = keys.join(options.separator);
      const rows = data.map((row: Record<string, unknown>) =>
        keys.map((k) => String(row[k] ?? "")).join(options.separator)
      );
      return [header, ...rows].join("\n");
    }

    case "template": {
      if (!options.template) {
        throw new Error("template format requires a template string");
      }
      // Make input available as _input in variables
      let inputObj: unknown;
      try {
        inputObj = JSON.parse(input);
      } catch {
        inputObj = input;
      }
      const vars = { ...options.context.variables, _input: inputObj };
      if (typeof inputObj === "object" && inputObj !== null && !Array.isArray(inputObj)) {
        Object.assign(vars, inputObj as Record<string, unknown>);
      }
      return resolveTemplate(options.template, vars);
    }

    case "uppercase":
      return input.toUpperCase();

    case "lowercase":
      return input.toLowerCase();

    case "trim":
      return input.trim();

    case "split":
      return input.split(options.separator).map((s) => s.trim());

    case "join": {
      const arr = JSON.parse(input);
      if (!Array.isArray(arr)) throw new Error("join requires an array input");
      return arr.join(options.separator);
    }

    default:
      throw new Error(`unknown transform format "${format}"`);
  }
}
