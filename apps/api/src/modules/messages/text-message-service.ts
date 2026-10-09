import type { ConversationMessagesResponse, TextMessageResponse } from "@life-river/shared-types";
import type { AiProvider } from "../ai/ai-provider.js";
import type { ConversationRepository, StoredMessage } from "../conversations/conversation-repository.js";

const toDto = (message: StoredMessage) => ({ ...message, createdAt: message.createdAt.toISOString() });

export class TextMessageService {
  constructor(private readonly repository: ConversationRepository, private readonly ai: AiProvider) {}

  async send(text: string, requestedConversationId?: string): Promise<TextMessageResponse> {
    const conversationId = await this.repository.ensureConversation(requestedConversationId);
    const userMessage = await this.repository.addMessage(conversationId, "user", text);
    const history = await this.repository.listMessages(conversationId);
    const reply = await this.ai.generateReply(history.map(({ role, content }) => ({ role, content })));
    const assistantMessage = await this.repository.addMessage(conversationId, "assistant", reply);
    return { conversationId, userMessage: toDto(userMessage), assistantMessage: toDto(assistantMessage) };
  }

  async getMessages(conversationId: string): Promise<ConversationMessagesResponse> {
    await this.repository.ensureConversation(conversationId);
    const messages = await this.repository.listMessages(conversationId);
    return { conversationId, messages: messages.map(toDto) };
  }

  async getConversations() {
    const conversations = await this.repository.listConversations?.() ?? [];
    return {
      conversations: conversations.map((conversation) => ({
        ...conversation,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString()
      }))
    };
  }
}
