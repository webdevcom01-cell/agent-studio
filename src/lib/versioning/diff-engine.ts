import type { FlowContent, FlowNode, FlowEdge, FlowVariable } from "@/types";

const POSITION_THRESHOLD = 10;

interface NodeChange {
  before: FlowNode;
  after: FlowNode;
  changes: string[];
}

interface EdgeChange {
  before: FlowEdge;
  after: FlowEdge;
}

export interface FlowDiff {
  nodes: {
    added: FlowNode[];
    removed: FlowNode[];
    modified: NodeChange[];
    unchanged: number;
  };
  edges: {
    added: FlowEdge[];
    removed: FlowEdge[];
    modified: EdgeChange[];
    unchanged: number;
  };
  variables: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  summary: string;
}

export function computeFlowDiff(
  before: FlowContent,
  after: FlowContent
): FlowDiff {
  const nodeDiff = diffNodes(before.nodes, after.nodes);
  const edgeDiff = diffEdges(before.edges, after.edges);
  const variableDiff = diffVariables(
    before.variables ?? [],
    after.variables ?? []
  );

  const summary = buildSummary(nodeDiff, edgeDiff, variableDiff);

  return {
    nodes: nodeDiff,
    edges: edgeDiff,
    variables: variableDiff,
    summary,
  };
}

export function generateChangesSummary(
  before: FlowContent,
  after: FlowContent
): object {
  const diff = computeFlowDiff(before, after);
  return {
    nodesAdded: diff.nodes.added.map((n) => ({ id: n.id, type: n.type })),
    nodesRemoved: diff.nodes.removed.map((n) => ({ id: n.id, type: n.type })),
    nodesModified: diff.nodes.modified.map((m) => ({
      id: m.after.id,
      type: m.after.type,
      changes: m.changes,
    })),
    edgesAdded: diff.edges.added.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    edgesRemoved: diff.edges.removed.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    variablesAdded: diff.variables.added,
    variablesRemoved: diff.variables.removed,
    variablesModified: diff.variables.modified,
    summary: diff.summary,
  };
}

function diffNodes(
  before: FlowNode[],
  after: FlowNode[]
): FlowDiff["nodes"] {
  const beforeMap = new Map(before.map((n) => [n.id, n]));
  const afterMap = new Map(after.map((n) => [n.id, n]));

  const added: FlowNode[] = [];
  const removed: FlowNode[] = [];
  const modified: NodeChange[] = [];
  let unchanged = 0;

  for (const [id, node] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push(node);
      continue;
    }
    const changes = getNodeChanges(prev, node);
    if (changes.length > 0) {
      modified.push({ before: prev, after: node, changes });
    } else {
      unchanged++;
    }
  }

  for (const [id, node] of beforeMap) {
    if (!afterMap.has(id)) {
      removed.push(node);
    }
  }

  return { added, removed, modified, unchanged };
}

function getNodeChanges(before: FlowNode, after: FlowNode): string[] {
  const changes: string[] = [];

  if (before.type !== after.type) {
    changes.push(`type: ${before.type} → ${after.type}`);
  }

  const dx = Math.abs(before.position.x - after.position.x);
  const dy = Math.abs(before.position.y - after.position.y);
  if (dx > POSITION_THRESHOLD || dy > POSITION_THRESHOLD) {
    changes.push("position moved");
  }

  const beforeData = JSON.stringify(before.data);
  const afterData = JSON.stringify(after.data);
  if (beforeData !== afterData) {
    const changedKeys = findChangedKeys(
      before.data as Record<string, unknown>,
      after.data as Record<string, unknown>
    );
    if (changedKeys.length > 0) {
      changes.push(`data: ${changedKeys.join(", ")}`);
    }
  }

  return changes;
}

function findChangedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];

  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }

  return changed;
}

function diffEdges(
  before: FlowEdge[],
  after: FlowEdge[]
): FlowDiff["edges"] {
  const beforeMap = new Map(before.map((e) => [e.id, e]));
  const afterMap = new Map(after.map((e) => [e.id, e]));

  const added: FlowEdge[] = [];
  const removed: FlowEdge[] = [];
  const modified: EdgeChange[] = [];
  let unchanged = 0;

  for (const [id, edge] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push(edge);
      continue;
    }
    if (
      prev.source !== edge.source ||
      prev.target !== edge.target ||
      prev.sourceHandle !== edge.sourceHandle ||
      prev.label !== edge.label
    ) {
      modified.push({ before: prev, after: edge });
    } else {
      unchanged++;
    }
  }

  for (const [id, edge] of beforeMap) {
    if (!afterMap.has(id)) {
      removed.push(edge);
    }
  }

  return { added, removed, modified, unchanged };
}

function diffVariables(
  before: FlowVariable[],
  after: FlowVariable[]
): FlowDiff["variables"] {
  const beforeMap = new Map(before.map((v) => [v.name, v]));
  const afterMap = new Map(after.map((v) => [v.name, v]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [name, variable] of afterMap) {
    const prev = beforeMap.get(name);
    if (!prev) {
      added.push(name);
    } else if (
      prev.type !== variable.type ||
      JSON.stringify(prev.default) !== JSON.stringify(variable.default)
    ) {
      modified.push(name);
    }
  }

  for (const name of beforeMap.keys()) {
    if (!afterMap.has(name)) {
      removed.push(name);
    }
  }

  return { added, removed, modified };
}

function buildSummary(
  nodes: FlowDiff["nodes"],
  edges: FlowDiff["edges"],
  variables: FlowDiff["variables"]
): string {
  const parts: string[] = [];

  if (nodes.added.length > 0) {
    const types = nodes.added.map((n) => n.type).join(", ");
    parts.push(`Added ${nodes.added.length} node(s) (${types})`);
  }
  if (nodes.removed.length > 0) {
    parts.push(`Removed ${nodes.removed.length} node(s)`);
  }
  if (nodes.modified.length > 0) {
    parts.push(`Modified ${nodes.modified.length} node(s)`);
  }
  if (edges.added.length > 0) {
    parts.push(`Added ${edges.added.length} connection(s)`);
  }
  if (edges.removed.length > 0) {
    parts.push(`Removed ${edges.removed.length} connection(s)`);
  }
  if (variables.added.length > 0) {
    parts.push(`Added ${variables.added.length} variable(s)`);
  }
  if (variables.removed.length > 0) {
    parts.push(`Removed ${variables.removed.length} variable(s)`);
  }

  return parts.length > 0 ? parts.join(", ") : "No changes";
}
