import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createAiProvider } from "./modules/ai/provider-factory.js";
import { PrismaConversationRepository } from "./modules/conversations/prisma-conversation-repository.js";
import { TextMessageService } from "./modules/messages/text-message-service.js";

const prisma = new PrismaClient();
const service = new TextMessageService(
  new PrismaConversationRepository(prisma),
  createAiProvider(config.AI_PROVIDER, config.AI_API_KEY, config.AI_MODEL)
);
const app = await buildApp(service, config.WEB_ORIGIN, {
  apiKey: config.AI_API_KEY,
  model: config.TTS_MODEL,
  voice: config.TTS_VOICE
});

const shutdown = async () => { await app.close(); await prisma.$disconnect(); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
