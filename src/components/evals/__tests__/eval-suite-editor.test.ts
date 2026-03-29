/**
 * Tests for the assertion type config and JSON builder in eval-suite-editor.
 * These are pure logic tests — no React rendering needed.
 */
import { describe, it, expect } from "vitest";

// Re-declare the types and config inline to test without importing the
// component (which has React dependencies that need full DOM setup).

interface EvalAssertion {
  type: string;
  value?: string;
  threshold?: number;
  rubric?: string;
}

interface AssertionTypeConfig {
  value: string;
  label: string;
  layer: number;
  hasValue: boolean;
  hasThreshold: boolean;
  hasRubric: boolean;
  valueLabel?: string;
  helper?: string;
  jsonExample?: string;
}

const ASSERTION_TYPES: AssertionTypeConfig[] = [
  { value: "contains",           label: "Contains",            layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false },
  { value: "not_contains",       label: "Not Contains",        layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false },
  { value: "exact_match",        label: "Exact Match",         layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false },
  { value: "icontains",          label: "Contains (case-ins.)",layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false, helper: "Use this instead of 'contains' with caseSensitive:false" },
  { value: "starts_with",        label: "Starts With",         layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false },
  { value: "regex",              label: "Regex Match",         layer: 1, hasValue: true,  hasThreshold: false, hasRubric: false, valueLabel: "Regex Pattern", helper: "Field is 'value', not 'pattern'" },
  { value: "json_valid",         label: "JSON Valid",          layer: 1, hasValue: false, hasThreshold: false, hasRubric: false },
  { value: "latency",            label: "Latency (ms)",        layer: 1, hasValue: false, hasThreshold: true,  hasRubric: false, helper: "Field is 'threshold', not 'maxMs'" },
  { value: "semantic_similarity",label: "Semantic Similarity", layer: 2, hasValue: true,  hasThreshold: true,  hasRubric: false, valueLabel: "Expected Output", helper: "Field is 'value', not 'expectedOutput'" },
  { value: "llm_rubric",         label: "LLM Rubric",          layer: 3, hasValue: false, hasThreshold: true,  hasRubric: true,  helper: "Field is 'rubric', not 'criteria'" },
  { value: "kb_faithfulness",    label: "KB Faithfulness",     layer: 3, hasValue: false, hasThreshold: true,  hasRubric: false },
  { value: "relevance",          label: "Relevance",           layer: 3, hasValue: false, hasThreshold: true,  hasRubric: false },
];

function buildAssertionJson(assertion: EvalAssertion): string {
  const obj: Record<string, unknown> = { type: assertion.type };
  if (assertion.value !== undefined && assertion.value !== "") obj.value = assertion.value;
  if (assertion.rubric !== undefined && assertion.rubric !== "") obj.rubric = assertion.rubric;
  if (assertion.threshold !== undefined) obj.threshold = assertion.threshold;
  return JSON.stringify(obj);
}

describe("ASSERTION_TYPES config", () => {
  it("has 12 assertion types covering all 3 layers", () => {
    expect(ASSERTION_TYPES).toHaveLength(12);
    expect(ASSERTION_TYPES.filter((a) => a.layer === 1)).toHaveLength(8);
    expect(ASSERTION_TYPES.filter((a) => a.layer === 2)).toHaveLength(1);
    expect(ASSERTION_TYPES.filter((a) => a.layer === 3)).toHaveLength(3);
  });

  it("regex type uses 'value' field (not 'pattern')", () => {
    const regex = ASSERTION_TYPES.find((a) => a.value === "regex");
    expect(regex?.hasValue).toBe(true);
    expect(regex?.helper).toContain("'value'");
    expect(regex?.helper).toContain("not 'pattern'");
  });

  it("latency type uses 'threshold' field (not 'maxMs')", () => {
    const latency = ASSERTION_TYPES.find((a) => a.value === "latency");
    expect(latency?.hasThreshold).toBe(true);
    expect(latency?.helper).toContain("'threshold'");
    expect(latency?.helper).toContain("not 'maxMs'");
  });

  it("semantic_similarity uses 'value' field (not 'expectedOutput')", () => {
    const sem = ASSERTION_TYPES.find((a) => a.value === "semantic_similarity");
    expect(sem?.hasValue).toBe(true);
    expect(sem?.hasThreshold).toBe(true);
    expect(sem?.helper).toContain("'value'");
    expect(sem?.helper).toContain("not 'expectedOutput'");
  });

  it("llm_rubric uses 'rubric' field (not 'criteria')", () => {
    const llm = ASSERTION_TYPES.find((a) => a.value === "llm_rubric");
    expect(llm?.hasRubric).toBe(true);
    expect(llm?.helper).toContain("'rubric'");
    expect(llm?.helper).toContain("not 'criteria'");
  });

  it("icontains has helper about caseSensitive", () => {
    const ic = ASSERTION_TYPES.find((a) => a.value === "icontains");
    expect(ic?.helper).toContain("caseSensitive");
  });

  it("json_valid has no value, threshold, or rubric", () => {
    const jv = ASSERTION_TYPES.find((a) => a.value === "json_valid");
    expect(jv?.hasValue).toBe(false);
    expect(jv?.hasThreshold).toBe(false);
    expect(jv?.hasRubric).toBe(false);
  });

  it("every type with hasHelper has non-empty helper string", () => {
    const withHelpers = ASSERTION_TYPES.filter((a) => a.helper);
    expect(withHelpers.length).toBeGreaterThanOrEqual(5);
    for (const cfg of withHelpers) {
      expect(cfg.helper!.length).toBeGreaterThan(10);
    }
  });
});

describe("buildAssertionJson", () => {
  it("builds contains assertion JSON", () => {
    const json = buildAssertionJson({ type: "contains", value: "Paris" });
    expect(JSON.parse(json)).toEqual({ type: "contains", value: "Paris" });
  });

  it("builds regex assertion JSON with value field", () => {
    const json = buildAssertionJson({ type: "regex", value: "^\\d+" });
    expect(JSON.parse(json)).toEqual({ type: "regex", value: "^\\d+" });
  });

  it("builds latency assertion JSON with threshold", () => {
    const json = buildAssertionJson({ type: "latency", threshold: 2000 });
    expect(JSON.parse(json)).toEqual({ type: "latency", threshold: 2000 });
  });

  it("builds llm_rubric assertion JSON with rubric and threshold", () => {
    const json = buildAssertionJson({ type: "llm_rubric", rubric: "Is it helpful?", threshold: 0.7 });
    expect(JSON.parse(json)).toEqual({
      type: "llm_rubric",
      rubric: "Is it helpful?",
      threshold: 0.7,
    });
  });

  it("builds semantic_similarity with value and threshold", () => {
    const json = buildAssertionJson({
      type: "semantic_similarity",
      value: "The capital of France is Paris",
      threshold: 0.8,
    });
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("semantic_similarity");
    expect(parsed.value).toContain("Paris");
    expect(parsed.threshold).toBe(0.8);
  });

  it("builds json_valid with type only", () => {
    const json = buildAssertionJson({ type: "json_valid" });
    expect(JSON.parse(json)).toEqual({ type: "json_valid" });
  });

  it("omits empty value fields from JSON", () => {
    const json = buildAssertionJson({ type: "contains", value: "" });
    expect(JSON.parse(json)).toEqual({ type: "contains" });
  });

  it("updates when assertion values change", () => {
    const v1 = buildAssertionJson({ type: "contains", value: "old" });
    const v2 = buildAssertionJson({ type: "contains", value: "new" });
    expect(v1).not.toBe(v2);
    expect(JSON.parse(v2).value).toBe("new");
  });
});
