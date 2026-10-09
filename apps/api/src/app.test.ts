import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { DeterministicProvider } from "./modules/ai/deterministic-provider.js";
import type { ConversationRepository, StoredMessage } from "./modules/conversations/conversation-repository.js";
import { TextMessageService } from "./modules/messages/text-message-service.js";

class MemoryRepository implements ConversationRepository {
  private messages: StoredMessage[] = [];
  async ensureConversation(id?: string) { return id ?? "conversation-1"; }
  async listMessages(id: string) { return this.messages.filter((message) => message.conversationId === id); }
  async addMessage(conversationId: string, role: StoredMessage["role"], content: string) {
    const message = { id: `message-${this.messages.length + 1}`, conversationId, role, content, createdAt: new Date() };
    this.messages.push(message);
    return message;
  }
}

describe("POST /api/v1/messages/text", () => {
  it("stores both turns and returns a deterministic reply", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp(new TextMessageService(repository, new DeterministicProvider()));
    const response = await app.inject({ method: "POST", url: "/api/v1/messages/text", payload: { text: "你好" } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ conversationId: "conversation-1", userMessage: { content: "你好" }, assistantMessage: { role: "assistant" } });
    expect(await repository.listMessages("conversation-1")).toHaveLength(2);
    await app.close();
  });

  it("rejects blank messages", async () => {
    const app = await buildApp(new TextMessageService(new MemoryRepository(), new DeterministicProvider()));
    const response = await app.inject({ method: "POST", url: "/api/v1/messages/text", payload: { text: "  " } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("loads stored conversation messages", async () => {
    const repository = new MemoryRepository();
    const service = new TextMessageService(repository, new DeterministicProvider());
    await service.send("第一句", "conversation-1");
    const app = await buildApp(service);
    const response = await app.inject({ method: "GET", url: "/api/v1/conversations/conversation-1/messages" });
    expect(response.statusCode).toBe(200);
    expect(response.json().messages).toHaveLength(2);
    await app.close();
  });
});
