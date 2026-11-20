import { Platform } from 'react-native';
import {
  getSetting,
  listPeople,
  listRelationships,
  listStories,
  setSetting,
  upsertTreeEntities,
  type FamilyRelationship,
  type Person,
  type SuggestedPerson,
  type SuggestedRelationship
} from './database';

export interface FamilyMember {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'contributor' | 'reviewer' | 'viewer' | 'editor';
  status: 'active' | 'pending';
  joinedAt: string;
}

export interface SharedFamilyTree {
  id: string;
  name: string;
  inviteCode: string;
  description?: string | null;
  ancestralLocation?: string | null;
  privacy?: 'private' | 'family_only' | 'unlisted';
  coverPhotoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  members: FamilyMember[];
  people: Array<{
    id: string;
    name: string;
    relationship?: string | null;
    gender?: 'male' | 'female' | 'other' | null;
    birthYear?: number | null;
    birthPlace?: string | null;
    notes?: string | null;
    reviewStatus?: string;
    updatedBy?: string;
    updatedAt: string;
  }>;
  relationships: Array<{
    id: string;
    personA: string;
    personB: string;
    relation: string;
    status: string;
    evidence?: string | null;
    updatedBy?: string;
    updatedAt: string;
  }>;
  stories: Array<{
    id: string;
    title: string;
    narrative: string;
    createdAt: string;
    authorName?: string;
  }>;
}

export interface StoredFamilySession {
  familyId: string;
  familyName: string;
  inviteCode: string;
  userId: string;
  userName: string;
  userRole: 'owner' | 'admin' | 'contributor' | 'reviewer' | 'viewer' | 'editor';
  membershipStatus: 'active' | 'pending';
  serverUrl: string;
  lastSyncedAt?: string;
}

let cachedSession: StoredFamilySession | null = null;
let customServerUrl: string = process.env.EXPO_PUBLIC_API_URL || 'https://celebrities-zero-tones-manga.trycloudflare.com';
let initialized = false;

export async function initSyncSession(): Promise<StoredFamilySession | null> {
  if (initialized) return cachedSession;
  try {
    const savedUrl = await getSetting('server_url');
    if (savedUrl && savedUrl.trim()) {
      customServerUrl = savedUrl.trim();
    }
    const savedSession = await getSetting('family_session');
    if (savedSession) {
      cachedSession = JSON.parse(savedSession) as StoredFamilySession;
    }
  } catch (err) {
    console.warn('Could not restore saved family session:', err);
  } finally {
    initialized = true;
  }
  return cachedSession;
}

export function getServerUrl(): string {
  return customServerUrl;
}

export function setServerUrl(url: string) {
  let clean = url.trim();
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  customServerUrl = clean;
  setSetting('server_url', clean).catch(console.error);
}

export async function persistSession(session: StoredFamilySession | null) {
  cachedSession = session;
  if (session) {
    await setSetting('family_session', JSON.stringify(session));
  } else {
    await setSetting('family_session', '');
  }
}

