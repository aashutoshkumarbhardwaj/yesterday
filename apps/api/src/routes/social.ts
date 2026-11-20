import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addComment,
  addStoryContribution,
  deleteComment,
  listComments,
  listReactions,
  listStoryContributions,
  toggleReaction,
  ReactionType,
  SocialEntityType
} from "../modules/social/social-store.js";
import { logActivity } from "../modules/activity/activity-store.js";
import { createNotification } from "../modules/notifications/notification-store.js";

const addCommentSchema = z.object({
  familyId: z.string().min(1),
  entityType: z.enum(["story", "person", "photo", "event"]),
  entityId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  content: z.string().min(1).max(2000),
  parentId: z.string().optional()
});

const toggleReactionSchema = z.object({
  familyId: z.string().min(1),
  entityType: z.enum(["story", "person", "photo", "event"]),
  entityId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  reactionType: z.enum(["heart", "like", "remember", "meaningful", "thank_you"])
});

const addContributionSchema = z.object({
  familyId: z.string().min(1),
  storyId: z.string().min(1),
  contributorId: z.string().min(1),
  contributorName: z.string().min(1),
  perspectiveText: z.string().min(1).max(5000),
  photoUris: z.array(z.string()).optional(),
  dateCorrection: z.string().optional()
});

export async function registerSocialRoutes(app: FastifyInstance) {
  // Add Comment
  app.post("/v1/social/comments", async (request, reply) => {
    const parsed = addCommentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });

    const comment = addComment(parsed.data);

    logActivity({
      familyId: parsed.data.familyId,
      actorId: parsed.data.authorId,
      actorName: parsed.data.authorName,
      actionType: "comment_added",
      entityTitle: `Commented: "${parsed.data.content.slice(0, 40)}..."`,
      entityId: parsed.data.entityId
    });

    return { success: true, comment };
  });

  // List Comments
  app.get("/v1/social/comments", async (request, reply) => {
    const { entityType, entityId } = request.query as { entityType: SocialEntityType; entityId: string };
    if (!entityType || !entityId) return reply.code(400).send({ error: "PARAMS_REQUIRED" });
    const comments = listComments(entityType, entityId);
    return { success: true, comments };
  });

  // Delete Comment
  app.delete("/v1/social/comments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, userRole } = request.query as { userId: string; userRole?: string };
    if (!userId) return reply.code(400).send({ error: "USER_ID_REQUIRED" });

    const result = deleteComment({ commentId: id, userId, userRole });
    if (!result.success) return reply.code(403).send({ error: "DELETE_FAILED", message: result.error });
    return result;
  });

  // Toggle Reaction
  app.post("/v1/social/reactions", async (request, reply) => {
    const parsed = toggleReactionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });

    const result = toggleReaction(parsed.data);
    const { counts } = listReactions(parsed.data.entityType, parsed.data.entityId);

    return { success: true, userReacted: result.userReacted, counts };
  });

  // List Reactions
  app.get("/v1/social/reactions", async (request, reply) => {
    const { entityType, entityId } = request.query as { entityType: SocialEntityType; entityId: string };
    if (!entityType || !entityId) return reply.code(400).send({ error: "PARAMS_REQUIRED" });

    const result = listReactions(entityType, entityId);
    return { success: true, reactions: result.reactions, counts: result.counts };
  });

  // Add Collaborative Story Contribution
  app.post("/v1/stories/:id/contributions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addContributionSchema.safeParse({ ...((request.body as any) || {}), storyId: id });
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });

    const contribution = addStoryContribution(parsed.data);

    logActivity({
      familyId: parsed.data.familyId,
      actorId: parsed.data.contributorId,
      actorName: parsed.data.contributorName,
      actionType: "story_added",
      entityTitle: `Added new perspective to story`,
      entityId: id
    });

    return { success: true, contribution };
  });

  // List Story Contributions
  app.get("/v1/stories/:id/contributions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const contributions = listStoryContributions(id);
    return { success: true, contributions };
  });
}

