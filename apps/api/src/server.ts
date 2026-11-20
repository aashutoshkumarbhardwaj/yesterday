import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerGraphRoutes } from "./routes/graph.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerStorageRoutes } from "./routes/storage.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerGenealogyRoutes } from "./routes/genealogy.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerSocialRoutes } from "./routes/social.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerShareRoutes } from "./routes/share.js";

const app = Fastify({ logger: true, bodyLimit: config.maxUploadBytes + 1024 * 1024 });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

app.addHook("onRequest", async (request, reply) => {
  if (!config.apiToken || request.url === "/health" || request.url.startsWith("/v1/auth")) return;
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${config.apiToken}`) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
});

app.get("/health", async () => ({ status: "ok", service: "yesterday-api", version: "0.4.0" }));
app.get("/v1/ai/providers", async () => ({
  audio: { provider: "sarvam", configured: Boolean(config.sarvamApiKey), modes: ["transcribe", "translate", "verbatim", "translit", "codemix"], maxDurationSeconds: 60, diarization: false },
  vision: { provider: "sarvam", configured: Boolean(config.sarvamApiKey), model: "glm5.3-flash" },
  story: { provider: "sarvam", configured: Boolean(config.sarvamApiKey), model: "sarvam-105b-conversations" },
  embeddings: { provider: "sarvam", configured: true, model: "sarvam-embedding-fast", dimensions: 768 }
}));
await registerAiRoutes(app);
await registerGraphRoutes(app);
await registerSyncRoutes(app);
await registerStorageRoutes(app);
await registerAuthRoutes(app);
await registerGenealogyRoutes(app);
await registerAgentRoutes(app);
await registerSocialRoutes(app);
await registerNotificationRoutes(app);
await registerShareRoutes(app);

await app.listen({ port: config.port, host: "0.0.0.0" });
