export interface AiTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiProvider {
  readonly name: string;
  generateReply(history: AiTurn[]): Promise<string>;
}
