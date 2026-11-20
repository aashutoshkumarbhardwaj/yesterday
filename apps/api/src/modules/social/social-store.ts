import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SOCIAL_FILE = path.join(DATA_DIR, "social.json");

export type ReactionType = "heart" | "like" | "remember" | "meaningful" | "thank_you";
export type SocialEntityType = "story" | "person" | "photo" | "event";

export interface MemoryComment {
  id: string;
  familyId: string;
  entityType: SocialEntityType;
  entityId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryReaction {
  id: string;
  familyId: string;
  entityType: SocialEntityType;
  entityId: string;
  userId: string;
  userName: string;
  reactionType: ReactionType;
  createdAt: string;
}

export interface MemoryContribution {
  id: string;
  familyId: string;
  storyId: string;
  contributorId: string;
  contributorName: string;
  perspectiveText: string;
  photoUris?: string[];
  dateCorrection?: string | null;
  status: "approved" | "pending";
  createdAt: string;
}

interface SocialStoreData {
  comments: Record<string, MemoryComment[]>; // keyed by `${entityType}_${entityId}`
  reactions: Record<string, MemoryReaction[]>; // keyed by `${entityType}_${entityId}`
  contributions: Record<string, MemoryContribution[]>; // keyed by `storyId`
}

function loadData(): SocialStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SOCIAL_FILE)) {
      const content = fs.readFileSync(SOCIAL_FILE, "utf-8");
      return JSON.parse(content) as SocialStoreData;
    }
  } catch (err) {
    console.error("Error reading social store:", err);
  }
  return { comments: {}, reactions: {}, contributions: {} };
}

function saveData(data: SocialStoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SOCIAL_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving social store:", err);
  }
}

// ---------------------------------------------------------------------------
// COMMENTS
// ---------------------------------------------------------------------------
export function addComment(input: {
  familyId: string;
  entityType: SocialEntityType;
  entityId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId?: string | null | undefined;
}): MemoryComment {
  const data = loadData();
  const key = `${input.entityType}_${input.entityId}`;
  const list = data.comments[key] || [];

  const now = new Date().toISOString();
  const comment: MemoryComment = {
    id: `com_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    familyId: input.familyId,
    entityType: input.entityType,
    entityId: input.entityId,
    authorId: input.authorId,
    authorName: input.authorName.trim(),
    content: input.content.trim(),
    parentId: input.parentId || null,
    createdAt: now,
    updatedAt: now
  };

  list.push(comment);
  data.comments[key] = list;
  saveData(data);
  return comment;
}

export function listComments(entityType: SocialEntityType, entityId: string): MemoryComment[] {
  const data = loadData();
  const key = `${entityType}_${entityId}`;
  return data.comments[key] || [];
}

export function deleteComment(input: {
  commentId: string;
  userId: string;
  userRole?: string | undefined;
}): { success: boolean; error?: string } {
  const data = loadData();
  for (const [key, comments] of Object.entries(data.comments)) {
    const idx = comments.findIndex((c) => c.id === input.commentId);
    if (idx >= 0) {
      const comment = comments[idx]!;
      // Author or admin/owner can delete
      if (comment.authorId !== input.userId && input.userRole !== "owner" && input.userRole !== "admin") {
        return { success: false, error: "You can only delete your own comments." };
      }
      comments.splice(idx, 1);
      data.comments[key] = comments;
      saveData(data);
      return { success: true };
    }
  }
  return { success: false, error: "Comment not found." };
}

// ---------------------------------------------------------------------------
// REACTIONS
// ---------------------------------------------------------------------------
export function toggleReaction(input: {
  familyId: string;
  entityType: SocialEntityType;
  entityId: string;
  userId: string;
  userName: string;
  reactionType: ReactionType;
}): { reactions: MemoryReaction[]; userReacted: boolean } {
  const data = loadData();
  const key = `${input.entityType}_${input.entityId}`;
  const list = data.reactions[key] || [];

  const existingIdx = list.findIndex(
    (r) => r.userId === input.userId && r.reactionType === input.reactionType
  );

  let userReacted = false;
  if (existingIdx >= 0) {
    // Untoggle
    list.splice(existingIdx, 1);
    userReacted = false;
  } else {
    // Add reaction
    list.push({
      id: `rxn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      familyId: input.familyId,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      userName: input.userName.trim(),
      reactionType: input.reactionType,
      createdAt: new Date().toISOString()
    });
    userReacted = true;
  }

  data.reactions[key] = list;
  saveData(data);
  return { reactions: list, userReacted };
}

export function listReactions(entityType: SocialEntityType, entityId: string): {
  reactions: MemoryReaction[];
  counts: Record<ReactionType, number>;
} {
  const data = loadData();
  const key = `${entityType}_${entityId}`;
  const list = data.reactions[key] || [];

  const counts: Record<ReactionType, number> = {
    heart: 0,
    like: 0,
    remember: 0,
    meaningful: 0,
    thank_you: 0
  };

  for (const r of list) {
    if (counts[r.reactionType] !== undefined) {
      counts[r.reactionType] += 1;
    }
  }

  return { reactions: list, counts };
}

// ---------------------------------------------------------------------------
// COLLABORATIVE MEMORY CONTRIBUTIONS
// ---------------------------------------------------------------------------
export function addStoryContribution(input: {
  familyId: string;
  storyId: string;
  contributorId: string;
  contributorName: string;
  perspectiveText: string;
  photoUris?: string[] | undefined;
  dateCorrection?: string | null | undefined;
}): MemoryContribution {
  const data = loadData();
  const list = data.contributions[input.storyId] || [];

  const contribution: MemoryContribution = {
    id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    familyId: input.familyId,
    storyId: input.storyId,
    contributorId: input.contributorId,
    contributorName: input.contributorName.trim(),
    perspectiveText: input.perspectiveText.trim(),
    photoUris: input.photoUris || [],
    dateCorrection: input.dateCorrection || null,
    status: "approved",
    createdAt: new Date().toISOString()
  };

  list.push(contribution);
  data.contributions[input.storyId] = list;
  saveData(data);
  return contribution;
}

export function listStoryContributions(storyId: string): MemoryContribution[] {
  const data = loadData();
  return data.contributions[storyId] || [];
}
