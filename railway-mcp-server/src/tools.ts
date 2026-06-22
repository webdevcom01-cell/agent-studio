/**
 * Tool registrations for the Railway MCP server.
 *
 * Scope: read + limited write (no deletes). Write tools are marked
 * destructiveHint:true so MCP clients prompt for confirmation.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { railwayRequest, paginateAll, RailwayError } from "./railwayClient.js";
import {
  ME_QUERY,
  PROJECTS_QUERY,
  WORKSPACE_PROJECTS_QUERY,
  PROJECT_QUERY,
  ENVIRONMENTS_QUERY,
  VARIABLES_QUERY,
  VARIABLE_COLLECTION_UPSERT_MUTATION,
  SERVICE_INSTANCE_REDEPLOY_MUTATION,
} from "./gql.js";
import { maskVariablesMap } from "./util/redact.js";
import { parseConnectionUrl, isPostgresUrl } from "./util/parseConnectionUrl.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(output: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RailwayError) return fail(err.message);
    return fail(err instanceof Error ? err.message : String(err));
  }
}

interface NamedNode {
  id: string;
  name: string;
  icon?: string;
}

function isProductionEnv(name: string): boolean {
  return name.trim().toLowerCase() === "production";
}

export function registerTools(server: McpServer): void {
  // ---- whoami ----
  server.registerTool(
    "railway_whoami",
    {
      title: "Railway: who am I",
      description:
        "Return the authenticated Railway user (id, name, email). Use to verify the token works. Only valid for account tokens.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () =>
      run(async () => {
        const data = await railwayRequest<{ me: { id: string; name: string; email: string } }>(
          ME_QUERY,
        );
        return ok({ user: data.me });
      }),
  );

  // ---- list projects ----
  server.registerTool(
    "railway_list_projects",
    {
      title: "Railway: list projects",
      description:
        "List Railway projects you can access (id, name, description). Optionally scope to a workspace via workspaceId. Read-only.",
      inputSchema: {
        workspaceId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional workspace ID to scope the project list."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const projects = args.workspaceId
          ? await paginateAll<NamedNode>(
              WORKSPACE_PROJECTS_QUERY,
              { workspaceId: args.workspaceId },
              (d) => d.projects,
            )
          : await paginateAll<NamedNode>(PROJECTS_QUERY, {}, (d) => d.projects);
        return ok({ count: projects.length, projects });
      }),
  );

  // ---- get project (services + environments) ----
  server.registerTool(
    "railway_get_project",
    {
      title: "Railway: get project",
      description:
        "Fetch a single project by ID, including its services and environments. Read-only.",
      inputSchema: {
        projectId: z.string().min(1).describe("Railway project ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await railwayRequest<{
          project: {
            id: string;
            name: string;
            description: string | null;
            createdAt: string;
            services: { edges: Array<{ node: NamedNode }> };
            environments: { edges: Array<{ node: NamedNode }> };
          };
        }>(PROJECT_QUERY, { id: args.projectId });
        const p = data.project;
        const services = p.services.edges.map((e) => e.node);
        const environments = p.environments.edges.map((e) => e.node);
        return ok({
          project: {
            id: p.id,
            name: p.name,
            description: p.description,
            createdAt: p.createdAt,
          },
          services,
          environments,
        });
      }),
  );

  // ---- list environments ----
  server.registerTool(
    "railway_list_environments",
    {
      title: "Railway: list environments",
      description:
        "List environments for a project (production, staging, etc.). By default excludes ephemeral PR/preview environments. Read-only.",
      inputSchema: {
        projectId: z.string().min(1).describe("Railway project ID."),
        includeEphemeral: z
          .boolean()
          .default(false)
          .describe("Include ephemeral PR/preview environments (default false)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const variables: Record<string, unknown> = { projectId: args.projectId };
        if (!args.includeEphemeral) variables.isEphemeral = false;
        const data = await railwayRequest<{
          environments: { edges: Array<{ node: { id: string; name: string; createdAt: string } }> };
        }>(ENVIRONMENTS_QUERY, variables);
        const environments = data.environments.edges.map((e) => ({
          ...e.node,
          isProduction: isProductionEnv(e.node.name),
        }));
        return ok({ count: environments.length, environments });
      }),
  );

  // ---- get variables (password-masked) ----
  server.registerTool(
    "railway_get_variables",
    {
      title: "Railway: get variables",
      description:
        "Get environment variables for a service in an environment (omit serviceId for shared environment variables). " +
        "Passwords inside connection-string values (e.g. DATABASE_URL) are MASKED before returning. Read-only.",
      inputSchema: {
        projectId: z.string().min(1).describe("Railway project ID."),
        environmentId: z.string().min(1).describe("Railway environment ID."),
        serviceId: z
          .string()
          .min(1)
          .optional()
          .describe("Service ID. Omit to get shared environment variables."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await railwayRequest<{ variables: Record<string, string> }>(
          VARIABLES_QUERY,
          {
            projectId: args.projectId,
            environmentId: args.environmentId,
            serviceId: args.serviceId ?? null,
          },
        );
        const masked = maskVariablesMap(data.variables ?? {});
        return ok({ count: Object.keys(masked).length, variables: masked });
      }),
  );

  // ---- inspect databases (workflow, read-only, password-free) ----
  server.registerTool(
    "railway_inspect_databases",
    {
      title: "Railway: inspect databases",
      description:
        "Find Postgres databases in a project and report host:port/db (NEVER the password) per service and environment, " +
        "flagging which environment is production. Scans non-ephemeral environments unless an environmentId is given. Read-only.",
      inputSchema: {
        projectId: z.string().min(1).describe("Railway project ID."),
        environmentId: z
          .string()
          .min(1)
          .optional()
          .describe("Limit scan to a single environment. Omit to scan all non-ephemeral environments."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        // Services from the project.
        const projData = await railwayRequest<{
          project: {
            name: string;
            services: { edges: Array<{ node: NamedNode }> };
          };
        }>(PROJECT_QUERY, { id: args.projectId });
        const services = projData.project.services.edges.map((e) => e.node);

        // Environments to scan.
        let environments: Array<{ id: string; name: string }>;
        if (args.environmentId) {
          const envData = await railwayRequest<{
            environments: { edges: Array<{ node: { id: string; name: string } }> };
          }>(ENVIRONMENTS_QUERY, { projectId: args.projectId });
          environments = envData.environments.edges
            .map((e) => e.node)
            .filter((e) => e.id === args.environmentId);
        } else {
          const envData = await railwayRequest<{
            environments: { edges: Array<{ node: { id: string; name: string } }> };
          }>(ENVIRONMENTS_QUERY, { projectId: args.projectId, isEphemeral: false });
          environments = envData.environments.edges.map((e) => e.node);
        }

        const databases: Array<Record<string, unknown>> = [];
        for (const env of environments) {
          for (const svc of services) {
            let vars: Record<string, string> = {};
            try {
              const data = await railwayRequest<{ variables: Record<string, string> }>(
                VARIABLES_QUERY,
                { projectId: args.projectId, environmentId: env.id, serviceId: svc.id },
              );
              vars = data.variables ?? {};
            } catch {
              continue; // skip services without readable variables
            }
            for (const [key, value] of Object.entries(vars)) {
              if (typeof value !== "string" || !isPostgresUrl(value)) continue;
              const parsed = parseConnectionUrl(value);
              if (!parsed) continue;
              databases.push({
                service: svc.name,
                serviceId: svc.id,
                environment: env.name,
                environmentId: env.id,
                isProduction: isProductionEnv(env.name),
                variableKey: key,
                scheme: parsed.scheme,
                host: parsed.host,
                port: parsed.port,
                database: parsed.database,
                username: parsed.username,
                hostPortDb: parsed.hostPortDb, // password-free
                passwordPresentButHidden: parsed.hasPassword,
              });
            }
          }
        }

        const productionEnvs = environments
          .filter((e) => isProductionEnv(e.name))
          .map((e) => e.name);

        return ok({
          project: projData.project.name,
          environmentsScanned: environments.map((e) => e.name),
          hasStaging: environments.some((e) => !isProductionEnv(e.name)),
          productionEnvironments: productionEnvs,
          databaseCount: databases.length,
          databases,
        });
      }),
  );

  // ---- set variables (LIMITED WRITE) ----
  server.registerTool(
    "railway_set_variables",
    {
      title: "Railway: set variables",
      description:
        "Create or update one or more variables for a service in an environment (upsert). " +
        "Never deletes other variables (does not use replace). Destructive-ish: changes config and may trigger a redeploy " +
        "unless skipDeploys is true. Requires confirmation.",
      inputSchema: {
        projectId: z.string().min(1).describe("Railway project ID."),
        environmentId: z.string().min(1).describe("Railway environment ID."),
        serviceId: z
          .string()
          .min(1)
          .optional()
          .describe("Service ID. Omit to set shared environment variables."),
        variables: z
          .record(z.string())
          .describe('Map of variable name to value, e.g. {"NODE_ENV":"production"}.'),
        skipDeploys: z
          .boolean()
          .default(true)
          .describe("If true, do not trigger an automatic redeploy after the change (default true)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const input: Record<string, unknown> = {
          projectId: args.projectId,
          environmentId: args.environmentId,
          variables: args.variables,
          skipDeploys: args.skipDeploys,
        };
        if (args.serviceId) input.serviceId = args.serviceId;
        await railwayRequest(VARIABLE_COLLECTION_UPSERT_MUTATION, { input });
        return ok({
          updated: Object.keys(args.variables),
          environmentId: args.environmentId,
          serviceId: args.serviceId ?? null,
          skipDeploys: args.skipDeploys,
        });
      }),
  );

  // ---- redeploy service (LIMITED WRITE) ----
  server.registerTool(
    "railway_redeploy_service",
    {
      title: "Railway: redeploy service",
      description:
        "Redeploy a service's latest deployment in a given environment (uses the existing commit). " +
        "Destructive: triggers a new deployment. Requires confirmation.",
      inputSchema: {
        serviceId: z.string().min(1).describe("Railway service ID."),
        environmentId: z.string().min(1).describe("Railway environment ID."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        await railwayRequest(SERVICE_INSTANCE_REDEPLOY_MUTATION, {
          serviceId: args.serviceId,
          environmentId: args.environmentId,
        });
        return ok({
          redeployed: true,
          serviceId: args.serviceId,
          environmentId: args.environmentId,
        });
      }),
  );
}
