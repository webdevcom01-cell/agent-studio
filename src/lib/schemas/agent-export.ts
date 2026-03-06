import { z } from "zod";

const flowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

const flowVariableSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object"]),
  default: z.unknown(),
});

const flowContentSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  variables: z.array(flowVariableSchema),
});

const agentConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  systemPrompt: z.string(),
  model: z.string(),
});

export const agentExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  agent: agentConfigSchema,
  flow: flowContentSchema,
});

export type AgentExportData = z.infer<typeof agentExportSchema>;
