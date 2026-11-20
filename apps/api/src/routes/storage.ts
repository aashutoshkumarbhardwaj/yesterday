import type { FastifyInstance } from 'fastify';
import { isR2Configured, saveMediaFile } from '../providers/cloudflare-r2.js';
import { isCloudflareAIConfigured, transcribeWithCloudflareWhisper } from '../providers/cloudflare-ai.js';
import { config } from '../config.js';

export async function registerStorageRoutes(app: FastifyInstance) {
  // Status check for Cloudflare integrations
  app.get('/v1/cloudflare/status', async () => {
    return {
      tunnelReady: true,
      r2Configured: isR2Configured(),
      workersAiConfigured: isCloudflareAIConfigured(),
      bucket: config.cloudflare.r2.bucket,
      accountIdSet: Boolean(config.cloudflare.accountId)
    };
  });

  // Media upload route (stores in Cloudflare R2 bucket)
  app.post('/v1/storage/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'FILE_REQUIRED' });

    const bytes = await file.toBuffer();
    if (!bytes.length) return reply.code(400).send({ error: 'EMPTY_FILE' });

    const fields = file.fields as Record<string, any>;
    const category = typeof fields.category?.value === 'string' ? fields.category.value : 'audio';

    try {
      const result = await saveMediaFile({
        bytes,
        filename: file.filename || 'recording.m4a',
        mimeType: file.mimetype || 'application/octet-stream',
        category: category === 'photos' ? 'photos' : category === 'documents' ? 'documents' : 'audio'
      });

      // Edge caching header
      reply.header('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      return result;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({
        error: 'STORAGE_FAILED',
        message: err instanceof Error ? err.message : 'Upload failed'
      });
    }
  });

  // Optional: Cloudflare Workers AI Whisper transcription fallback
  app.post('/v1/cloudflare/whisper', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'AUDIO_FILE_REQUIRED' });
    const bytes = await file.toBuffer();

    try {
      const result = await transcribeWithCloudflareWhisper(bytes);
      return {
        provider: 'cloudflare-workers-ai',
        model: '@cf/openai/whisper',
        transcript: result.transcript
      };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({
        error: 'CLOUDFLARE_WHISPER_FAILED',
        message: err instanceof Error ? err.message : 'Workers AI error'
      });
    }
  });
}
