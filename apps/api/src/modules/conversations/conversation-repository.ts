import type { AiTurn } from "../ai/ai-provider.js";

export interface StoredMessage extends AiTurn {
  id: string;
  conversationId: string;
  createdAt: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface ConversationRepository {
  ensureConversation(id?: string): Promise<string>;
  listConversations?(): Promise<ConversationSummary[]>;
  listMessages(conversationId: string): Promise<StoredMessage[]>;
  addMessage(conversationId: string, role: AiTurn["role"], content: string): Promise<StoredMessage>;
}
