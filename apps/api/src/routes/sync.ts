import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptInvitation,
  createFamily,
  createInvitation,
  getFamily,
  getInvitationByToken,
  joinFamily,
  listInvitations,
  listUserFamilies,
  removeFamilyMember,
  resendInvitation,
  revokeInvitation,
  syncFamilyTree,
  updateFamilySettings,
  updateMemberStatus,
  FamilyRole
} from "../modules/sync/family-store.js";
import { listFamilyActivity, logActivity } from "../modules/activity/activity-store.js";
import { createNotification } from "../modules/notifications/notification-store.js";

const createFamilySchema = z.object({
  familyName: z.string().min(1).max(100),
  creatorId: z.string().min(1),
  creatorName: z.string().min(1),
  description: z.string().max(500).optional(),
  ancestralLocation: z.string().max(200).optional(),
  privacy: z.enum(["private", "family_only", "unlisted"]).optional(),
  coverPhotoUrl: z.string().optional(),
  initialPeople: z.array(z.any()).optional(),
  initialRelationships: z.array(z.any()).optional()
});

const updateSettingsSchema = z.object({
  familyId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  ancestralLocation: z.string().nullable().optional(),
  privacy: z.enum(["private", "family_only", "unlisted"]).optional(),
  coverPhotoUrl: z.string().nullable().optional()
});

const joinFamilySchema = z.object({
  inviteCode: z.string().min(1).max(50),
  userId: z.string().min(1),
  userName: z.string().min(1)
});

const syncSchema = z.object({
  familyId: z.string().min(1),
  userId: z.string().min(1),
  newPeople: z.array(z.any()).optional(),
  newRelationships: z.array(z.any()).optional(),
  newStories: z.array(z.any()).optional()
});

const memberActionSchema = z.object({
  familyId: z.string().min(1),
  adminUserId: z.string().min(1),
  targetUserId: z.string().min(1),
  status: z.enum(["active", "pending"]).optional(),
  role: z.enum(["owner", "admin", "contributor", "reviewer", "viewer"]).optional()
});

const createInviteSchema = z.object({
  familyId: z.string().min(1),
  inviterId: z.string().min(1),
  recipientEmail: z.string().email().optional().or(z.literal("")),
  role: z.enum(["owner", "admin", "contributor", "reviewer", "viewer"]).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional()
});

