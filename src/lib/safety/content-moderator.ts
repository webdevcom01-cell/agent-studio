import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { z } from "zod";

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  severity: "none" | "low" | "medium" | "high";
  reasoning: string;
}

const ModerationSchema = z.object({
  flagged: z.boolean(),
  categories: z.array(z.string()),
  severity: z.enum(["none", "low", "medium", "high"]),
  reasoning: z.string(),
});

/**
 * Content moderation using LLM classification.
 * Checks for: hate speech, violence, self-harm, sexual content, harassment.
 */
export async function moderateContent(
  text: string,
  model: string = "deepseek-chat",
): Promise<ModerationResult> {
  try {
    const { object } = await generateObject({
      model: getModel(model),
      schema: ModerationSchema,
      prompt: `Analyze the following text for harmful content. Check for:
- Hate speech or discrimination
- Violence or threats
- Self-harm content
- Sexual content
- Harassment or bullying
- Illegal activities

Text: "${text.slice(0, 2000)}"

Return whether the content is flagged, which categories apply, severity level, and reasoning.`,
    });

    return object;
  } catch {
    return {
      flagged: false,
      categories: [],
      severity: "none",
      reasoning: "Moderation check unavailable — defaulting to pass",
    };
  }
}
