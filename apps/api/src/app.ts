import cors from "@fastify/cors";
import type { ApiError, TextMessageRequest } from "@life-river/shared-types";
import Fastify from "fastify";
import { ZodError, z } from "zod";
import { ConversationNotFoundError } from "./modules/conversations/prisma-conversation-repository.js";
import type { TextMessageService } from "./modules/messages/text-message-service.js";

const bodySchema = z.object({ conversationId: z.string().min(1).optional(), text: z.string().trim().min(1).max(10_000) });

interface SpeechOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
}

export async function buildApp(service: TextMessageService, webOrigin = "http://localhost:3000", speech: SpeechOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  await app.register(cors, { origin: webOrigin });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/v1/conversations", async () => service.getConversations());
  app.get<{ Params: { conversationId: string } }>("/api/v1/conversations/:conversationId/messages", async (request) => {
    return service.getMessages(request.params.conversationId);
  });
  app.post<{ Body: { text: string; voice?: string } }>("/api/v1/speech", async (request, reply) => {
    const body = z.object({
      text: z.string().trim().min(1).max(4096),
      voice: z.enum(["marin", "cedar", "coral", "alloy", "onyx", "nova", "sage", "shimmer"]).optional()
    }).parse(request.body);
    if (!speech.apiKey) {
      return reply.code(503).send({ error: { code: "TTS_UNAVAILABLE", message: "Natural voice is not configured." } });
    }
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${speech.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: speech.model ?? "gpt-4o-mini-tts",
        voice: body.voice ?? speech.voice ?? "marin",
        input: body.text,
        instructions: "請用溫暖、自然、親切的台灣華語口吻朗讀，語速稍慢，停頓自然，不要像播報機器。",
        response_format: "mp3"
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI speech request failed (${response.status}): ${detail}`);
    }
    return reply.header("content-type", "audio/mpeg").send(Buffer.from(await response.arrayBuffer()));
  });
  app.post<{ Body: TextMessageRequest }>("/api/v1/messages/text", async (request, reply) => {
    const body = bodySchema.parse(request.body);
    return reply.code(201).send(await service.send(body.text, body.conversationId));
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const body: ApiError = { error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid request" } };
      return reply.code(400).send(body);
    }
    if (error instanceof ConversationNotFoundError) {
      return reply.code(404).send({ error: { code: "CONVERSATION_NOT_FOUND", message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
  });
  return app;
}
