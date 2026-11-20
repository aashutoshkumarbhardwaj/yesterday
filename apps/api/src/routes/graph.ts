import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { extractFamilyGraph } from "../providers/family-graph.js";
import { interactWithTreeAgent } from "../providers/tree-agent.js";
import { resolveKinship, traceAncestralLine } from "../modules/graph/kinship.js";
import {
  familyGraphExtractionSchema,
  keepEvidenceGrounded,
  resolvePersonMentions,
  validateProposedRelationships,
  type ExistingPerson,
  type ExistingRelationship
} from "../modules/graph/schema.js";
import {
  createFactSuggestion,
  createMergeCandidate,
  createPerson,
  createRelationship,
  getPerson,
  getPersonEvidence,
  getPersonTimeline,
  listFactSuggestions,
  listFamilyPeople,
  listFamilyRelationships,
  listMergeCandidates,
  reviewFactSuggestion,
  reviewMergeCandidate,
  updatePerson,
  type FactSuggestion,
  type FactType,
  type GraphPerson,
  type RelationshipType
} from "../modules/graph/graph-store.js";

const requestSchema = z.object({
  source: z.string().min(1).max(30000),
  existingPeople: z.array(z.object({ id: z.string().min(1), displayName: z.string().min(1), aliases: z.array(z.string()).optional() })).max(1000).default([]),
  existingRelationships: z.array(z.object({ fromPersonId: z.string(), toPersonId: z.string(), type: z.string() })).max(5000).default([])
});

