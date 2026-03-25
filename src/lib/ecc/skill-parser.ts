import type { SkillFrontmatter, ParsedSkill } from "./types";

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

export function parseSkillMd(raw: string, slug: string): ParsedSkill {
  const match = raw.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error(`No YAML frontmatter found in skill: ${slug}`);
  }

  const yamlBlock = match[1];
  const content = match[2].trim();
  const frontmatter = parseSimpleYaml(yamlBlock);

  if (!frontmatter.name) {
    throw new Error(`Missing 'name' in frontmatter for skill: ${slug}`);
  }
  if (!frontmatter.description) {
    throw new Error(`Missing 'description' in frontmatter for skill: ${slug}`);
  }

  return { frontmatter, content, slug };
}

function parseSimpleYaml(yaml: string): SkillFrontmatter {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      result[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }

  return {
    name: (result.name as string) ?? "",
    description: (result.description as string) ?? "",
    version: (result.version as string) ?? undefined,
    origin: (result.origin as string) ?? undefined,
    tags: (result.tags as string[]) ?? undefined,
    category: (result.category as string) ?? undefined,
    language: (result.language as string) ?? undefined,
  };
}

export function slugify(dirName: string): string {
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
