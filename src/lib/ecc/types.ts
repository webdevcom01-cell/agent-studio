export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  origin?: string;
  inputs?: SkillParam[];
  outputs?: SkillParam[];
  tags?: string[];
  category?: string;
  language?: string;
}

export interface SkillParam {
  name: string;
  type: string;
  required?: boolean;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  content: string;
  slug: string;
}

export interface SkillIngestResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: { slug: string; error: string }[];
}
