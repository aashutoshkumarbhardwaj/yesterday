import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getGraph, GraphPerson, GraphRelationship } from "../graph/graph-store.js";
import { getFamily } from "../sync/family-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const SHARE_FILE = path.join(DATA_DIR, "shares.json");

export type ShareEntityType = "story" | "person" | "tree" | "timeline" | "recipe";

export interface ExternalShare {
  id: string;
  token: string;
  familyId: string;
  familyName: string;
  entityType: ShareEntityType;
  entityId?: string | null;
  title: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  expiresAt?: string | null;
  requireAuth: boolean;
  allowDownload: boolean;
  status: "active" | "revoked" | "expired";
  accessCount: number;
}

interface ShareStoreData {
  shares: Record<string, ExternalShare>; // Keyed by token
}

function loadData(): ShareStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SHARE_FILE)) {
      const content = fs.readFileSync(SHARE_FILE, "utf-8");
      return JSON.parse(content) as ShareStoreData;
    }
  } catch (err) {
    console.error("Error reading share store:", err);
  }
  return { shares: {} };
}

function saveData(data: ShareStoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SHARE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving share store:", err);
  }
}

export function createShareToken(input: {
  familyId: string;
  createdById: string;
  createdByName: string;
  entityType: ShareEntityType;
  entityId?: string | null | undefined;
  title: string;
  expiresInDays?: number | undefined;
  requireAuth?: boolean | undefined;
  allowDownload?: boolean | undefined;
}): ExternalShare {
  const data = loadData();
  const family = getFamily(input.familyId);
  const token = crypto.randomBytes(18).toString("base64url");
  const now = new Date();

  let expiresAt: string | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    expiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const share: ExternalShare = {
    id: `shr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    token,
    familyId: input.familyId,
    familyName: family?.name || "Family Archive",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    title: input.title.trim(),
    createdById: input.createdById,
    createdByName: input.createdByName.trim(),
    createdAt: now.toISOString(),
    expiresAt,
    requireAuth: Boolean(input.requireAuth),
    allowDownload: input.allowDownload !== false,
    status: "active",
    accessCount: 0
  };

  data.shares[token] = share;
  saveData(data);
  return share;
}

export function getSharePayload(token: string): {
  share?: ExternalShare;
  data?: unknown;
  error?: string;
} {
  const store = loadData();
  const share = store.shares[token];
  if (!share) return { error: "Share link not found or invalid." };

  if (share.status === "revoked") {
    return { error: "This share link has been revoked by the family." };
  }

  if (share.expiresAt && share.expiresAt < new Date().toISOString()) {
    share.status = "expired";
    saveData(store);
    return { error: "This share link has expired." };
  }

  share.accessCount += 1;
  saveData(store);

  // Load payload based on entityType
  if (share.entityType === "tree") {
    const graph = getGraph(share.familyId);
    return {
      share,
      data: {
        familyId: share.familyId,
        familyName: share.familyName,
        people: Object.values(graph.people),
        relationships: Object.values(graph.relationships)
      }
    };
  }

  if (share.entityType === "person" && share.entityId) {
    const graph = getGraph(share.familyId);
    const person = graph.people[share.entityId];
    return { share, data: { person } };
  }

  const family = getFamily(share.familyId);
  if (share.entityType === "story" && share.entityId) {
    const story = family?.stories.find((s) => s.id === share.entityId);
    return { share, data: { story } };
  }

  return { share, data: null };
}

export function revokeShareToken(token: string, userId: string): boolean {
  const store = loadData();
  const share = store.shares[token];
  if (share) {
    share.status = "revoked";
    saveData(store);
    return true;
  }
  return false;
}

export function listFamilyShares(familyId: string): ExternalShare[] {
  const store = loadData();
  return Object.values(store.shares).filter((s) => s.familyId === familyId);
}

// ---------------------------------------------------------------------------
// PRINTABLE HTML TREE EXPORTER
// ---------------------------------------------------------------------------
export function generatePrintableTreeHtml(familyId: string): string {
  const family = getFamily(familyId);
  const graph = getGraph(familyId);
  const people = Object.values(graph.people) as GraphPerson[];
  const rels = Object.values(graph.relationships) as GraphRelationship[];

  const familyName = family?.name || "Yesterday Family Heritage";

  const peopleCards = people
    .map(
      (p) => `
    <div class="person-card">
      <div class="avatar">${p.displayName.charAt(0).toUpperCase()}</div>
      <div class="name">${p.displayName}</div>
      <div class="meta">${p.birthYear ? `Born: ${p.birthYear}` : ""} ${p.birthPlace ? `in ${p.birthPlace}` : ""}</div>
      ${p.bio ? `<div class="bio">${p.bio}</div>` : ""}
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${familyName} — Family Heritage Tree</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #FBF8F3;
      color: #1F1A16;
      margin: 0;
      padding: 30px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #EFE8DE;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      color: #9C4A28;
      margin: 0 0 8px 0;
    }
    .subtitle {
      font-size: 14px;
      color: #685F56;
      margin: 0;
    }
    .print-btn {
      background: #9C4A28;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    .person-card {
      background: #FFFFFF;
      border: 1px solid #EFE8DE;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      break-inside: avoid;
    }
    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: #F9EFE5;
      color: #9C4A28;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 800;
      margin: 0 auto 10px auto;
    }
    .name {
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 12px;
      color: #685F56;
      margin-bottom: 8px;
    }
    .bio {
      font-size: 11px;
      color: #1F1A16;
      line-height: 15px;
      text-align: left;
      background: #FBF8F3;
      padding: 8px;
      border-radius: 6px;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: #685F56;
      margin-top: 40px;
      border-top: 1px solid #EFE8DE;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${familyName}</h1>
    ${family?.ancestralLocation ? `<p style="font-size: 13px; color: #9C4A28; font-weight: 600; margin: 4px 0;">📍 Ancestral Roots: ${family.ancestralLocation}</p>` : ''}
    <p class="subtitle">Documented Family Heritage Archive · ${people.length} Relatives · Generated by Yesterday</p>
    <button class="print-btn no-print" onclick="window.print()">Print or Save as PDF</button>
  </div>
  <div class="grid">
    ${peopleCards}
  </div>
  <div class="footer">
    Preserving family voices, heritage, and lineage for future generations.
  </div>
</body>
</html>`;
}
