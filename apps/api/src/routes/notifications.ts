import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listNotifications,
  markAllAsRead,
  markAsRead
} from "../modules/notifications/notification-store.js";

export async function registerNotificationRoutes(app: FastifyInstance) {
  // List user notifications
  app.get("/v1/notifications", async (request, reply) => {
    const { userId } = request.query as { userId: string };
    if (!userId) return reply.code(400).send({ error: "USER_ID_REQUIRED" });
    const result = listNotifications(userId);
    return { success: true, ...result };
  });

  // Mark single notification as read
  app.post("/v1/notifications/mark-read", async (request, reply) => {
    const schema = z.object({
      userId: z.string().min(1),
      notificationId: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const success = markAsRead(parsed.data.userId, parsed.data.notificationId);
    return { success };
  });

  // Mark all notifications as read
  app.post("/v1/notifications/mark-all-read", async (request, reply) => {
    const schema = z.object({
      userId: z.string().min(1)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const updatedCount = markAllAsRead(parsed.data.userId);
    return { success: true, updatedCount };
  });
}