export async function testServerConnection(url = customServerUrl): Promise<{ ok: boolean; message: string }> {
  try {
    let clean = url.trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = `http://${clean}`;

    const res = await fetch(`${clean}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, message: `Connected to ${data.service ?? 'Yesterday API'} (${data.version ?? 'v0.4'})` };
    }
    return { ok: false, message: `Server responded with HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed. Check IP & port.' };
  }
}

export function getCachedSession(): StoredFamilySession | null {
  return cachedSession;
}

export function setCachedSession(session: StoredFamilySession | null) {
  cachedSession = session;
}

let authenticatedUserId: string | null = null;
let authenticatedUserName: string | null = null;

export function setAuthenticatedProfile(id: string | null, name: string | null) {
  authenticatedUserId = id;
  authenticatedUserName = name;
  if (cachedSession && id) {
    cachedSession.userId = id;
    if (name) cachedSession.userName = name;
  }
}

export function getOrCreateUserId(): string {
  if (authenticatedUserId) return authenticatedUserId;
  if (cachedSession?.userId) return cachedSession.userId;
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getAuthenticatedUserName(): string | null {
  return authenticatedUserName || cachedSession?.userName || null;
}

/**
 * Creates a new cloud-synced family tree. The creator becomes the owner/admin.
 */
export async function createCloudFamily(input: {
  familyName: string;
  creatorName: string;
}): Promise<{ family: SharedFamilyTree; session: StoredFamilySession }> {
  const userId = getOrCreateUserId();
  const currentPeople = await listPeople();
  const currentRels = await listRelationships();

  const response = await fetch(`${getServerUrl()}/v1/family/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyName: input.familyName,
      creatorId: userId,
      creatorName: input.creatorName,
      initialPeople: currentPeople.map(p => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        gender: p.gender,
        birthYear: p.birthYear,
        birthPlace: p.birthPlace,
        notes: p.notes,
        reviewStatus: p.reviewStatus,
        updatedAt: new Date().toISOString()
      })),
      initialRelationships: currentRels.map(r => ({
        id: r.id,
        personA: r.personA,
        personB: r.personB,
        relation: r.relation,
        status: r.status,
        evidence: r.evidence,
        updatedAt: new Date().toISOString()
      }))
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? data.error ?? 'Failed to create family tree.');

  const family: SharedFamilyTree = data.family;
  const session: StoredFamilySession = {
    familyId: family.id,
    familyName: family.name,
    inviteCode: family.inviteCode,
    userId,
    userName: input.creatorName,
    userRole: 'owner',
    membershipStatus: 'active',
    serverUrl: getServerUrl(),
    lastSyncedAt: new Date().toISOString()
  };

  cachedSession = session;
  await persistSession(session);
  return { family, session };
}

/**
 * Joins an existing family tree via its invite code.
 */
export async function joinCloudFamily(input: {
  inviteCode: string;
  userName: string;
}): Promise<{ family: SharedFamilyTree; session: StoredFamilySession }> {
  const userId = getOrCreateUserId();

  const response = await fetch(`${getServerUrl()}/v1/family/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviteCode: input.inviteCode,
      userId,
      userName: input.userName
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? data.error ?? 'Could not join family.');

  const family: SharedFamilyTree = data.family;
  const status: 'active' | 'pending' = data.membershipStatus ?? 'pending';

  const session: StoredFamilySession = {
    familyId: family.id,
    familyName: family.name,
    inviteCode: family.inviteCode,
    userId,
    userName: input.userName,
    userRole: 'editor',
    membershipStatus: status,
    serverUrl: getServerUrl(),
    lastSyncedAt: new Date().toISOString()
  };

  cachedSession = session;
  await persistSession(session);

  // If approved, sync down immediately
  if (status === 'active') {
    await applyCloudDataToLocal(family);
  }

  return { family, session };
}

/**
 * Full bidirectional synchronization: pushes local edits, pulls cloud changes.
 */
export async function syncWithCloud(): Promise<{ family: SharedFamilyTree; pendingApproval: boolean }> {
  if (!cachedSession) throw new Error('No family tree connected. Please create or join a family.');

  const localPeople = await listPeople();
  const localRels = await listRelationships();
  const localStories = await listStories();

  const response = await fetch(`${getServerUrl()}/v1/family/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      userId: cachedSession.userId,
      newPeople: localPeople.map(p => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        gender: p.gender,
        birthYear: p.birthYear,
        birthPlace: p.birthPlace,
        notes: p.notes,
        reviewStatus: p.reviewStatus,
        updatedAt: p.createdAt
      })),
      newRelationships: localRels.map(r => ({
        id: r.id,
        personA: r.personA,
        personB: r.personB,
        relation: r.relation,
        status: r.status,
        evidence: r.evidence,
        updatedAt: new Date().toISOString()
      })),
      newStories: localStories.map(s => ({
        id: s.id,
        title: s.title,
        narrative: s.narrative,
        createdAt: s.createdAt
      }))
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.message?.includes('approval')) {
      cachedSession.membershipStatus = 'pending';
      return { family: null as any, pendingApproval: true };
    }
    throw new Error(data.message ?? data.error ?? 'Sync failed.');
  }

  const family: SharedFamilyTree = data.family;
  cachedSession.membershipStatus = 'active';
  cachedSession.lastSyncedAt = new Date().toISOString();

  // Find user's current role
  const selfMember = family.members.find(m => m.id === cachedSession?.userId);
  if (selfMember) {
    cachedSession.userRole = selfMember.role;
    cachedSession.membershipStatus = selfMember.status;
  }

  await persistSession(cachedSession);

  // Apply cloud changes into SQLite
  await applyCloudDataToLocal(family);

  return { family, pendingApproval: false };
}

/**
 * Fetches latest family info including member approvals and status.
 */
export async function fetchFamilyDetails(): Promise<SharedFamilyTree> {
  if (!cachedSession) throw new Error('No family tree connected.');

  const response = await fetch(`${getServerUrl()}/v1/family/${cachedSession.familyId}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to fetch family.');

  const family: SharedFamilyTree = data.family;
  const selfMember = family.members.find(m => m.id === cachedSession?.userId);
  if (selfMember) {
    cachedSession.userRole = selfMember.role;
    cachedSession.membershipStatus = selfMember.status;
  }

  return family;
}

/**
 * Admin approves a pending member or adjusts their role.
 */
export async function approveMember(
  targetUserId: string,
  role: 'owner' | 'admin' | 'contributor' | 'reviewer' | 'viewer' | 'editor' = 'contributor'
) {
  if (!cachedSession) throw new Error('Not connected.');
  const response = await fetch(`${getServerUrl()}/v1/family/members/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      adminUserId: cachedSession.userId,
      targetUserId,
      status: 'active',
      role
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Approval failed.');
  return data.family as SharedFamilyTree;
}

/**
 * Admin removes a member.
 */
export async function removeMember(targetUserId: string) {
  if (!cachedSession) throw new Error('Not connected.');
  const response = await fetch(`${getServerUrl()}/v1/family/members/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      adminUserId: cachedSession.userId,
      targetUserId
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Removal failed.');
  return data.family as SharedFamilyTree;
}

/**
 * Disconnects from cloud sync on this device.
 */
export async function leaveFamily() {
  cachedSession = null;
  await persistSession(null);
}

/**
 * Helper to write cloud people & relationships into SQLite.
 */
async function applyCloudDataToLocal(family: SharedFamilyTree) {
  if (!family.people?.length && !family.relationships?.length) return;

  const peopleToAdd: SuggestedPerson[] = family.people.map(p => ({
    name: p.name,
    relationshipToNarrator: p.relationship ?? null,
    gender: p.gender ?? null,
    birthYear: p.birthYear ?? null,
    birthPlace: p.birthPlace ?? null,
    notes: p.notes ?? (p.updatedBy ? `Added by ${p.updatedBy}` : null)
  }));

  const relsToAdd: SuggestedRelationship[] = family.relationships.map(r => ({
    personA: r.personA,
    personB: r.personB,
    type: r.relation,
    evidence: r.evidence ?? 'Cloud family sync'
  }));

  await upsertTreeEntities(peopleToAdd, relsToAdd);
}

// ---------------------------------------------------------------------------
// INVITATIONS CLIENT
// ---------------------------------------------------------------------------

export interface ClientInvitation {
  id: string;
  familyId: string;
  familyName: string;
  inviterId: string;
  inviterName: string;
  recipientEmail?: string | null;
  role: 'owner' | 'admin' | 'contributor' | 'reviewer' | 'viewer';
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
}

export async function createInvitationClient(input: {
  recipientEmail?: string;
  role?: 'admin' | 'contributor' | 'reviewer' | 'viewer';
  expiresInDays?: number;
}): Promise<ClientInvitation> {
  if (!cachedSession) throw new Error('Not connected to a family.');
  const response = await fetch(`${getServerUrl()}/v1/family/invitations/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      inviterId: cachedSession.userId,
      recipientEmail: input.recipientEmail || undefined,
      role: input.role || 'contributor',
      expiresInDays: input.expiresInDays || 7
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to create invitation.');
  return data.invitation as ClientInvitation;
}

export async function listInvitationsClient(): Promise<ClientInvitation[]> {
  if (!cachedSession) return [];
  const response = await fetch(
    `${getServerUrl()}/v1/family/invitations/list?familyId=${encodeURIComponent(cachedSession.familyId)}&userId=${encodeURIComponent(cachedSession.userId)}`
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to load invitations.');
  return data.invitations as ClientInvitation[];
}

export async function getInvitationByTokenClient(token: string) {
  const response = await fetch(`${getServerUrl()}/v1/family/invitations/token/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Invitation not found.');
  return data as { invitation: ClientInvitation; familyPreview: { id: string; name: string; description: string | null; memberCount: number; ancestralLocation: string | null } };
}

export async function acceptInvitationClient(token: string, userName: string) {
  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const response = await fetch(`${getServerUrl()}/v1/family/invitations/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, userId, userName })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Could not accept invitation.');

  const family = data.family as SharedFamilyTree;
  const newSession: StoredFamilySession = {
    familyId: family.id,
    familyName: family.name,
    inviteCode: family.inviteCode,
    userId,
    userName,
    userRole: data.role || 'contributor',
    membershipStatus: 'active',
    serverUrl: getServerUrl(),
    lastSyncedAt: new Date().toISOString()
  };
  await persistSession(newSession);
  return { family, session: newSession };
}

export async function revokeInvitationClient(invitationId: string) {
  if (!cachedSession) throw new Error('Not connected.');
  const response = await fetch(`${getServerUrl()}/v1/family/invitations/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      adminUserId: cachedSession.userId,
      invitationId
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to revoke.');
  return true;
}

export async function resendInvitationClient(invitationId: string) {
  if (!cachedSession) throw new Error('Not connected.');
  const response = await fetch(`${getServerUrl()}/v1/family/invitations/resend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      adminUserId: cachedSession.userId,
      invitationId
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to resend.');
  return data.invitation as ClientInvitation;
}

// ---------------------------------------------------------------------------
// ACTIVITY FEED
// ---------------------------------------------------------------------------

export interface ClientActivityItem {
  id: string;
  familyId: string;
  actorId: string;
  actorName: string;
  actionType: string;
  entityTitle: string;
  entityId?: string | null;
  timestamp: string;
}

export async function fetchFamilyActivity(): Promise<ClientActivityItem[]> {
  if (!cachedSession) return [];
  const response = await fetch(`${getServerUrl()}/v1/family/${encodeURIComponent(cachedSession.familyId)}/activity`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return (data.activities || []) as ClientActivityItem[];
}

// ---------------------------------------------------------------------------
// FAMILY SETTINGS & MULTI-FAMILY
// ---------------------------------------------------------------------------

export async function updateFamilySettingsClient(updates: {
  name?: string;
  description?: string | null;
  ancestralLocation?: string | null;
  privacy?: 'private' | 'family_only' | 'unlisted';
}) {
  if (!cachedSession) throw new Error('Not connected.');
  const response = await fetch(`${getServerUrl()}/v1/family/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      userId: cachedSession.userId,
      ...updates
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Could not update settings.');
  return data.family as SharedFamilyTree;
}

export async function listUserFamiliesClient() {
  if (!cachedSession) return [];
  const response = await fetch(`${getServerUrl()}/v1/family/user-families?userId=${encodeURIComponent(cachedSession.userId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return (data.families || []) as Array<{ family: SharedFamilyTree; userRole: string; membershipStatus: string }>;
}

// ---------------------------------------------------------------------------
// SOCIAL: COMMENTS, REACTIONS & CONTRIBUTIONS
// ---------------------------------------------------------------------------

export async function addCommentClient(input: {
  entityType: 'story' | 'person' | 'photo' | 'event';
  entityId: string;
  content: string;
  parentId?: string | null;
}) {
  if (!cachedSession) throw new Error('Please sign in or join a family.');
  const response = await fetch(`${getServerUrl()}/v1/social/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      authorId: cachedSession.userId,
      authorName: cachedSession.userName,
      ...input
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to post comment.');
  return data.comment;
}

export async function listCommentsClient(entityType: string, entityId: string) {
  const response = await fetch(
    `${getServerUrl()}/v1/social/comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return (data.comments || []) as Array<{
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    parentId?: string | null;
    createdAt: string;
  }>;
}

export async function deleteCommentClient(commentId: string) {
  if (!cachedSession) return;
  await fetch(
    `${getServerUrl()}/v1/social/comments/${encodeURIComponent(commentId)}?userId=${encodeURIComponent(cachedSession.userId)}&userRole=${encodeURIComponent(cachedSession.userRole)}`,
    { method: 'DELETE' }
  );
}

export async function toggleReactionClient(input: {
  entityType: 'story' | 'person' | 'photo' | 'event';
  entityId: string;
  reactionType: 'heart' | 'like' | 'remember' | 'meaningful' | 'thank_you';
}) {
  if (!cachedSession) throw new Error('Please join a family.');
  const response = await fetch(`${getServerUrl()}/v1/social/reactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      userId: cachedSession.userId,
      userName: cachedSession.userName,
      ...input
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to react.');
  return data as { success: boolean; userReacted: boolean; counts: Record<string, number> };
}

export async function listReactionsClient(entityType: string, entityId: string) {
  const response = await fetch(
    `${getServerUrl()}/v1/social/reactions?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { reactions: [], counts: {} };
  return data as { reactions: any[]; counts: Record<string, number> };
}

export async function addStoryContributionClient(input: {
  storyId: string;
  perspectiveText: string;
  photoUris?: string[];
  dateCorrection?: string | null;
}) {
  if (!cachedSession) throw new Error('Please join a family.');
  const response = await fetch(`${getServerUrl()}/v1/stories/${encodeURIComponent(input.storyId)}/contributions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      contributorId: cachedSession.userId,
      contributorName: cachedSession.userName,
      ...input
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Could not add contribution.');
  return data.contribution;
}

export async function listStoryContributionsClient(storyId: string) {
  const response = await fetch(`${getServerUrl()}/v1/stories/${encodeURIComponent(storyId)}/contributions`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return (data.contributions || []) as Array<{
    id: string;
    contributorName: string;
    perspectiveText: string;
    photoUris: string[];
    dateCorrection?: string | null;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS CLIENT
// ---------------------------------------------------------------------------

export async function listNotificationsClient() {
  if (!cachedSession) return { notifications: [], unreadCount: 0 };
  const response = await fetch(`${getServerUrl()}/v1/notifications?userId=${encodeURIComponent(cachedSession.userId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { notifications: [], unreadCount: 0 };
  return data as { notifications: any[]; unreadCount: number };
}

export async function markNotificationReadClient(notificationId: string) {
  if (!cachedSession) return;
  await fetch(`${getServerUrl()}/v1/notifications/mark-read`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: cachedSession.userId, notificationId })
  });
}

export async function markAllNotificationsReadClient() {
  if (!cachedSession) return;
  await fetch(`${getServerUrl()}/v1/notifications/mark-all-read`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: cachedSession.userId })
  });
}

// ---------------------------------------------------------------------------
// SHARING & EXPORTS CLIENT
// ---------------------------------------------------------------------------

export async function createShareTokenClient(input: {
  entityType: 'story' | 'person' | 'tree' | 'timeline' | 'recipe';
  entityId?: string;
  title: string;
  expiresInDays?: number;
}) {
  if (!cachedSession) throw new Error('Please join a family.');
  const response = await fetch(`${getServerUrl()}/v1/share/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      familyId: cachedSession.familyId,
      createdById: cachedSession.userId,
      createdByName: cachedSession.userName,
      ...input
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? 'Failed to generate share link.');
  return data.share as { token: string; title: string; expiresAt?: string | null };
}

export function getPrintableTreeUrl(familyId?: string): string {
  const targetFamilyId = familyId || cachedSession?.familyId || 'default-family';
  return `${getServerUrl()}/v1/genealogy/tree/printable-html?familyId=${encodeURIComponent(targetFamilyId)}`;
}