export async function registerSyncRoutes(app: FastifyInstance) {
  // Create a new family tree
  app.post("/v1/family/create", async (request, reply) => {
    const parsed = createFamilySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    try {
      const family = createFamily(parsed.data);
      logActivity({
        familyId: family.id,
        actorId: parsed.data.creatorId,
        actorName: parsed.data.creatorName,
        actionType: "member_joined",
        entityTitle: `Created family archive: ${family.name}`
      });
      return { success: true, family };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "FAMILY_CREATION_FAILED", message: err instanceof Error ? err.message : "Error" });
    }
  });

  // Update family settings
  app.post("/v1/family/settings", async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = updateFamilySettings(parsed.data);
    if (!result.success) {
      return reply.code(403).send({ error: "UPDATE_FAILED", message: result.error });
    }
    return result;
  });

  // List all families a user is a member of
  app.get("/v1/family/user-families", async (request, reply) => {
    const { userId } = request.query as { userId: string };
    if (!userId) return reply.code(400).send({ error: "USER_ID_REQUIRED" });
    const families = listUserFamilies(userId);
    return { success: true, families };
  });

  // Join existing family tree via 4-letter invite code
  app.post("/v1/family/join", async (request, reply) => {
    const parsed = joinFamilySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = joinFamily(parsed.data);
    if (result.error) {
      return reply.code(404).send({ error: "JOIN_FAILED", message: result.error });
    }

    if (result.family) {
      logActivity({
        familyId: result.family.id,
        actorId: parsed.data.userId,
        actorName: parsed.data.userName,
        actionType: "member_joined",
        entityTitle: `${parsed.data.userName} requested to join the family tree`
      });

      // Notify family owner
      const owner = result.family.members.find((m) => m.role === "owner");
      if (owner) {
        createNotification({
          userId: owner.id,
          familyId: result.family.id,
          type: "member_joined",
          title: "New Member Join Request",
          body: `${parsed.data.userName} requested to join your family archive.`,
          linkUrl: "/family-share"
        });
      }
    }

    return { success: true, family: result.family, membershipStatus: result.membershipStatus };
  });

  // Get family tree state
  app.get("/v1/family/:familyId", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const family = getFamily(familyId);
    if (!family) return reply.code(404).send({ error: "FAMILY_NOT_FOUND" });
    return { success: true, family };
  });

  // Get family activity feed
  app.get("/v1/family/:familyId/activity", async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const { limit, since } = request.query as { limit?: string; since?: string };
    const activities = listFamilyActivity(familyId, limit ? parseInt(limit, 10) : 40, since);
    return { success: true, activities };
  });

  // Real-time synchronization of people, relationships, and stories
  app.post("/v1/family/sync", async (request, reply) => {
    const parsed = syncSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = syncFamilyTree(parsed.data);
    if (result.error) {
      return reply.code(403).send({ error: "SYNC_FAILED", message: result.error });
    }

    // Auto-log activity
    if (parsed.data.newPeople?.length) {
      const p = parsed.data.newPeople[0];
      logActivity({
        familyId: parsed.data.familyId,
        actorId: parsed.data.userId,
        actorName: "Family Contributor",
        actionType: "person_added",
        entityTitle: `Added ${p.name} to family tree`
      });
    }
    if (parsed.data.newStories?.length) {
      const s = parsed.data.newStories[0];
      logActivity({
        familyId: parsed.data.familyId,
        actorId: parsed.data.userId,
        actorName: "Family Contributor",
        actionType: "story_added",
        entityTitle: `Preserved new memory: "${s.title}"`
      });
    }

    return { success: true, family: result.family };
  });

  // Approve or update member status/role
  app.post("/v1/family/members/approve", async (request, reply) => {
    const parsed = memberActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = updateMemberStatus({
      familyId: parsed.data.familyId,
      adminUserId: parsed.data.adminUserId,
      targetUserId: parsed.data.targetUserId,
      status: parsed.data.status ?? "active",
      role: (parsed.data.role as FamilyRole) ?? "contributor"
    });
    if (!result.success) {
      return reply.code(403).send({ error: "APPROVAL_FAILED", message: result.error });
    }

    // Notify target user
    createNotification({
      userId: parsed.data.targetUserId,
      familyId: parsed.data.familyId,
      type: "member_joined",
      title: "Membership Approved!",
      body: `You are now an active ${parsed.data.role || "contributor"} of this family archive.`,
      linkUrl: "/family-share"
    });

    const updatedFamily = getFamily(parsed.data.familyId);
    return { success: true, family: updatedFamily };
  });

  // Remove a member from the family tree
  app.post("/v1/family/members/remove", async (request, reply) => {
    const parsed = memberActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = removeFamilyMember({
      familyId: parsed.data.familyId,
      adminUserId: parsed.data.adminUserId,
      targetUserId: parsed.data.targetUserId
    });
    if (!result.success) {
      return reply.code(403).send({ error: "REMOVAL_FAILED", message: result.error });
    }
    const updatedFamily = getFamily(parsed.data.familyId);
    return { success: true, family: updatedFamily };
  });

  // ---------------------------------------------------------------------------
  // INVITATIONS
  // ---------------------------------------------------------------------------
  app.post("/v1/family/invitations/create", async (request, reply) => {
    const parsed = createInviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    const result = createInvitation({
      familyId: parsed.data.familyId,
      inviterId: parsed.data.inviterId,
      recipientEmail: parsed.data.recipientEmail || null,
      role: parsed.data.role,
      expiresInDays: parsed.data.expiresInDays
    });
    if (result.error) return reply.code(403).send({ error: "INVITATION_FAILED", message: result.error });
    return { success: true, invitation: result.invitation };
  });

  app.get("/v1/family/invitations/list", async (request, reply) => {
    const { familyId, userId } = request.query as { familyId: string; userId: string };
    if (!familyId || !userId) return reply.code(400).send({ error: "PARAMS_REQUIRED" });
    const result = listInvitations(familyId, userId);
    if (result.error) return reply.code(403).send({ error: "LIST_FAILED", message: result.error });
    return { success: true, invitations: result.invitations };
  });

  app.get("/v1/family/invitations/token/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = getInvitationByToken(token);
    if (result.error) return reply.code(404).send({ error: "NOT_FOUND", message: result.error });
    return { success: true, invitation: result.invitation, familyPreview: result.familyPreview };
  });

  app.post("/v1/family/invitations/accept", async (request, reply) => {
    const schema = z.object({
      token: z.string().min(1),
      userId: z.string().min(1),
      userName: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = acceptInvitation(parsed.data);
    if (!result.success) return reply.code(400).send({ error: "ACCEPT_FAILED", message: result.error });

    if (result.family) {
      logActivity({
        familyId: result.family.id,
        actorId: parsed.data.userId,
        actorName: parsed.data.userName,
        actionType: "member_joined",
        entityTitle: `${parsed.data.userName} joined the family via invitation link`
      });
    }

    return result;
  });

  app.post("/v1/family/invitations/revoke", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      adminUserId: z.string().min(1),
      invitationId: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = revokeInvitation(parsed.data);
    if (!result.success) return reply.code(403).send({ error: "REVOKE_FAILED", message: result.error });
    return result;
  });

  app.post("/v1/family/invitations/resend", async (request, reply) => {
    const schema = z.object({
      familyId: z.string().min(1),
      adminUserId: z.string().min(1),
      invitationId: z.string().min(1),
      expiresInDays: z.number().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const result = resendInvitation(parsed.data);
    if (!result.success) return reply.code(403).send({ error: "RESEND_FAILED", message: result.error });
    return result;
  });
}
