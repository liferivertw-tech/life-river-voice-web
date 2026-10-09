import type { AiProvider, AiTurn } from "./ai-provider.js";

export class DeterministicProvider implements AiProvider {
  readonly name = "deterministic";

  async generateReply(history: AiTurn[]): Promise<string> {
    const latest = [...history].reverse().find((turn) => turn.role === "user");
    const text = latest?.content.trim() ?? "";
    return `小河收到你的訊息：「${text}」。目前使用離線開發模式，之後可接上正式 AI provider。`;
  }
}
