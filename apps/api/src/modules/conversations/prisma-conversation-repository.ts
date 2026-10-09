import type { PrismaClient } from "@prisma/client";
import type { AiTurn } from "../ai/ai-provider.js";
import type { ConversationRepository, ConversationSummary, StoredMessage } from "./conversation-repository.js";

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureConversation(id?: string): Promise<string> {
    if (!id) return (await this.prisma.conversation.create({ data: {} })).id;
    const conversation = await this.prisma.conversation.findUnique({ where: { id }, select: { id: true } });
    if (!conversation) throw new ConversationNotFoundError(id);
    return conversation.id;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: { where: { role: "user" }, orderBy: { createdAt: "asc" }, take: 1, select: { content: true } }
      }
    });
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title ?? conversation.messages[0]?.content.slice(0, 32) ?? "新對話",
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation._count.messages
    }));
  }

  async listMessages(conversationId: string): Promise<StoredMessage[]> {
    return this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  }

  async addMessage(conversationId: string, role: AiTurn["role"], content: string): Promise<StoredMessage> {
    const message = await this.prisma.message.create({ data: { conversationId, role, content } });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    if (role === "user") {
      await this.prisma.conversation.updateMany({
        where: { id: conversationId, title: null },
        data: { title: content.slice(0, 32) }
      });
    }
    return message;
  }
}

export class ConversationNotFoundError extends Error {
  constructor(id: string) { super(`Conversation ${id} was not found.`); }
}
