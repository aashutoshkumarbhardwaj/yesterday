import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const DATA_FILE = path.join(DATA_DIR, "families.json");

export type FamilyRole = "owner" | "admin" | "contributor" | "reviewer" | "viewer";
export type MembershipStatus = "active" | "pending";
export type FamilyPrivacy = "private" | "family_only" | "unlisted";

export interface FamilyMember {
  id: string; // userId or deviceId
  name: string;
  role: FamilyRole;
  status: MembershipStatus;
  joinedAt: string;
  email?: string | null;
}

export interface FamilyInvitation {
  id: string;
  familyId: string;
  familyName: string;
  inviterId: string;
  inviterName: string;
  recipientEmail?: string | null;
  role: FamilyRole;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  acceptedByUserId?: string | null;
  acceptedAt?: string | null;
}

export interface SharedPerson {
  id: string;
  name: string;
  relationship?: string | null | undefined;
  gender?: ("male" | "female" | "other") | null | undefined;
  birthYear?: number | null | undefined;
  birthPlace?: string | null | undefined;
  notes?: string | null | undefined;
  reviewStatus?: string | undefined;
  updatedBy?: string | undefined;
  updatedAt: string;
}

export interface SharedRelationship {
  id: string;
  personA: string;
  personB: string;
  relation: string;
  status: string;
  evidence?: string | null | undefined;
  updatedBy?: string | undefined;
  updatedAt: string;
}

export interface SharedStory {
  id: string;
  title: string;
  narrative: string;
  createdAt: string;
  authorName?: string | undefined;
}

export interface SharedFamilyTree {
  id: string;
  name: string;
  description?: string | null;
  ancestralLocation?: string | null;
  privacy: FamilyPrivacy;
  coverPhotoUrl?: string | null;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  members: FamilyMember[];
  invitations: FamilyInvitation[];
  people: SharedPerson[];
  relationships: SharedRelationship[];
  stories: SharedStory[];
}

interface FamilyStoreData {
  families: Record<string, SharedFamilyTree>;
}

// ---------------------------------------------------------------------------
// PERMISSION MATRIX
// ---------------------------------------------------------------------------
export type ActionType =
  | "manage_family"
  | "manage_members"
  | "invite_members"
  | "edit_archive"
  | "review_suggestions"
  | "view_archive"
  | "export_data"
  | "delete_family";

export function hasPermission(role: FamilyRole, action: ActionType): boolean {
  switch (role) {
    case "owner":
      return true;
    case "admin":
      return action !== "delete_family";
    case "contributor":
      return ["edit_archive", "view_archive", "export_data", "invite_members"].includes(action);
    case "reviewer":
      return ["review_suggestions", "view_archive", "export_data"].includes(action);
    case "viewer":
      return ["view_archive", "export_data"].includes(action);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// DATA PERSISTENCE
// ---------------------------------------------------------------------------
function loadData(): FamilyStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(content) as FamilyStoreData;
      // Ensure invitations array exists on all families
      for (const fam of Object.values(parsed.families)) {
        if (!Array.isArray(fam.invitations)) fam.invitations = [];
        if (!fam.privacy) fam.privacy = "private";
      }
      return parsed;
    }
  } catch (err) {
    console.error("Error reading family store:", err);
  }
  return { families: {} };
}

function saveData(data: FamilyStoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving family store:", err);
  }
}

function generateCode(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "FAM";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${clean}-${num}`;
}

// ---------------------------------------------------------------------------
// FAMILY CREATION & SETTINGS
// ---------------------------------------------------------------------------
export function createFamily(input: {
  familyName: string;
  creatorId: string;
  creatorName: string;
  description?: string | undefined;
  ancestralLocation?: string | undefined;
  privacy?: FamilyPrivacy | undefined;
  coverPhotoUrl?: string | undefined;
  initialPeople?: SharedPerson[] | undefined;
  initialRelationships?: SharedRelationship[] | undefined;
}): SharedFamilyTree {
  const data = loadData();
  const familyId = `fam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inviteCode = generateCode(input.familyName);
  const now = new Date().toISOString();

  const family: SharedFamilyTree = {
    id: familyId,
    name: input.familyName.trim(),
    description: input.description?.trim() || null,
    ancestralLocation: input.ancestralLocation?.trim() || null,
    privacy: input.privacy || "private",
    coverPhotoUrl: input.coverPhotoUrl || null,
    inviteCode,
    createdAt: now,
    updatedAt: now,
    version: 1,
    members: [
      {
        id: input.creatorId,
        name: input.creatorName.trim(),
        role: "owner",
        status: "active",
        joinedAt: now
      }
    ],
    invitations: [],
    people: input.initialPeople ?? [],
    relationships: input.initialRelationships ?? [],
    stories: []
  };

  data.families[familyId] = family;
  saveData(data);
  return family;
}

