import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { validateExternalUrl } from "@/lib/utils/url-validation";

const DEFAULT_OUTPUT_VARIABLE = "web_content";
const DEFAULT_MAX_LENGTH = 10_000;
const FETCH_TIMEOUT_MS = 30_000;
const JINA_BASE_URL = "https://r.jina.ai/";

async function fetchWithJina(url: string): Promise<string> {
  const response = await fetch(`${JINA_BASE_URL}${url}`, {
    headers: {
      Accept: "text/markdown",
      "User-Agent": "AgentStudio/1.0",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Jina Reader returned HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchRaw(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AgentStudio/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (contentType.includes("text/html")) {
    const { load } = await import("cheerio");
    const $ = load(text);
    $("script, style, nav, footer, header, noscript, iframe").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  }

  return text;
}

export const webFetchHandler: NodeHandler = async (node, context) => {
  const urlTemplate = (node.data.url as string) ?? "";
  const provider = (node.data.provider as string) ?? "jina";
  const outputVariable = (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const maxLength = (node.data.maxLength as number) ?? DEFAULT_MAX_LENGTH;

  if (!urlTemplate) {
    return {
      messages: [
        { role: "assistant", content: "Web Fetch node has no URL configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const resolvedUrl = resolveTemplate(urlTemplate, context.variables);

  const urlCheck = validateExternalUrl(resolvedUrl);
  if (!urlCheck.valid) {
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${urlCheck.error ?? "Invalid URL"}]`,
      },
    };
  }

  try {
    const content = provider === "raw"
      ? await fetchRaw(resolvedUrl)
      : await fetchWithJina(resolvedUrl);

    const truncated = content.length > maxLength
      ? content.slice(0, maxLength)
      : content;

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: truncated,
      },
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
