import { describe, it, expect } from "vitest";
import { resolveEffectiveTierOverride } from "../tier-override";

describe("resolveEffectiveTierOverride", () => {
  it("returns the active tier when set and the node does not opt out", () => {
    expect(
      resolveEffectiveTierOverride({}, { __model_tier_override: "fast" }),
    ).toBe("fast");
    expect(
      resolveEffectiveTierOverride({}, { __model_tier_override: "balanced" }),
    ).toBe("balanced");
    expect(
      resolveEffectiveTierOverride({}, { __model_tier_override: "powerful" }),
    ).toBe("powerful");
  });

  it("returns undefined when the node opts out via ignoreTierOverride", () => {
    expect(
      resolveEffectiveTierOverride(
        { ignoreTierOverride: true },
        { __model_tier_override: "fast" },
      ),
    ).toBeUndefined();
  });

  it("returns undefined when there is no override", () => {
    expect(resolveEffectiveTierOverride({}, {})).toBeUndefined();
  });

  it("ignores invalid override values", () => {
    expect(
      resolveEffectiveTierOverride({}, { __model_tier_override: "ludicrous" }),
    ).toBeUndefined();
    expect(
      resolveEffectiveTierOverride({}, { __model_tier_override: 123 }),
    ).toBeUndefined();
  });

  it("opt-out must be exactly true, not merely truthy", () => {
    expect(
      resolveEffectiveTierOverride(
        { ignoreTierOverride: "yes" },
        { __model_tier_override: "fast" },
      ),
    ).toBe("fast");
  });
});
