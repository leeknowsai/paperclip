// Parse X profile bio and links to extract contact channels.

export interface EnrichedChannels {
  x_dm: boolean;
  telegram: string | null;
  discord: string | null;
  linkedin: string | null;
  email: string | null;
  website: string | null;
}

/** Extract channel info from X profile bio and external URL. */
export function parseChannelsFromBio(
  bio: string,
  externalUrl: string | null
): EnrichedChannels {
  const allText = `${bio} ${externalUrl ?? ""}`;

  return {
    x_dm: true,
    telegram: extractPattern(allText, [
      /t\.me\/([a-zA-Z0-9_]+)/,
      /telegram[:\s]*@?([a-zA-Z0-9_]+)/i,
    ]),
    discord: extractPattern(allText, [
      /discord\.gg\/([a-zA-Z0-9]+)/,
      /discord\.com\/invite\/([a-zA-Z0-9]+)/,
    ]),
    linkedin: extractPattern(allText, [
      /linkedin\.com\/(?:in|company)\/([a-zA-Z0-9_-]+)/,
    ]),
    email: extractEmail(allText),
    website: externalUrl || null,
  };
}

function extractPattern(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

/** Convert EnrichedChannels to channels_available format for DB. */
export function toChannelsAvailable(channels: EnrichedChannels): Record<string, boolean> {
  return {
    x_dm: channels.x_dm,
    telegram: !!channels.telegram,
    discord: !!channels.discord,
    linkedin: !!channels.linkedin,
    email: !!channels.email,
  };
}