export function updateFamilySettings(input: {
  familyId: string;
  userId: string;
  name?: string | undefined;
  description?: string | null | undefined;
  ancestralLocation?: string | null | undefined;
  privacy?: FamilyPrivacy | undefined;
  coverPhotoUrl?: string | null | undefined;
}): { success: boolean; family?: SharedFamilyTree; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { success: false, error: "Family not found." };

  const member = family.members.find((m) => m.id === input.userId);
  if (!member || !hasPermission(member.role, "manage_family")) {
    return { success: false, error: "Only an Owner or Admin can update family settings." };
  }

  if (input.name && input.name.trim()) family.name = input.name.trim();
  if (input.description !== undefined) family.description = input.description ? input.description.trim() : null;
  if (input.ancestralLocation !== undefined) family.ancestralLocation = input.ancestralLocation ? input.ancestralLocation.trim() : null;
  if (input.privacy !== undefined) family.privacy = input.privacy;
  if (input.coverPhotoUrl !== undefined) family.coverPhotoUrl = input.coverPhotoUrl;

  family.updatedAt = new Date().toISOString();
  saveData(data);
  return { success: true, family };
}

export function getFamily(familyId: string): SharedFamilyTree | null {
  const data = loadData();
  return data.families[familyId] ?? null;
}

