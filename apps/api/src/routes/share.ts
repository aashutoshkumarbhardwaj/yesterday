import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createShareToken,
  generatePrintableTreeHtml,
  getSharePayload,
  listFamilyShares,
  revokeShareToken,
  ShareEntityType
} from "../modules/share/share-store.js";

const createShareSchema = z.object({
  familyId: z.string().min(1),
  createdById: z.string().min(1),
  createdByName: z.string().min(1),
  entityType: z.enum(["story", "person", "tree", "timeline", "recipe"]),
  entityId: z.string().optional(),
  title: z.string().min(1).max(200),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  requireAuth: z.boolean().optional(),
  allowDownload: z.boolean().optional()
});

export async function registerShareRoutes(app: FastifyInstance) {
  // Create an external share link
  app.post("/v1/share/create", async (request, reply) => {
    const parsed = createShareSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const share = createShareToken(parsed.data);
    return { success: true, share };
  });

  // Access shared content via secure token
  app.get("/v1/share/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = getSharePayload(token);
    if (result.error) return reply.code(404).send({ error: "SHARE_NOT_FOUND", message: result.error });
    return { success: true, share: result.share, data: result.data };
  });

  // Revoke share token
  app.post("/v1/share/:token/revoke", async (request, reply) => {
    const { token } = request.params as { token: string };
    const { userId } = (request.body as { userId?: string }) || {};
    const success = revokeShareToken(token, userId || "system");
    return { success };
  });

  // List active shares for family
  app.get("/v1/share/list", async (request, reply) => {
    const { familyId } = request.query as { familyId: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    const shares = listFamilyShares(familyId);
    return { success: true, shares };
  });

  // Export printable standalone HTML family tree
  app.get("/v1/genealogy/tree/printable-html", async (request, reply) => {
    const { familyId } = request.query as { familyId: string };
    if (!familyId) return reply.code(400).send({ error: "FAMILY_ID_REQUIRED" });
    const html = generatePrintableTreeHtml(familyId);
    reply.type("text/html").send(html);
  });
}

