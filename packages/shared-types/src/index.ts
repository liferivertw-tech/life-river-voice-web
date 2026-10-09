export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface TextMessageRequest {
  conversationId?: string;
  text: string;
}

export interface TextMessageResponse {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface ConversationMessagesResponse {
  conversationId: string;
  messages: ChatMessage[];
}

export interface ApiError {
  error: { code: string; message: string };
}
