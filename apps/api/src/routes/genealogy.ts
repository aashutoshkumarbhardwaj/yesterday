import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { analyzeDocumentImage } from "../modules/document/ocr-pipeline.js";
import { exportGedcom, parseGedcom, previewGedcom } from "../modules/genealogy/gedcom.js";
import {
  createFactSuggestion,
  createPerson,
  createRelationship,
  listFamilyPeople,
  listFamilyRelationships
} from "../modules/graph/graph-store.js";
import {
  SUPPORTED_OFFLINE_MODELS,
  getSpeakerMappings,
  saveSpeakerMapping
} from "../modules/audio/speech-pipeline.js";

export async function registerGenealogyRoutes(app: FastifyInstance) {
  // 1. Document OCR Analysis
  app.post("/v1/ai/process-document", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "DOCUMENT_IMAGE_REQUIRED" });
    const bytes = await file.toBuffer();
    if (!bytes.length) return reply.code(400).send({ error: "EMPTY_FILE" });

    const fields = file.fields as Record<string, any>;
    const familyId = typeof fields.familyId?.value === "string" ? fields.familyId.value : undefined;
    const familyContext = typeof fields.familyContext?.value === "string" ? fields.familyContext.value : undefined;

    try {
      const result = await analyzeDocumentImage({
        bytes,
        mimeType: file.mimetype || "image/jpeg",
        familyContext
      });

      // If familyId is provided, auto-create fact suggestions for review!
      const createdSuggestionIds: string[] = [];
      if (familyId) {
        for (const fact of result.suggestedFacts) {
          const sugg = createFactSuggestion({
            familyId,
            factType: fact.factType,
            proposedValue: { title: result.title, value: fact.value, subjectName: fact.subjectName },
            confidence: fact.confidence,
            extractionModel: "document-ocr-vision",
            evidence: [{ excerpt: fact.evidenceText }]
          });
          createdSuggestionIds.push(sugg.id);
        }
      }

      return {
        success: true,
        documentAnalysis: result,
        createdSuggestionIds
      };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({
        error: "DOCUMENT_PROCESSING_FAILED",
        message: err instanceof Error ? err.message : "Error processing document"
      });
    }
  });

  // 2. GEDCOM Import Preview (with Duplicate Detection)
  app.post("/v1/genealogy/gedcom/preview", async (request, reply) => {
    const bodySchema = z.object({
      familyId: z.string().min(1),
      gedcomText: z.string().min(10)
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const existingPeople = listFamilyPeople(parsed.data.familyId);
    const preview = previewGedcom(parsed.data.gedcomText, existingPeople);

    return {
      success: true,
      preview
    };
  });

  // 3. GEDCOM Commit Import (with Human Approval)
  app.post("/v1/genealogy/gedcom/import", async (request, reply) => {
    const bodySchema = z.object({
      familyId: z.string().min(1),
      gedcomText: z.string().min(10),
      skipDuplicateIds: z.array(z.string()).default([])
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const { individuals, families } = parseGedcom(parsed.data.gedcomText);
    const skipSet = new Set(parsed.data.skipDuplicateIds);

    const gedIdToPersonId = new Map<string, string>();
    let importedPeople = 0;
    let importedRelationships = 0;

    // Create People
    for (const indi of individuals) {
      if (skipSet.has(indi.id)) continue;
      const created = createPerson({
        familyId: parsed.data.familyId,
        displayName: indi.name,
        aliases: [indi.givenName, indi.surname].filter((x): x is string => Boolean(x)),
        gender: indi.gender || null,
        birthDate: indi.birthDate || null,
        birthYear: indi.birthYear || null,
        birthPlace: indi.birthPlace || null,
        deathDate: indi.deathDate || null,
        notes: indi.notes || null,
        reviewStatus: "confirmed"
      });
      gedIdToPersonId.set(indi.id, created.id);
      importedPeople++;
    }

    // Create Relationships
    for (const fam of families) {
      const husbPersonId = fam.husbandId ? gedIdToPersonId.get(fam.husbandId) : undefined;
      const wifePersonId = fam.wifeId ? gedIdToPersonId.get(fam.wifeId) : undefined;

      // Spouse edge
      if (husbPersonId && wifePersonId) {
        createRelationship({
          familyId: parsed.data.familyId,
          fromPersonId: husbPersonId,
          toPersonId: wifePersonId,
          type: "spouse",
          status: "confirmed",
          evidenceText: fam.marriageDate ? `GEDCOM marriage: ${fam.marriageDate}` : "GEDCOM FAM record"
        });
        importedRelationships++;
      }

      // Parent-Child edges
      for (const childGedId of fam.childrenIds) {
        const childPersonId = gedIdToPersonId.get(childGedId);
        if (!childPersonId) continue;

        if (husbPersonId) {
          createRelationship({
            familyId: parsed.data.familyId,
            fromPersonId: husbPersonId,
            toPersonId: childPersonId,
            type: "parent",
            status: "confirmed",
            evidenceText: "GEDCOM parent link"
          });
          importedRelationships++;
        }
        if (wifePersonId) {
          createRelationship({
            familyId: parsed.data.familyId,
            fromPersonId: wifePersonId,
            toPersonId: childPersonId,
            type: "parent",
            status: "confirmed",
            evidenceText: "GEDCOM parent link"
          });
          importedRelationships++;
        }
      }
    }

    return {
      success: true,
      importedPeople,
      importedRelationships
    };
  });

  // 4. GEDCOM Export (.ged download)
  app.get("/v1/genealogy/gedcom/export", async (request, reply) => {
    const { familyId, familyName } = request.query as { familyId?: string; familyName?: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });

    const people = listFamilyPeople(familyId);
    const relationships = listFamilyRelationships(familyId);
    const gedcom = exportGedcom(people, relationships, familyName || "Family Archive");

    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="family-${familyId}.ged"`);
    return reply.send(gedcom);
  });

  // 5. Offline & On-Device ASR Model Manifests
  app.get("/v1/ai/audio-models", async () => {
    return {
      success: true,
      defaultProvider: "sarvam",
      offlineModels: SUPPORTED_OFFLINE_MODELS
    };
  });

  // 6. Map Anonymous Speaker to Family Member
  app.post("/v1/ai/map-speaker", async (request, reply) => {
    const schema = z.object({
      conversationId: z.string().min(1),
      speakerId: z.string().min(1),
      personId: z.string().min(1),
      personName: z.string().min(1),
      confirmedBy: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });

    saveSpeakerMapping({
      ...parsed.data,
      confirmedAt: new Date().toISOString()
    });

    return {
      success: true,
      message: `Mapped ${parsed.data.speakerId} to ${parsed.data.personName}`
    };
  });

  app.get("/v1/ai/speaker-mappings/:conversationId", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    return {
      success: true,
      mappings: getSpeakerMappings(conversationId)
    };
  });
}

