import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { processFamilyAgentChat } from "../modules/agent/family-agent.js";
import { listRevisions, getRevision } from "../modules/audit/revision-store.js";
import { undoRevision } from "../modules/audit/undo-service.js";
import { calculateKinship } from "../modules/genealogy/kinship-engine.js";
import { getGraph, GraphPerson } from "../modules/graph/graph-store.js";

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string()
      })
    )
    .optional(),
  focusPersonId: z.string().optional(),
  currentOrientation: z.enum(["top_to_bottom", "bottom_to_top", "left_to_right", "right_to_left"]).optional(),
  familyId: z.string().default("default-family")
});

const undoSchema = z.object({
  revisionId: z.string(),
  familyId: z.string().default("default-family")
});

export async function registerAgentRoutes(app: FastifyInstance) {
  // 1. Agent Conversational Loop
  app.post("/v1/agent/chat", async (request, reply) => {
    const parse = chatSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: parse.error.flatten() });
    }

    const { message, conversationId, history, focusPersonId, currentOrientation, familyId } = parse.data;

    // In a production setup, user is resolved from JWT auth header
    const userId = (request.headers["x-user-id"] as string) || "user_default";

    try {
      const response = await processFamilyAgentChat({
        message,
        conversationId,
        ...(history ? { history } : {}),
        context: {
          familyId,
          userId,
          userRole: "admin", // default authorized user
          conversationId,
          ...(focusPersonId ? { focusPersonId } : {}),
          ...(currentOrientation ? { currentOrientation } : {})
        }
      });

      return reply.send(response);
    } catch (err: any) {
      request.log.error(err);
      return reply.code(500).send({ error: "AGENT_EXECUTION_ERROR", message: err.message });
    }
  });

  // 2. Activity & Revision History
  app.get("/v1/agent/revisions", async (request, reply) => {
    const query = request.query as { familyId?: string; limit?: string };
    const familyId = query.familyId || "default-family";
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    const revisions = listRevisions(familyId, limit);
    return reply.send({ revisions });
  });

  // 3. Safe Undo
  app.post("/v1/agent/undo", async (request, reply) => {
    const parse = undoSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }

    const userId = (request.headers["x-user-id"] as string) || "user_default";
    const result = undoRevision(parse.data.revisionId, parse.data.familyId, userId);
    if (!result.success) {
      return reply.code(400).send(result);
    }
    return reply.send(result);
  });

  // 4. Kinship Calculation Relative to Logged-in User
  app.get("/v1/genealogy/kinship", async (request, reply) => {
    const query = request.query as {
      targetPersonId?: string;
      referencePersonId?: string;
      familyId?: string;
    };

    if (!query.targetPersonId) {
      return reply.code(400).send({ error: "targetPersonId is required." });
    }

    const familyId = query.familyId || "default-family";
    const refId = query.referencePersonId || "user_default";
    const graph = getGraph(familyId);

    const kinship = calculateKinship(refId, query.targetPersonId, graph.people, graph.relationships);
    return reply.send(kinship);
  });

  // 5. Tree Structure with Kinship Labels & Generation Calculation
  app.get("/v1/genealogy/tree", async (request, reply) => {
    const query = request.query as {
      familyId?: string;
      referencePersonId?: string;
      orientation?: string;
    };

    const familyId = query.familyId || "default-family";
    const refId = query.referencePersonId || "user_default";
    const orientation = query.orientation || "top_to_bottom";
    const graph = getGraph(familyId);

    // Compute kinship for every person relative to refId
    const peopleList = Object.values(graph.people) as GraphPerson[];
    const peopleWithKinship = peopleList.map((p) => {
      const kinship = calculateKinship(refId, p.id, graph.people, graph.relationships);
      return {
        ...p,
        kinshipLabel: kinship.englishLabel,
        kinshipHindi: kinship.hindiLabel,
        generationOffset: kinship.generationOffset,
        lineage: kinship.lineage
      };
    });

    return reply.send({
      familyId,
      orientation,
      people: peopleWithKinship,
      relationships: Object.values(graph.relationships)
    });
  });
}