export function listUserFamilies(userId: string): Array<{
  family: SharedFamilyTree;
  userRole: FamilyRole;
  membershipStatus: MembershipStatus;
}> {
  const data = loadData();
  const results: Array<{
    family: SharedFamilyTree;
    userRole: FamilyRole;
    membershipStatus: MembershipStatus;
  }> = [];

  for (const fam of Object.values(data.families)) {
    const member = fam.members.find((m) => m.id === userId);
    if (member) {
      results.push({
        family: fam,
        userRole: member.role,
        membershipStatus: member.status
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// INVITATION SYSTEM
// ---------------------------------------------------------------------------
export function createInvitation(input: {
  familyId: string;
  inviterId: string;
  recipientEmail?: string | null | undefined;
  role?: FamilyRole | undefined;
  expiresInDays?: number | undefined;
}): { invitation?: FamilyInvitation; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { error: "Family not found." };

  const inviter = family.members.find((m) => m.id === input.inviterId);
  if (!inviter || !hasPermission(inviter.role, "invite_members")) {
    return { error: "You do not have permission to invite relatives to this family." };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(16).toString("hex");

  // Check for duplicate pending invitation to same email
  if (input.recipientEmail) {
    const cleanEmail = input.recipientEmail.trim().toLowerCase();
    const existing = family.invitations.find(
      (inv) => inv.recipientEmail?.toLowerCase() === cleanEmail && inv.status === "pending"
    );
    if (existing) {
      // Refresh expiry and return existing
      existing.expiresAt = expiresAt.toISOString();
      saveData(data);
      return { invitation: existing };
    }
  }

  const invitation: FamilyInvitation = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    familyId: family.id,
    familyName: family.name,
    inviterId: inviter.id,
    inviterName: inviter.name,
    recipientEmail: input.recipientEmail ? input.recipientEmail.trim().toLowerCase() : null,
    role: input.role || "contributor",
    token,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  family.invitations.push(invitation);
  family.updatedAt = now.toISOString();
  saveData(data);

  return { invitation };
}

export function listInvitations(familyId: string, userId: string): {
  invitations?: FamilyInvitation[];
  error?: string;
} {
  const data = loadData();
  const family = data.families[familyId];
  if (!family) return { error: "Family not found." };

  const member = family.members.find((m) => m.id === userId);
  if (!member) return { error: "Access denied: Not a member of this family." };

  const now = new Date().toISOString();
  // Auto-expire past invitations
  for (const inv of family.invitations) {
    if (inv.status === "pending" && inv.expiresAt < now) {
      inv.status = "expired";
    }
  }
  saveData(data);

  return { invitations: family.invitations };
}

export function getInvitationByToken(token: string): {
  invitation?: FamilyInvitation;
  familyPreview?: { id: string; name: string; description: string | null; memberCount: number; ancestralLocation: string | null };
  error?: string;
} {
  const data = loadData();
  for (const fam of Object.values(data.families)) {
    const inv = fam.invitations.find((i) => i.token === token.trim());
    if (inv) {
      if (inv.status === "pending" && inv.expiresAt < new Date().toISOString()) {
        inv.status = "expired";
        saveData(data);
      }
      return {
        invitation: inv,
        familyPreview: {
          id: fam.id,
          name: fam.name,
          description: fam.description || null,
          memberCount: fam.members.filter((m) => m.status === "active").length,
          ancestralLocation: fam.ancestralLocation || null
        }
      };
    }
  }
  return { error: "Invitation not found or has been revoked." };
}

export function acceptInvitation(input: {
  token: string;
  userId: string;
  userName: string;
}): { success: boolean; family?: SharedFamilyTree; role?: FamilyRole; error?: string } {
  const data = loadData();
  for (const fam of Object.values(data.families)) {
    const inv = fam.invitations.find((i) => i.token === input.token.trim());
    if (inv) {
      if (inv.status !== "pending") {
        return { success: false, error: `Invitation is no longer active (${inv.status}).` };
      }
      if (inv.expiresAt < new Date().toISOString()) {
        inv.status = "expired";
        saveData(data);
        return { success: false, error: "This invitation link has expired." };
      }

      // Check if user is already an active member
      let member = fam.members.find((m) => m.id === input.userId);
      if (member) {
        member.status = "active";
        member.role = inv.role;
      } else {
        member = {
          id: input.userId,
          name: input.userName.trim(),
          role: inv.role,
          status: "active",
          joinedAt: new Date().toISOString()
        };
        fam.members.push(member);
      }

      inv.status = "accepted";
      inv.acceptedByUserId = input.userId;
      inv.acceptedAt = new Date().toISOString();
      fam.updatedAt = new Date().toISOString();
      saveData(data);

      return { success: true, family: fam, role: inv.role };
    }
  }
  return { success: false, error: "Invalid invitation token." };
}

export function revokeInvitation(input: {
  familyId: string;
  adminUserId: string;
  invitationId: string;
}): { success: boolean; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { success: false, error: "Family not found." };

  const admin = family.members.find((m) => m.id === input.adminUserId);
  if (!admin || !hasPermission(admin.role, "manage_members")) {
    return { success: false, error: "Only an Owner or Admin can revoke invitations." };
  }

  const inv = family.invitations.find((i) => i.id === input.invitationId);
  if (!inv) return { success: false, error: "Invitation not found." };

  inv.status = "revoked";
  family.updatedAt = new Date().toISOString();
  saveData(data);

  return { success: true };
}

export function resendInvitation(input: {
  familyId: string;
  adminUserId: string;
  invitationId: string;
  expiresInDays?: number | undefined;
}): { success: boolean; invitation?: FamilyInvitation; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { success: false, error: "Family not found." };

  const admin = family.members.find((m) => m.id === input.adminUserId);
  if (!admin || !hasPermission(admin.role, "invite_members")) {
    return { success: false, error: "Permission denied." };
  }

  const inv = family.invitations.find((i) => i.id === input.invitationId);
  if (!inv) return { success: false, error: "Invitation not found." };

  const now = new Date();
  inv.status = "pending";
  inv.createdAt = now.toISOString();
  inv.expiresAt = new Date(now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString();
  inv.token = crypto.randomBytes(16).toString("hex");

  family.updatedAt = now.toISOString();
  saveData(data);

  return { success: true, invitation: inv };
}

// ---------------------------------------------------------------------------
// MEMBERSHIP APPROVAL, ROLES & REMOVAL
// ---------------------------------------------------------------------------
export function joinFamily(input: {
  inviteCode: string;
  userId: string;
  userName: string;
}): { family?: SharedFamilyTree; membershipStatus?: "active" | "pending"; error?: string } {
  const data = loadData();
  const code = input.inviteCode.trim().toUpperCase();

  const family = Object.values(data.families).find((f) => f.inviteCode.toUpperCase() === code);
  if (!family) {
    return { error: `No family tree found with invite code "${code}". Please check the code.` };
  }

  const existingMember = family.members.find((m) => m.id === input.userId);
  if (existingMember) {
    return { family, membershipStatus: existingMember.status };
  }

  // Add new member as pending approval
  const newMember: FamilyMember = {
    id: input.userId,
    name: input.userName.trim(),
    role: "contributor",
    status: "pending",
    joinedAt: new Date().toISOString()
  };

  family.members.push(newMember);
  family.updatedAt = new Date().toISOString();
  saveData(data);

  return { family, membershipStatus: "pending" };
}

export function updateMemberStatus(input: {
  familyId: string;
  adminUserId: string;
  targetUserId: string;
  status: "active" | "pending";
  role?: FamilyRole;
}): { success: boolean; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { success: false, error: "Family not found." };

  const admin = family.members.find((m) => m.id === input.adminUserId);
  if (!admin || !hasPermission(admin.role, "manage_members")) {
    return { success: false, error: "Only a family Owner or Admin can manage member roles." };
  }

  const target = family.members.find((m) => m.id === input.targetUserId);
  if (!target) return { success: false, error: "Target member not found." };

  target.status = input.status;
  if (input.role) target.role = input.role;
  family.updatedAt = new Date().toISOString();
  saveData(data);

  return { success: true };
}

export function removeFamilyMember(input: {
  familyId: string;
  adminUserId: string;
  targetUserId: string;
}): { success: boolean; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { success: false, error: "Family not found." };

  const admin = family.members.find((m) => m.id === input.adminUserId);
  if (!admin || !hasPermission(admin.role, "manage_members")) {
    return { success: false, error: "Only a family Owner or Admin can remove members." };
  }

  // Cannot remove owner
  const target = family.members.find((m) => m.id === input.targetUserId);
  if (target?.role === "owner" && admin.role !== "owner") {
    return { success: false, error: "Cannot remove the family Owner." };
  }

  family.members = family.members.filter((m) => m.id !== input.targetUserId);
  family.updatedAt = new Date().toISOString();
  saveData(data);

  return { success: true };
}

// ---------------------------------------------------------------------------
// SYNC ENGINE
// ---------------------------------------------------------------------------
export function syncFamilyTree(input: {
  familyId: string;
  userId: string;
  newPeople?: SharedPerson[] | undefined;
  newRelationships?: SharedRelationship[] | undefined;
  newStories?: SharedStory[] | undefined;
}): { family?: SharedFamilyTree; error?: string } {
  const data = loadData();
  const family = data.families[input.familyId];
  if (!family) return { error: "Family not found." };

  const member = family.members.find((m) => m.id === input.userId);
  if (!member) return { error: "You are not a member of this family tree." };
  if (member.status === "pending") {
    return { error: "Waiting for family admin to approve your request." };
  }

  const isContributor = hasPermission(member.role, "edit_archive");
  let hasChanges = false;
  const now = new Date().toISOString();

  if (isContributor) {
    // Merge people
    if (input.newPeople && input.newPeople.length > 0) {
      for (const p of input.newPeople) {
        const existingIdx = family.people.findIndex((ep) => ep.name.toLowerCase() === p.name.toLowerCase());
        if (existingIdx >= 0) {
          const current = family.people[existingIdx]!;
          family.people[existingIdx] = {
            ...current,
            relationship: p.relationship ?? current.relationship,
            gender: p.gender ?? current.gender,
            birthYear: p.birthYear ?? current.birthYear,
            birthPlace: p.birthPlace ?? current.birthPlace,
            notes: p.notes ?? current.notes,
            reviewStatus: p.reviewStatus ?? current.reviewStatus,
            updatedBy: member.name,
            updatedAt: now
          };
          hasChanges = true;
        } else {
          family.people.push({
            ...p,
            updatedBy: member.name,
            updatedAt: now
          });
          hasChanges = true;
        }
      }
    }

    // Merge relationships
    if (input.newRelationships && input.newRelationships.length > 0) {
      for (const r of input.newRelationships) {
        const exists = family.relationships.some(
          (er) =>
            (er.personA.toLowerCase() === r.personA.toLowerCase() &&
              er.personB.toLowerCase() === r.personB.toLowerCase() &&
              er.relation === r.relation) ||
            (er.personA.toLowerCase() === r.personB.toLowerCase() &&
              er.personB.toLowerCase() === r.personA.toLowerCase() &&
              er.relation === r.relation)
        );
        if (!exists) {
          family.relationships.push({
            ...r,
            updatedBy: member.name,
            updatedAt: now
          });
          hasChanges = true;
        }
      }
    }

    // Merge stories
    if (input.newStories && input.newStories.length > 0) {
      for (const s of input.newStories) {
        if (!family.stories.some((es) => es.id === s.id)) {
          family.stories.push({ ...s, authorName: member.name });
          hasChanges = true;
        }
      }
    }
  }

  if (hasChanges) {
    family.version += 1;
    family.updatedAt = now;
    saveData(data);
  }

  return { family };
}
