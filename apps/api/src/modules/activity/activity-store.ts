import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity.json");

export type ActivityActionType =
  | "person_added"
  | "person_updated"
  | "story_added"
  | "photo_uploaded"
  | "relationship_added"
  | "suggestion_approved"
  | "member_joined"
  | "comment_added";

export interface FamilyActivityItem {
  id: string;
  familyId: string;
  actorId: string;
  actorName: string;
  actionType: ActivityActionType;
  entityTitle: string;
  entityId?: string | null;
  details?: string | null;
  timestamp: string;
}

interface ActivityStoreData {
  activities: Record<string, FamilyActivityItem[]>; // Keyed by familyId
}

function loadData(): ActivityStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(ACTIVITY_FILE)) {
      const content = fs.readFileSync(ACTIVITY_FILE, "utf-8");
      return JSON.parse(content) as ActivityStoreData;
    }
  } catch (err) {
    console.error("Error loading activity store:", err);
  }
  return { activities: {} };
}

function saveData(data: ActivityStoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving activity store:", err);
  }
}

export function logActivity(input: {
  familyId: string;
  actorId: string;
  actorName: string;
  actionType: ActivityActionType;
  entityTitle: string;
  entityId?: string | null;
  details?: string | null;
}): FamilyActivityItem {
  const data = loadData();
  const list = data.activities[input.familyId] || [];

  const item: FamilyActivityItem = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    familyId: input.familyId,
    actorId: input.actorId,
    actorName: input.actorName.trim(),
    actionType: input.actionType,
    entityTitle: input.entityTitle.trim(),
    entityId: input.entityId ?? null,
    details: input.details ?? null,
    timestamp: new Date().toISOString()
  };

  list.unshift(item); // Prepend to show latest first
  // Keep max 200 activity entries per family
  if (list.length > 200) list.length = 200;

  data.activities[input.familyId] = list;
  saveData(data);
  return item;
}

export function listFamilyActivity(
  familyId: string,
  limit = 40,
  sinceTimestamp?: string
): FamilyActivityItem[] {
  const data = loadData();
  let list = data.activities[familyId] || [];

  if (sinceTimestamp) {
    list = list.filter((a) => a.timestamp > sinceTimestamp);
  }

  return list.slice(0, limit);
}

