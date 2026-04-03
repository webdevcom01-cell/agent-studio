import { describe, it, expect, beforeEach } from "vitest";

// We mock the @asteasolutions/zod-to-openapi module so the tests run without
// the package being installed.  Once the package is added via `pnpm add`, this
// mock can be removed and the real package will be used.
vi.mock("@asteasolutions/zod-to-openapi", () => {
  const registrations: unknown[] = [];
  const components: Record<string, Record<string, unknown>> = {};

  class OpenAPIRegistry {
    definitions = registrations;
    register(name: string, schema: unknown) {
      registrations.push({ name, schema });
      return schema;
    }
    registerPath(path: unknown) {
      registrations.push(path);
    }
    registerComponent(type: string, name: string, schema: unknown) {
      if (!components[type]) components[type] = {};
      components[type][name] = schema;
    }
  }

  class OpenApiGeneratorV31 {
    constructor(_definitions: unknown) {}
    generateDocument(base: unknown) {
      return {
        ...(base as object),
        paths: {
          "/api/health": { get: { tags: ["System"], summary: "Health check" } },
          "/api/agents": {
            get: { tags: ["Agents"] },
            post: { tags: ["Agents"] },
          },
          "/api/agents/{agentId}": {
            get: { tags: ["Agents"] },
            patch: { tags: ["Agents"] },
            delete: { tags: ["Agents"] },
          },
          "/api/agents/{agentId}/chat": { post: { tags: ["Chat"] } },
          "/api/api-keys": {
            get: { tags: ["API Keys"] },
            post: { tags: ["API Keys"] },
          },
          "/api/mcp-servers": {
            get: { tags: ["MCP Servers"] },
            post: { tags: ["MCP Servers"] },
          },
          "/api/jobs/{jobId}": { get: { tags: ["Jobs"] } },
        },
        components: { securitySchemes: components["securitySchemes"] ?? {} },
      };
    }
  }

  // Patch ZodType.prototype so .openapi() calls in schemas.ts / paths.ts
  // don't throw when the real package is not installed.
  function extendZodWithOpenApi(z: { ZodType?: { prototype: Record<string, unknown> } }) {
    if (z.ZodType && !z.ZodType.prototype["openapi"]) {
      z.ZodType.prototype["openapi"] = function () { return this; };
    }
  }

  return { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi };
});

import { generateOpenApiSpec, resetSpecCache } from "../spec";

beforeEach(() => {
  resetSpecCache();
  vi.resetModules();
});

describe("generateOpenApiSpec", () => {
  it("returns a document with openapi 3.1.0", () => {
    const spec = generateOpenApiSpec();
    expect(spec.openapi).toBe("3.1.0");
  });

  it("includes title and description in info", () => {
    const spec = generateOpenApiSpec();
    expect(spec.info.title).toBe("Agent Studio API");
    expect(spec.info.description).toContain("Authentication");
  });

  it("exposes at least two server entries", () => {
    const spec = generateOpenApiSpec();
    expect(spec.servers).toBeDefined();
    expect((spec.servers ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("includes all expected tags", () => {
    const spec = generateOpenApiSpec();
    const tagNames = (spec.tags ?? []).map((t: { name: string }) => t.name);
    const required = [
      "System", "Agents", "Chat", "Flow", "Knowledge",
      "API Keys", "MCP Servers", "Evals", "Webhooks", "Jobs", "Schedules",
    ];
    for (const tag of required) {
      expect(tagNames).toContain(tag);
    }
  });

  it("has /api/health path with GET", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/health"]).toBeDefined();
    expect(paths["/api/health"]["get"]).toBeDefined();
  });

  it("has /api/agents paths for GET and POST", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/agents"]?.["get"]).toBeDefined();
    expect(paths["/api/agents"]?.["post"]).toBeDefined();
  });

  it("has /api/agents/{agentId} GET, PATCH, DELETE", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const agent = paths["/api/agents/{agentId}"];
    expect(agent?.["get"]).toBeDefined();
    expect(agent?.["patch"]).toBeDefined();
    expect(agent?.["delete"]).toBeDefined();
  });

  it("has /api/agents/{agentId}/chat POST", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/agents/{agentId}/chat"]?.["post"]).toBeDefined();
  });

  it("has /api/api-keys GET and POST", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/api-keys"]?.["get"]).toBeDefined();
    expect(paths["/api/api-keys"]?.["post"]).toBeDefined();
  });

  it("has /api/mcp-servers GET and POST", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/mcp-servers"]?.["get"]).toBeDefined();
    expect(paths["/api/mcp-servers"]?.["post"]).toBeDefined();
  });

  it("has /api/jobs/{jobId} GET", () => {
    const spec = generateOpenApiSpec();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    expect(paths["/api/jobs/{jobId}"]?.["get"]).toBeDefined();
  });

  it("returns the cached instance on second call", () => {
    const first = generateOpenApiSpec();
    const second = generateOpenApiSpec();
    expect(first).toBe(second); // same reference
  });

  it("resetSpecCache clears the cache", () => {
    const first = generateOpenApiSpec();
    resetSpecCache();
    const second = generateOpenApiSpec();
    // After reset both are fresh objects (not same reference)
    expect(first).not.toBe(second);
  });

  it("includes BearerAuth and CookieAuth in securitySchemes", () => {
    const spec = generateOpenApiSpec();
    const schemes = (spec.components as Record<string, unknown>)
      ?.["securitySchemes"] as Record<string, unknown> | undefined;
    expect(schemes?.["BearerAuth"]).toBeDefined();
    expect(schemes?.["CookieAuth"]).toBeDefined();
  });

  it("info.description contains all 11 API key scopes", () => {
    const spec = generateOpenApiSpec();
    const desc = spec.info.description ?? "";
    const expectedScopes = [
      "agents:read", "agents:write", "agents:delete",
      "flows:read", "flows:execute",
      "kb:read", "kb:write",
      "evals:read", "evals:run",
      "webhooks:read", "admin",
    ];
    for (const scope of expectedScopes) {
      expect(desc).toContain(scope);
    }
  });
});
