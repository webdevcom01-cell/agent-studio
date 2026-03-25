/**
 * Metadata filtering engine for Knowledge Base search results.
 *
 * Supports filtering by chunk metadata (JSONB), source fields (type, name, language),
 * and nested dot-notation paths. Provides both in-memory evaluation and SQL generation.
 */

export type MetadataFilterOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "in" | "nin" | "contains" | "exists";

export interface MetadataFilterCondition {
  field: string;
  operator: MetadataFilterOperator;
  value: unknown;
}

export interface MetadataFilterGroup {
  operator: "and" | "or";
  conditions: (MetadataFilterCondition | MetadataFilterGroup)[];
}

export type MetadataFilter = MetadataFilterCondition | MetadataFilterGroup;

function isGroup(filter: MetadataFilter): filter is MetadataFilterGroup {
  return "conditions" in filter;
}

// ── In-memory evaluation ─────────────────────────────────────────────────

function resolveField(
  field: string,
  metadata: Record<string, unknown>,
  sourceInfo?: { type: string; name: string; language?: string }
): unknown {
  if (field.startsWith("source.")) {
    const sourceField = field.slice(7);
    if (!sourceInfo) return undefined;
    return (sourceInfo as Record<string, unknown>)[sourceField];
  }

  if (field.startsWith("metadata.")) {
    field = field.slice(9);
  }

  const parts = field.split(".");
  let current: unknown = metadata;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(
  condition: MetadataFilterCondition,
  metadata: Record<string, unknown>,
  sourceInfo?: { type: string; name: string; language?: string }
): boolean {
  const value = resolveField(condition.field, metadata, sourceInfo);

  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "gt":
      return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
    case "gte":
      return typeof value === "number" && typeof condition.value === "number" && value >= condition.value;
    case "lt":
      return typeof value === "number" && typeof condition.value === "number" && value < condition.value;
    case "lte":
      return typeof value === "number" && typeof condition.value === "number" && value <= condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(value);
    case "nin":
      return Array.isArray(condition.value) && !condition.value.includes(value);
    case "contains":
      return typeof value === "string" && typeof condition.value === "string" && value.includes(condition.value);
    case "exists":
      return condition.value ? value !== undefined && value !== null : value === undefined || value === null;
    default:
      return true;
  }
}

export function evaluateFilter(
  filter: MetadataFilter,
  metadata: Record<string, unknown>,
  sourceInfo?: { type: string; name: string; language?: string }
): boolean {
  if (isGroup(filter)) {
    const results = filter.conditions.map((c) => evaluateFilter(c, metadata, sourceInfo));
    return filter.operator === "and"
      ? results.every(Boolean)
      : results.some(Boolean);
  }
  return evaluateCondition(filter, metadata, sourceInfo);
}

// ── SQL generation ───────────────────────────────────────────────────────

const SOURCE_FIELD_MAP: Record<string, string> = {
  "source.type": 's."type"',
  "source.name": 's."name"',
  "source.language": 's."language"',
  "source.status": 's."status"',
};

function fieldToSQL(field: string): string {
  if (SOURCE_FIELD_MAP[field]) return SOURCE_FIELD_MAP[field];

  const metaField = field.startsWith("metadata.") ? field.slice(9) : field;
  return `c."metadata"->>'${metaField.replace(/'/g, "''")}'`;
}

function operatorToSQL(
  sqlField: string,
  op: MetadataFilterOperator,
  paramIndex: number
): { sql: string; castNumeric: boolean } {
  switch (op) {
    case "eq":
      return { sql: `${sqlField} = $${paramIndex}`, castNumeric: false };
    case "neq":
      return { sql: `${sqlField} != $${paramIndex}`, castNumeric: false };
    case "gt":
      return { sql: `(${sqlField})::numeric > $${paramIndex}`, castNumeric: true };
    case "gte":
      return { sql: `(${sqlField})::numeric >= $${paramIndex}`, castNumeric: true };
    case "lt":
      return { sql: `(${sqlField})::numeric < $${paramIndex}`, castNumeric: true };
    case "lte":
      return { sql: `(${sqlField})::numeric <= $${paramIndex}`, castNumeric: true };
    case "in":
      return { sql: `${sqlField} = ANY($${paramIndex})`, castNumeric: false };
    case "nin":
      return { sql: `${sqlField} != ALL($${paramIndex})`, castNumeric: false };
    case "contains":
      return { sql: `${sqlField} ILIKE '%' || $${paramIndex} || '%'`, castNumeric: false };
    case "exists":
      return { sql: `${sqlField} IS NOT NULL`, castNumeric: false };
    default:
      return { sql: "TRUE", castNumeric: false };
  }
}

interface SQLClause {
  sql: string;
  params: unknown[];
}

function buildConditionSQL(
  condition: MetadataFilterCondition,
  startParam: number
): SQLClause {
  const sqlField = fieldToSQL(condition.field);
  const { sql, castNumeric } = operatorToSQL(sqlField, condition.operator, startParam);

  if (condition.operator === "exists") {
    return { sql, params: [] };
  }

  const paramValue = castNumeric ? Number(condition.value) : condition.value;
  return { sql, params: [paramValue] };
}

function buildGroupSQL(filter: MetadataFilter, startParam: number): SQLClause {
  if (!isGroup(filter)) {
    return buildConditionSQL(filter, startParam);
  }

  const parts: string[] = [];
  const allParams: unknown[] = [];
  let paramIdx = startParam;

  for (const cond of filter.conditions) {
    const clause = buildGroupSQL(cond, paramIdx);
    parts.push(clause.sql);
    allParams.push(...clause.params);
    paramIdx += clause.params.length;
  }

  const joiner = filter.operator === "and" ? " AND " : " OR ";
  return {
    sql: parts.length > 1 ? `(${parts.join(joiner)})` : parts[0] ?? "TRUE",
    params: allParams,
  };
}

export function buildMetadataWhereClause(
  filter: MetadataFilter | undefined | null
): SQLClause {
  if (!filter) return { sql: "", params: [] };
  const result = buildGroupSQL(filter, 1);
  return { sql: result.sql ? ` AND ${result.sql}` : "", params: result.params };
}
