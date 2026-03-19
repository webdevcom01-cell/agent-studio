import { describe, it, expect } from "vitest";
import { parseSkillMd, slugify } from "../skill-parser";

describe("parseSkillMd", () => {
  it("parses valid SKILL.md with name and description", () => {
    const raw = `---
name: api-design
description: REST API design patterns
origin: ECC
---

# API Design Patterns

Content here.`;

    const result = parseSkillMd(raw, "api-design");
    expect(result.slug).toBe("api-design");
    expect(result.frontmatter.name).toBe("api-design");
    expect(result.frontmatter.description).toBe("REST API design patterns");
    expect(result.frontmatter.origin).toBe("ECC");
    expect(result.content).toBe("# API Design Patterns\n\nContent here.");
  });

  it("parses tags as arrays", () => {
    const raw = `---
name: test-skill
description: A test skill
tags: [typescript, testing, security]
---

Body content.`;

    const result = parseSkillMd(raw, "test-skill");
    expect(result.frontmatter.tags).toEqual(["typescript", "testing", "security"]);
  });

  it("parses optional fields", () => {
    const raw = `---
name: python-patterns
description: Python best practices
version: 2.0.0
category: development
language: python
---

Content.`;

    const result = parseSkillMd(raw, "python-patterns");
    expect(result.frontmatter.version).toBe("2.0.0");
    expect(result.frontmatter.category).toBe("development");
    expect(result.frontmatter.language).toBe("python");
  });

  it("throws on missing frontmatter", () => {
    expect(() => parseSkillMd("No frontmatter here", "bad")).toThrow(
      "No YAML frontmatter found"
    );
  });

  it("throws on missing name", () => {
    const raw = `---
description: Has description but no name
---

Body.`;

    expect(() => parseSkillMd(raw, "no-name")).toThrow("Missing 'name'");
  });

  it("throws on missing description", () => {
    const raw = `---
name: has-name
---

Body.`;

    expect(() => parseSkillMd(raw, "no-desc")).toThrow("Missing 'description'");
  });

  it("handles quoted values", () => {
    const raw = `---
name: "quoted-name"
description: 'single quoted desc'
---

Body.`;

    const result = parseSkillMd(raw, "quoted");
    expect(result.frontmatter.name).toBe("quoted-name");
    expect(result.frontmatter.description).toBe("single quoted desc");
  });

  it("handles empty tags array", () => {
    const raw = `---
name: no-tags
description: No tags skill
tags: []
---

Body.`;

    const result = parseSkillMd(raw, "no-tags");
    expect(result.frontmatter.tags).toEqual([]);
  });

  it("ignores comment lines in YAML", () => {
    const raw = `---
name: commented
# This is a comment
description: Has comments
---

Body.`;

    const result = parseSkillMd(raw, "commented");
    expect(result.frontmatter.name).toBe("commented");
    expect(result.frontmatter.description).toBe("Has comments");
  });
});

describe("slugify", () => {
  it("converts to lowercase kebab-case", () => {
    expect(slugify("API Design")).toBe("api-design");
  });

  it("replaces special chars with hyphens and collapses them", () => {
    expect(slugify("c++_testing")).toBe("c-testing");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("a--b---c")).toBe("a-b-c");
  });

  it("strips leading/trailing hyphens", () => {
    expect(slugify("-leading-trailing-")).toBe("leading-trailing");
  });

  it("handles already valid slugs", () => {
    expect(slugify("api-design")).toBe("api-design");
  });
});
