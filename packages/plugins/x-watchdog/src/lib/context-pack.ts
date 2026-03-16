// Generates AI-powered context packs for BD leads.
// Uses the existing LLM provider system (llm-providers.ts).

import type { SignalType } from "./signal-detector.js";

export interface ContextPack {
  lead_summary: string;
  signal: string;
  signal_type: SignalType;
  bd_angle: string;
  urgency: "hot" | "warm" | "cold";
  drafted_messages: Record<string, string>;
  suggested_action: string;
}

interface ContextPackInput {
  tweetText: string;
  handle: string;
  followers: number | null;
  bio: string | null;
  projectName: string;
  projectDocs: string | null;
  outreachTemplates: Record<string, string> | null;
  availableChannels: string[];
}

/** Build the LLM prompt for context pack generation. */
export function buildContextPackPrompt(input: ContextPackInput): string {
  const channelList = input.availableChannels.join(", ");
  const templateSection = input.outreachTemplates
    ? Object.entries(input.outreachTemplates)
        .map(([ch, tpl]) => `${ch}: "${tpl}"`)
        .join("\n")
    : "No templates provided — write natural outreach messages.";

  return `You are a BD assistant for ${input.projectName}.

Product info:
${input.projectDocs ?? "No product docs provided."}

Outreach message templates (use as inspiration, personalize based on the tweet):
${templateSection}

Tweet from @${input.handle}${input.followers ? ` (${input.followers} followers)` : ""}:
"${input.tweetText}"

${input.bio ? `Bio: "${input.bio}"` : ""}

Available outreach channels: ${channelList}

Generate a JSON context pack with this EXACT structure:
{
  "lead_summary": "Brief: who is this person/project, social presence",
  "signal": "What did they just do/announce? (factual, from the tweet)",
  "signal_type": "product_launch|feature_update|partnership|milestone|campaign_event|fundraising|general",
  "bd_angle": "How ${input.projectName} can help based on this signal",
  "urgency": "hot|warm|cold",
  "drafted_messages": { ${input.availableChannels.map((ch) => `"${ch}": "personalized message for ${ch}"`).join(", ")} },
  "suggested_action": "Which channel to use first, timing, approach"
}

Rules:
- Signal is what they DID, not what they're seeking
- BD angle is how OUR product helps THEIR situation
- Messages must reference the specific tweet/announcement
- Keep messages concise (2-3 sentences max)
- Use template style as guide but personalize
- Return ONLY valid JSON, no markdown`;
}

/** Parse LLM response into ContextPack. Returns null on parse failure. */
export function parseContextPack(response: string): ContextPack | null {
  try {
    const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.lead_summary || !parsed.signal || !parsed.bd_angle) {
      console.error("[context-pack] Missing required fields in AI response");
      return null;
    }

    return {
      lead_summary: parsed.lead_summary,
      signal: parsed.signal,
      signal_type: parsed.signal_type || "general",
      bd_angle: parsed.bd_angle,
      urgency: ["hot", "warm", "cold"].includes(parsed.urgency) ? parsed.urgency : "warm",
      drafted_messages: parsed.drafted_messages || {},
      suggested_action: parsed.suggested_action || "",
    };
  } catch (err) {
    console.error("[context-pack] Failed to parse AI response:", err);
    return null;
  }
}
