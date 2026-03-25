import { logger } from "@/lib/logger";
import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { validateExternalUrlWithDNS } from "@/lib/utils/url-validation";

export const apiCallHandler: NodeHandler = async (node, context) => {
  const method = (node.data.method as string) ?? "GET";
  const rawUrl = (node.data.url as string) ?? "";
  const rawHeaders = (node.data.headers as Record<string, string>) ?? {};
  const rawBody = (node.data.body as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "";

  const url = resolveTemplate(rawUrl, context.variables);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[resolveTemplate(key, context.variables)] = resolveTemplate(value, context.variables);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const fetchOptions: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      signal: controller.signal,
    };

    if (["POST", "PUT", "PATCH"].includes(method) && rawBody) {
      fetchOptions.body = resolveTemplate(rawBody, context.variables);
    }

    const urlCheck = await validateExternalUrlWithDNS(url);
    if (!urlCheck.valid) {
      throw new Error(`URL not allowed: ${urlCheck.error ?? "blocked destination"}`);
    }

    try {
      const response = await fetch(url, fetchOptions);
      const responseText = await response.text();

      let responseData: unknown;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: outputVariable ? { [outputVariable]: responseData } : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.error("API call failed", error, { agentId: context.agentId });
    return {
      messages: [{ role: "assistant", content: "Error making API request." }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable
        ? { [outputVariable]: null, [`${outputVariable}_error`]: String(error) }
        : undefined,
    };
  }
};
