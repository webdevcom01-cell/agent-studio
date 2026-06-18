import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import {
  trimStepMessages,
  STEP_TRIM_THRESHOLD,
  STEP_TRIM_KEEP_RECENT,
} from "../step-trimmer";

function m(role: ModelMessage["role"], i: number): ModelMessage {
  return { role, content: `c${i}` } as ModelMessage;
}

function build(
  n: number,
  roleAt?: (i: number) => ModelMessage["role"],
): ModelMessage[] {
  return Array.from({ length: n }, (_, i) =>
    m(
      roleAt ? roleAt(i) : i === 0 ? "user" : i % 2 === 1 ? "assistant" : "user",
      i,
    ),
  );
}

describe("trimStepMessages", () => {
  it("returns undefined at or below threshold", () => {
    expect(trimStepMessages(build(STEP_TRIM_THRESHOLD))).toBeUndefined();
    expect(trimStepMessages(build(10))).toBeUndefined();
  });

  it("trims to head + recent tail when over threshold", () => {
    const msgs = build(100);
    const out = trimStepMessages(msgs)!;
    expect(out[0]).toBe(msgs[0]); // anchor preserved
    expect(out.at(-1)).toBe(msgs.at(-1)); // most-recent preserved
    expect(out.length).toBeLessThanOrEqual(1 + STEP_TRIM_KEEP_RECENT);
  });

  it("never lets the retained tail begin with an orphan tool result", () => {
    const n = 100;
    const cut = n - STEP_TRIM_KEEP_RECENT; // natural cut point
    const msgs = build(n, (i) =>
      i === 0
        ? "user"
        : i === cut || i === cut + 1
          ? "tool"
          : i % 2 === 1
            ? "assistant"
            : "user",
    );
    const out = trimStepMessages(msgs)!;
    // out[0] is the head anchor; the first retained tail message must not be a
    // `tool` result whose originating tool-call was dropped.
    expect(out[1].role).not.toBe("tool");
  });

  it("respects custom threshold and keepRecent", () => {
    const msgs = build(20);
    const out = trimStepMessages(msgs, { threshold: 5, keepRecent: 3 })!;
    expect(out[0]).toBe(msgs[0]);
    expect(out.at(-1)).toBe(msgs.at(-1));
    expect(out.length).toBeLessThanOrEqual(1 + 3);
  });
});
