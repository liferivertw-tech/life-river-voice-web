import type { AiProvider } from "./ai-provider.js";
import { DeterministicProvider } from "./deterministic-provider.js";
import { OpenAiProvider } from "./openai-provider.js";

export function createAiProvider(name: string, apiKey = "", model = "gpt-5.6-luna"): AiProvider {
  if (name === "openai" && apiKey) return new OpenAiProvider(apiKey, model);
  return new DeterministicProvider();
}
