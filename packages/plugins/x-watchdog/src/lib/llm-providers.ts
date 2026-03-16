import OpenAI from "openai";

// Unified interface for chat completion
export interface LlmClient {
  chatCompletion(params: {
    systemPrompt: string;
    userMessage: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
  }): Promise<string | null>;
}

export interface LlmProvider {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
    tier: "cheap" | "balanced" | "premium";
  }>;
}

// Provider registry with popular models
export const PROVIDER_REGISTRY: Record<
  string,
  {
    name: string;
    envKey: string;
    models: Array<{ id: string; name: string; tier: "cheap" | "balanced" | "premium" }>;
  }
> = {
  openai: {
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", tier: "cheap" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", tier: "cheap" },
      { id: "gpt-4.1", name: "GPT-4.1", tier: "balanced" },
      { id: "gpt-4o", name: "GPT-4o", tier: "balanced" },
      { id: "o3-mini", name: "o3-mini", tier: "premium" },
      { id: "o4-mini", name: "o4-mini", tier: "premium" },
    ],
  },
  anthropic: {
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", tier: "cheap" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", tier: "balanced" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", tier: "premium" },
    ],
  },
  google: {
    name: "Google",
    envKey: "GOOGLE_API_KEY",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", tier: "cheap" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "balanced" },
    ],
  },
  mistral: {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    models: [
      { id: "mistral-small-latest", name: "Mistral Small", tier: "cheap" },
      { id: "mistral-medium-latest", name: "Mistral Medium", tier: "balanced" },
      { id: "mistral-large-latest", name: "Mistral Large", tier: "premium" },
    ],
  },
  minimax: {
    name: "MiniMax",
    envKey: "MINIMAX_API_KEY",
    models: [
      { id: "MiniMax-Text-01", name: "MiniMax Text 01", tier: "cheap" },
      { id: "MiniMax-M1", name: "MiniMax M1", tier: "balanced" },
    ],
  },
};

// Detect available providers based on api keys map
export function getAvailableProviders(apiKeys: Record<string, string>): LlmProvider[] {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([_, config]) => !!apiKeys[config.envKey])
    .map(([id, config]) => ({
      id,
      name: config.name,
      models: config.models,
    }));
}

// Create LLM client for a given provider + model
export function createLlmClient(
  apiKeys: Record<string, string>,
  provider: string,
  model: string
): LlmClient {
  const apiKey = apiKeys[PROVIDER_REGISTRY[provider]?.envKey ?? "OPENAI_API_KEY"];

  if (!apiKey) {
    throw new Error(`No API key for provider: ${provider}`);
  }

  switch (provider) {
    case "openai":
      return createOpenAiClient(apiKey, model);
    case "anthropic":
      return createAnthropicClient(apiKey, model);
    case "google":
      return createGoogleClient(apiKey, model);
    case "mistral":
      return createMistralClient(apiKey, model);
    case "minimax":
      return createMiniMaxClient(apiKey, model);
    default:
      return createOpenAiClient(apiKey, model);
  }
}

function createOpenAiClient(apiKey: string, model: string): LlmClient {
  const openai = new OpenAI({ apiKey });
  return {
    async chatCompletion({ systemPrompt, userMessage, temperature, maxTokens, jsonMode }) {
      const res = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(jsonMode && { response_format: { type: "json_object" as const } }),
        },
        { timeout: 60_000 }
      );
      return res.choices[0].message.content ?? null;
    },
  };
}

function createAnthropicClient(apiKey: string, model: string): LlmClient {
  return {
    async chatCompletion({ systemPrompt, userMessage, temperature, maxTokens }) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage + "\n\nReturn JSON only." }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content: Array<{ text: string }> };
      return data.content[0]?.text ?? null;
    },
  };
}

function createGoogleClient(apiKey: string, model: string): LlmClient {
  return {
    async chatCompletion({ systemPrompt, userMessage, temperature, maxTokens }) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userMessage + "\n\nReturn JSON only." }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );
      if (!res.ok) throw new Error(`Google API ${res.status}`);
      const data = (await res.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      return data.candidates[0]?.content.parts[0]?.text ?? null;
    },
  };
}

function createMistralClient(apiKey: string, model: string): LlmClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.mistral.ai/v1",
  });
  return {
    async chatCompletion({ systemPrompt, userMessage, temperature, maxTokens, jsonMode }) {
      const res = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(jsonMode && { response_format: { type: "json_object" as const } }),
        },
        { timeout: 60_000 }
      );
      return res.choices[0].message.content ?? null;
    },
  };
}

function createMiniMaxClient(apiKey: string, model: string): LlmClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.minimax.chat/v1",
  });
  return {
    async chatCompletion({ systemPrompt, userMessage, temperature, maxTokens, jsonMode }) {
      const res = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(jsonMode && { response_format: { type: "json_object" as const } }),
        },
        { timeout: 60_000 }
      );
      return res.choices[0].message.content ?? null;
    },
  };
}
