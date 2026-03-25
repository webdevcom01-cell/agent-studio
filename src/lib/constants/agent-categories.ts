/**
 * Unified canonical category system for Agent Studio.
 * Single source of truth used across: template gallery, marketplace/discover,
 * agent PATCH validation, and discover API.
 *
 * Adding a category here propagates to all consumers automatically.
 */

export interface CategoryMeta {
  id: string;
  label: string;
  emoji: string;
  /** Named Tailwind color — used to generate bg/text classes */
  color: string;
  description: string;
}

export const AGENT_CATEGORY_METADATA: CategoryMeta[] = [
  { id: "assistant",          label: "Assistant",          emoji: "🤖", color: "blue",   description: "General-purpose AI assistants" },
  { id: "research",           label: "Research",           emoji: "🔍", color: "purple", description: "Research and analysis agents" },
  { id: "writing",            label: "Writing",            emoji: "✍️",  color: "green",  description: "Content creation and editing" },
  { id: "coding",             label: "Coding",             emoji: "💻", color: "orange", description: "Code generation and development" },
  { id: "design",             label: "Design",             emoji: "🎨", color: "pink",   description: "UI/UX and visual design" },
  { id: "marketing",          label: "Marketing",          emoji: "📣", color: "yellow", description: "Marketing and growth" },
  { id: "support",            label: "Support",            emoji: "🎧", color: "teal",   description: "Customer support and service" },
  { id: "data",               label: "Data",               emoji: "📊", color: "cyan",   description: "Data analysis and visualization" },
  { id: "education",          label: "Education",          emoji: "🎓", color: "amber",  description: "Teaching and training" },
  { id: "productivity",       label: "Productivity",       emoji: "⚡", color: "indigo", description: "Workflow automation" },
  { id: "specialized",        label: "Specialized",        emoji: "🔧", color: "gray",   description: "Domain-specific agents" },
  { id: "engineering",        label: "Engineering",        emoji: "⚙️",  color: "slate",  description: "Software engineering workflows" },
  { id: "testing",            label: "Testing",            emoji: "🧪", color: "lime",   description: "QA and testing automation" },
  { id: "product",            label: "Product",            emoji: "📋", color: "amber",  description: "Product management" },
  { id: "project-management", label: "Project Management", emoji: "📅", color: "sky",    description: "Project planning and tracking" },
  { id: "game-development",   label: "Game Development",   emoji: "🎮", color: "violet", description: "Game design and development" },
  { id: "spatial-computing",  label: "Spatial Computing",  emoji: "🥽", color: "rose",   description: "XR/AR/VR applications" },
  { id: "paid-media",         label: "Paid Media",         emoji: "💰", color: "red",    description: "Advertising and paid campaigns" },
  { id: "desktop-automation", label: "Desktop Automation", emoji: "🖥️", color: "emerald", description: "Desktop app control via CLI bridge" },
  { id: "developer-agents",  label: "Developer Agents",  emoji: "🛠️", color: "fuchsia", description: "ECC specialized development agents" },
];

export const AGENT_CATEGORIES = AGENT_CATEGORY_METADATA.map(
  (c) => c.id
) as unknown as readonly [string, ...string[]];

export type AgentCategory = (typeof AGENT_CATEGORY_METADATA)[number]["id"];

/**
 * Get full metadata for a category by ID.
 * Returns undefined if not found — callers should handle gracefully.
 */
export function getCategoryMeta(id: string): CategoryMeta | undefined {
  return AGENT_CATEGORY_METADATA.find((c) => c.id === id);
}

/**
 * Tailwind color class pairs for each named color token.
 * Covers all colors used in AGENT_CATEGORY_METADATA.
 */
export const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  green:  "bg-green-500/10 text-green-600 dark:text-green-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  pink:   "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  yellow: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  teal:   "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  cyan:   "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  amber:  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  gray:   "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  slate:  "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  lime:   "bg-lime-500/10 text-lime-600 dark:text-lime-400",
  sky:    "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rose:   "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  red:    "bg-red-500/10 text-red-600 dark:text-red-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
};
