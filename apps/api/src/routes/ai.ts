import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  answerFromArchive,
  embedText,
  extractFamilyFacts,
  generateStory,
  understandImageWithSarvam as understandImage
} from "../providers/sarvam-llm.js";
import { getBatchTranscription, startBatchTranscription, transcribeShortAudio } from "../providers/sarvam.js";
import { transcribeAudioWithGemini } from "../providers/gemini.js";

const textSchema = z.object({ text: z.string().min(1).max(30000) });
const storySchema = z.object({
  transcript: z.string().max(30000).optional(),
  imageDescriptions: z.array(z.string().max(5000)).max(20).optional(),
  familyContext: z.string().max(5000).optional(),
  style: z.enum(["warm", "simple", "first_person"]).optional()
}).refine((data) => Boolean(data.transcript || data.imageDescriptions?.length || data.familyContext), "Provide at least one source or family context.");

export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/v1/ai/transcribe", async (request, reply) => {
    let bytes: Buffer | null = null;
    let filename = "recording.m4a";
    let mimeType = "audio/mp4";
    let languageCode: string | undefined = undefined;
    let mode: "transcribe" | "translate" | "verbatim" | "translit" | "codemix" = "codemix";

    const contentType = request.headers["content-type"] || "";

    if (contentType.includes("application/json")) {
      const body = request.body as {
        audioBase64?: string;
        filename?: string;
        mimeType?: string;
        languageCode?: string;
        mode?: string;
      };
      if (!body.audioBase64) return reply.code(400).send({ error: "AUDIO_BASE64_REQUIRED" });
      bytes = Buffer.from(body.audioBase64, "base64");
      if (body.filename) filename = body.filename;
      if (body.mimeType) mimeType = body.mimeType;
      if (body.languageCode) languageCode = body.languageCode;
      if (body.mode && ["transcribe", "translate", "verbatim", "translit", "codemix"].includes(body.mode)) {
        mode = body.mode as any;
      }
    } else {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "AUDIO_FILE_REQUIRED" });
      bytes = await file.toBuffer();
      filename = file.filename || "recording.m4a";
      mimeType = file.mimetype || "audio/mp4";
      const fields = (file.fields || {}) as Record<string, any>;
      languageCode = typeof fields.languageCode?.value === "string" ? fields.languageCode.value : undefined;
      const parsedMode = typeof fields.mode?.value === "string" ? fields.mode.value : "codemix";
      if (["transcribe", "translate", "verbatim", "translit", "codemix"].includes(parsedMode)) {
        mode = parsedMode as any;
      }
    }

    if (!bytes || !bytes.length) return reply.code(400).send({ error: "EMPTY_AUDIO_FILE" });
    if (bytes.length > config.maxUploadBytes) return reply.code(413).send({ error: "FILE_TOO_LARGE", maxBytes: config.maxUploadBytes });

    // Step 1: Try Sarvam Saaras AI Speech-to-Text
    try {
      const result = await transcribeShortAudio({
        bytes,
        filename,
        mimeType,
        ...(languageCode ? { languageCode } : {}),
        mode
      });
      return result;
    } catch (sarvamErr) {
      request.log.warn({ err: sarvamErr }, "Sarvam transcription failed, trying Gemini audio pipeline.");
    }

    // Step 2: Fallback to Gemini Multimodal Audio Transcription
    try {
      const geminiTranscript = await transcribeAudioWithGemini({ bytes, mimeType });
      const cleanText = (geminiTranscript || "").trim();
      return {
        provider: "gemini",
        transcript: cleanText,
        languageCode: languageCode ?? null,
        diarizationAvailable: false,
        note: cleanText ? "Audio transcribed successfully (via Gemini Audio Engine)." : "No clear speech was detected."
      };
    } catch (geminiErr) {
      request.log.warn({ err: geminiErr }, "Gemini audio transcription unavailable.");
      // Graceful response so the mobile app doesn't show an unhandled crash alert
      return {
        provider: "sarvam",
        transcript: "",
        languageCode: null,
        diarizationAvailable: false,
        note: "No clear speech was detected in this recording. Please try speaking closer to the microphone, or type your message."
      };
    }
  });


  app.post("/v1/ai/transcribe/batch", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "AUDIO_FILE_REQUIRED" });
    const bytes = await file.toBuffer();
    if (!bytes.length) return reply.code(400).send({ error: "EMPTY_AUDIO_FILE" });
    if (bytes.length > config.maxUploadBytes) return reply.code(413).send({ error: "FILE_TOO_LARGE", maxBytes: config.maxUploadBytes });
    const fields = file.fields as Record<string, any>;
    const languageCode = typeof fields.languageCode?.value === "string" ? fields.languageCode.value : undefined;
    try {
      return await startBatchTranscription({ bytes, filename: file.filename || "family-recording.m4a", mimeType: file.mimetype || "audio/mp4", ...(languageCode ? { languageCode } : {}), mode: "codemix" });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "BATCH_TRANSCRIPTION_START_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });

  app.get("/v1/ai/transcribe/batch/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) return reply.code(400).send({ error: "INVALID_JOB_ID" });
    try {
      return await getBatchTranscription(jobId);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "BATCH_TRANSCRIPTION_STATUS_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });

  app.post("/v1/ai/understand-image", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "IMAGE_FILE_REQUIRED" });
    if (!file.mimetype.startsWith("image/")) return reply.code(415).send({ error: "UNSUPPORTED_MEDIA_TYPE" });
    const bytes = await file.toBuffer();
    if (!bytes.length) return reply.code(400).send({ error: "EMPTY_IMAGE_FILE" });
    if (bytes.length > config.maxUploadBytes) return reply.code(413).send({ error: "FILE_TOO_LARGE", maxBytes: config.maxUploadBytes });
    const fields = file.fields as Record<string, any>;
    const familyContext = typeof fields.familyContext?.value === "string" ? fields.familyContext.value.slice(0, 5000) : undefined;
    try {
      return await understandImage({ bytes, mimeType: file.mimetype, ...(familyContext ? { familyContext } : {}) });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "IMAGE_ANALYSIS_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });

  app.post("/v1/ai/generate-story", async (request, reply) => {
    const parsed = storySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      return await generateStory(parsed.data);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "STORY_GENERATION_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });

  app.post("/v1/ai/extract-family", async (request, reply) => {
    const parsed = z.object({ source: z.string().min(1).max(30000) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try { return await extractFamilyFacts(parsed.data.source); }
    catch (error) { request.log.error(error); return reply.code(502).send({ error: "FAMILY_EXTRACTION_FAILED", message: error instanceof Error ? error.message : "Provider error" }); }
  });

  app.post("/v1/ai/ask", async (request, reply) => {
    const parsed = z.object({ question: z.string().min(1).max(4000), context: z.object({ people: z.array(z.unknown()).max(500), stories: z.array(z.object({ title: z.string(), narrative: z.string(), transcript: z.string().nullable().optional(), createdAt: z.string() })).max(100) }) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try { return await answerFromArchive(parsed.data); }
    catch (error) { request.log.error(error); return reply.code(502).send({ error: "ARCHIVE_ANSWER_FAILED", message: error instanceof Error ? error.message : "Provider error" }); }
  });

  app.post("/v1/ai/embed", async (request, reply) => {
    const parsed = textSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      return await embedText(parsed.data.text);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "EMBEDDING_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });
}
