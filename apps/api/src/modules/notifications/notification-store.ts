import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const NOTIFICATION_FILE = path.join(DATA_DIR, "notifications.json");

export type NotificationType =
  | "invite_received"
  | "invite_accepted"
  | "member_joined"
  | "story_added"
  | "comment_added"
  | "reaction_added"
  | "suggestion_pending"
  | "suggestion_approved"
  | "agent_action";

export interface AppNotification {
  id: string;
  userId: string;
  familyId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationStoreData {
  notifications: Record<string, AppNotification[]>; // keyed by userId
}

function loadData(): NotificationStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(NOTIFICATION_FILE)) {
      const content = fs.readFileSync(NOTIFICATION_FILE, "utf-8");
      return JSON.parse(content) as NotificationStoreData;
    }
  } catch (err) {
    console.error("Error loading notification store:", err);
  }
  return { notifications: {} };
}

function saveData(data: NotificationStoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving notification store:", err);
  }
}

export function createNotification(input: {
  userId: string;
  familyId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string | null;
}): AppNotification {
  const data = loadData();
  const list = data.notifications[input.userId] || [];

  const item: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: input.userId,
    familyId: input.familyId,
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    linkUrl: input.linkUrl || null,
    read: false,
    createdAt: new Date().toISOString()
  };

  list.unshift(item);
  // Cap at 100 notifications per user
  if (list.length > 100) list.length = 100;

  data.notifications[input.userId] = list;
  saveData(data);
  return item;
}

export function listNotifications(userId: string): {
  notifications: AppNotification[];
  unreadCount: number;
} {
  const data = loadData();
  const list = data.notifications[userId] || [];
  const unreadCount = list.filter((n) => !n.read).length;
  return { notifications: list, unreadCount };
}

export function markAsRead(userId: string, notificationId: string): boolean {
  const data = loadData();
  const list = data.notifications[userId] || [];
  const target = list.find((n) => n.id === notificationId);
  if (target) {
    target.read = true;
    saveData(data);
    return true;
  }
  return false;
}

export function markAllAsRead(userId: string): number {
  const data = loadData();
  const list = data.notifications[userId] || [];
  let updated = 0;
  for (const n of list) {
    if (!n.read) {
      n.read = true;
      updated++;
    }
  }
  if (updated > 0) saveData(data);
  return updated;
}

