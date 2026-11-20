import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const REVISIONS_FILE = path.join(DATA_DIR, "revisions.json");

export interface EntityRevision {
  id: string;
  familyId: string;
  actorId: string;
  actorType: "user" | "agent";
  timestamp: string;
  targetEntity: "person" | "relationship" | "memory" | "life_event" | "preference";
  entityId: string;
  operation: "create" | "update" | "link" | "unlink";
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
  userInstruction?: string | undefined;
  toolExecutionId?: string | undefined;
  idempotencyKey?: string | undefined;
  status: "applied" | "reverted" | "pending_approval";
}

export interface ActionApproval {
  id: string;
  familyId: string;
  userId: string;
  toolName: string;
  summary: string;
  proposedChanges: Record<string, unknown>;
  riskLevel: "moderate" | "high";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  expiresAt: string;
}

interface RevisionsData {
  revisions: Record<string, EntityRevision>;
  approvals: Record<string, ActionApproval>;
  idempotency: Record<string, { result: unknown; timestamp: string }>;
}

function loadRevisions(): RevisionsData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(REVISIONS_FILE)) {
      const raw = fs.readFileSync(REVISIONS_FILE, "utf-8");
      return JSON.parse(raw) as RevisionsData;
    }
  } catch (err) {
    console.error("Error loading revisions:", err);
  }
  return { revisions: {}, approvals: {}, idempotency: {} };
}

function saveRevisions(data: RevisionsData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REVISIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving revisions:", err);
  }
}

export function recordRevision(input: {
  familyId: string;
  actorId: string;
  actorType: "user" | "agent";
  targetEntity: "person" | "relationship" | "memory" | "life_event" | "preference";
  entityId: string;
  operation: "create" | "update" | "link" | "unlink";
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
  userInstruction?: string | undefined;
  toolExecutionId?: string | undefined;
  idempotencyKey?: string | undefined;
}): EntityRevision {
  const data = loadRevisions();
  const id = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const revision: EntityRevision = {
    id,
    familyId: input.familyId,
    actorId: input.actorId,
    actorType: input.actorType,
    timestamp: new Date().toISOString(),
    targetEntity: input.targetEntity,
    entityId: input.entityId,
    operation: input.operation,
    previousValue: input.previousValue,
    newValue: input.newValue,
    userInstruction: input.userInstruction,
    toolExecutionId: input.toolExecutionId,
    idempotencyKey: input.idempotencyKey,
    status: "applied"
  };

  data.revisions[id] = revision;
  saveRevisions(data);
  return revision;
}

export function listRevisions(familyId: string, limit = 50): EntityRevision[] {
  const data = loadRevisions();
  return Object.values(data.revisions)
    .filter((r) => r.familyId === familyId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function getRevision(revisionId: string): EntityRevision | null {
  const data = loadRevisions();
  return data.revisions[revisionId] || null;
}

export function updateRevisionStatus(revisionId: string, status: EntityRevision["status"]): void {
  const data = loadRevisions();
  if (data.revisions[revisionId]) {
    data.revisions[revisionId].status = status;
    saveRevisions(data);
  }
}

export function createActionApproval(input: {
  familyId: string;
  userId: string;
  toolName: string;
  summary: string;
  proposedChanges: Record<string, unknown>;
  riskLevel: "moderate" | "high";
}): ActionApproval {
  const data = loadRevisions();
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const approval: ActionApproval = {
    id,
    familyId: input.familyId,
    userId: input.userId,
    toolName: input.toolName,
    summary: input.summary,
    proposedChanges: input.proposedChanges,
    riskLevel: input.riskLevel,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
  };

  data.approvals[id] = approval;
  saveRevisions(data);
  return approval;
}

export function getApproval(approvalId: string): ActionApproval | null {
  const data = loadRevisions();
  return data.approvals[approvalId] || null;
}

export function updateApprovalStatus(approvalId: string, status: "approved" | "rejected"): ActionApproval | null {
  const data = loadRevisions();
  const item = data.approvals[approvalId];
  if (!item) return null;
  item.status = status;
  saveRevisions(data);
  return item;
}

export function checkIdempotency(key: string): { exists: boolean; result?: unknown } {
  const data = loadRevisions();
  const entry = data.idempotency[key];
  if (entry) {
    return { exists: true, result: entry.result };
  }
  return { exists: false };
}

export function recordIdempotency(key: string, result: unknown): void {
  const data = loadRevisions();
  data.idempotency[key] = {
    result,
    timestamp: new Date().toISOString()
  };
  saveRevisions(data);
}
