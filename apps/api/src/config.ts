import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://life_river:life_river@127.0.0.1:55432/life_river?schema=public"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  AI_MODEL: z.string().default("gpt-5.6-luna"),
  AI_API_KEY: z.string().default(""),
  TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  TTS_VOICE: z.string().default("marin")
});

export const config = schema.parse(process.env);