const interviewSchema = z.object({
  message: z.string().min(1).max(10000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
  currentPeople: z.array(z.object({
    id: z.string(),
    name: z.string(),
    gender: z.enum(["male", "female", "other"]).nullable().optional(),
    relationshipToUser: z.string().nullable().optional()
  })).default([]),
  currentRelationships: z.array(z.object({
    id: z.string().optional(),
    personA: z.string(),
    personB: z.string(),
    relation: z.string(),
    evidence: z.string().optional()
  })).default([])
});

const kinshipQuerySchema = z.object({
  person1: z.string().min(1),
  person2: z.string().min(1),
  people: z.array(z.object({
    id: z.string(),
    name: z.string(),
    gender: z.enum(["male", "female", "other"]).nullable().optional(),
    relationshipToUser: z.string().nullable().optional()
  })).default([]),
  relationships: z.array(z.object({
    id: z.string().optional(),
    personA: z.string(),
    personB: z.string(),
    relation: z.string(),
    evidence: z.string().optional()
  })).default([])
});

export async function registerGraphRoutes(app: FastifyInstance) {
  app.post("/v1/graph/analyze-conversation", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      const raw = await extractFamilyGraph(parsed.data.source);
      const validated = familyGraphExtractionSchema.safeParse(raw);
      if (!validated.success) return reply.code(502).send({ error: "INVALID_MODEL_OUTPUT", details: validated.error.flatten() });
      const grounded = keepEvidenceGrounded(validated.data, parsed.data.source);
      const resolutions = resolvePersonMentions(grounded.people, parsed.data.existingPeople as ExistingPerson[]);
      const issues = validateProposedRelationships({
        people: grounded.people,
        relationships: grounded.relationships,
        existingPeople: parsed.data.existingPeople as ExistingPerson[],
        resolutions,
        existingRelationships: parsed.data.existingRelationships as ExistingRelationship[]
      });
      return {
        extraction: grounded,
        resolutions,
        validationIssues: issues,
        persistence: "not_persisted",
        reviewRequired: true
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "FAMILY_GRAPH_ANALYSIS_FAILED", message: error instanceof Error ? error.message : "Provider error" });
    }
  });

  app.post("/v1/graph/interview", async (request, reply) => {
    const parsed = interviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      const response = await interactWithTreeAgent(parsed.data);
      return response;
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "TREE_INTERVIEW_FAILED", message: error instanceof Error ? error.message : "Agent error" });
    }
  });

  app.post("/v1/graph/query-kinship", async (request, reply) => {
    const parsed = kinshipQuerySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      return resolveKinship(parsed.data.person1, parsed.data.person2, parsed.data.people, parsed.data.relationships);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "KINSHIP_QUERY_FAILED", message: error instanceof Error ? error.message : "Query error" });
    }
  });

  // People in Family
  app.get("/v1/graph/people", async (request, reply) => {
    const { familyId } = request.query as { familyId?: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    return { success: true, people: listFamilyPeople(familyId) };
  });

  app.post("/v1/graph/people", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      displayName: z.string().min(1).max(120),
      aliases: z.array(z.string()).default([]),
      gender: z.enum(["male", "female", "other"]).nullable().optional(),
      birthDate: z.string().nullable().optional(),
      birthYear: z.number().nullable().optional(),
      birthPlace: z.string().nullable().optional(),
      deathDate: z.string().nullable().optional(),
      bio: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
      reviewStatus: z.enum(["suggested", "confirmed", "disputed"]).default("confirmed"),
      createdBy: z.string().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const person = createPerson(parsed.data);
    return { success: true, person };
  });

  app.patch("/v1/graph/people/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      familyId: z.string().min(1),
      displayName: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      gender: z.enum(["male", "female", "other"]).nullable().optional(),
      birthDate: z.string().nullable().optional(),
      birthYear: z.number().nullable().optional(),
      birthPlace: z.string().nullable().optional(),
      deathDate: z.string().nullable().optional(),
      bio: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
      reviewStatus: z.enum(["suggested", "confirmed", "disputed"]).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const updated = updatePerson(id, parsed.data.familyId, parsed.data as any);
    if (!updated) return reply.code(404).send({ error: "PERSON_NOT_FOUND" });
    return { success: true, person: updated };
  });

  // Relationships in Family
  app.get("/v1/graph/relationships", async (request, reply) => {
    const { familyId } = request.query as { familyId?: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    return { success: true, relationships: listFamilyRelationships(familyId) };
  });

  app.post("/v1/graph/relationships", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      fromPersonId: z.string().min(1),
      toPersonId: z.string().min(1),
      type: z.enum([
        "parent",
        "child",
        "spouse",
        "partner",
        "sibling",
        "half_sibling",
        "adoptive_parent",
        "adopted_child",
        "step_parent",
        "step_child",
        "guardian",
        "grandparent",
        "grandchild",
        "uncle",
        "aunt",
        "cousin",
        "other"
      ]),
      status: z.enum(["suggested", "confirmed", "disputed"]).default("confirmed"),
      confidence: z.number().optional(),
      evidenceText: z.string().nullable().optional(),
      sourceMemoryId: z.string().nullable().optional(),
      reviewedBy: z.string().nullable().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const relationship = createRelationship(parsed.data);
    return { success: true, relationship };
  });

  // Fact Suggestions & Review
  app.get("/v1/graph/suggestions", async (request, reply) => {
    const { familyId, status } = request.query as { familyId?: string; status?: FactSuggestion["status"] };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    return { success: true, suggestions: listFactSuggestions(familyId, status) };
  });

  app.post("/v1/graph/suggestions", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      factType: z.enum(["person_identity", "relationship", "date", "place", "event", "alias", "bio", "recipe", "tradition", "other"]),
      subjectPersonId: z.string().nullable().optional(),
      objectPersonId: z.string().nullable().optional(),
      proposedValue: z.record(z.unknown()),
      confidence: z.number().min(0).max(1),
      extractionModel: z.string().default("sarvam-105b"),
      createdBy: z.string().nullable().optional(),
      evidence: z.array(z.object({
        memoryId: z.string().nullable().optional(),
        conversationId: z.string().nullable().optional(),
        excerpt: z.string().min(1),
        startMs: z.number().nullable().optional(),
        endMs: z.number().nullable().optional(),
        contributorId: z.string().nullable().optional()
      })).default([])
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const suggestion = createFactSuggestion(parsed.data);
    return { success: true, suggestion };
  });

  app.post("/v1/graph/suggestions/:id/review", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      familyId: z.string().min(1),
      status: z.enum(["confirmed", "rejected", "disputed"]),
      reviewedBy: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      const result = reviewFactSuggestion(id, parsed.data.familyId, {
        status: parsed.data.status,
        reviewedBy: parsed.data.reviewedBy
      });
      return result;
    } catch (err) {
      return reply.code(400).send({ error: "REVIEW_FAILED", message: err instanceof Error ? err.message : "Review error" });
    }
  });

  // Person Merge Candidates
  app.get("/v1/graph/merge-candidates", async (request, reply) => {
    const { familyId } = request.query as { familyId?: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    return { success: true, candidates: listMergeCandidates(familyId) };
  });

  app.post("/v1/graph/merge-candidates", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      personAId: z.string().min(1),
      personBId: z.string().min(1),
      reason: z.string().min(1),
      confidence: z.number().min(0).max(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const candidate = createMergeCandidate(parsed.data);
    return { success: true, candidate };
  });

  app.post("/v1/graph/merge-candidates/:id/review", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      familyId: z.string().min(1),
      status: z.enum(["accepted", "rejected"]),
      reviewedBy: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      const result = reviewMergeCandidate(id, parsed.data.familyId, {
        status: parsed.data.status,
        reviewedBy: parsed.data.reviewedBy
      });
      return result;
    } catch (err) {
      return reply.code(400).send({ error: "MERGE_REVIEW_FAILED", message: err instanceof Error ? err.message : "Merge error" });
    }
  });

  // Person Timeline and Evidence (Supports both /person/:id and /people/:id)
  const handleTimeline = async (id: string, familyId?: string) => {
    const fId = familyId || getPerson(id)?.familyId || "default-family";
    return { success: true, timeline: getPersonTimeline(id, fId) };
  };

  const handleEvidence = async (id: string, familyId?: string) => {
    const fId = familyId || getPerson(id)?.familyId || "default-family";
    return { success: true, evidence: getPersonEvidence(id, fId) };
  };

  app.get("/v1/graph/person/:id/timeline", async (request) => {
    const { id } = request.params as { id: string };
    const { familyId } = request.query as { familyId?: string };
    return handleTimeline(id, familyId);
  });

  app.get("/v1/graph/person/:id/evidence", async (request) => {
    const { id } = request.params as { id: string };
    const { familyId } = request.query as { familyId?: string };
    return handleEvidence(id, familyId);
  });

  app.get("/v1/graph/people/:id/timeline", async (request) => {
    const { id } = request.params as { id: string };
    const { familyId } = request.query as { familyId?: string };
    return handleTimeline(id, familyId);
  });

  app.get("/v1/graph/people/:id/evidence", async (request) => {
    const { id } = request.params as { id: string };
    const { familyId } = request.query as { familyId?: string };
    return handleEvidence(id, familyId);
  });
}
