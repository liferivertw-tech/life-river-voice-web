import type { AiProvider, AiTurn } from "./ai-provider.js";

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
}

function extractOutputText(data: OpenAiResponse): string {
  if (data.output_text?.trim()) return data.output_text.trim();
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generateReply(history: AiTurn[]): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: "你是小河，一位溫暖、自然、簡潔的繁體中文語音助理。除非使用者要求，回答保持精簡。不可假裝知道即時資訊；需要工具但尚未提供時，要坦白說明。",
        input: history.map(({ role, content }) => ({ role, content }))
      })
    });

    const data = await response.json() as OpenAiResponse;
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI request failed (${response.status})`);
    const text = extractOutputText(data);
    if (!text) throw new Error("OpenAI returned an empty response.");
    return text;
  }
}
