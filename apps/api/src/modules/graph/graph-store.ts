import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const GRAPH_FILE = path.join(DATA_DIR, "family-graph.json");

export type RelationshipType =
  | "parent"
  | "child"
  | "spouse"
  | "partner"
  | "sibling"
  | "half_sibling"
  | "adoptive_parent"
  | "adopted_child"
  | "step_parent"
  | "step_child"
  | "guardian"
  | "grandparent"
  | "grandchild"
  | "uncle"
  | "aunt"
  | "cousin"
  | "other";

export type FactType =
  | "person_identity"
  | "relationship"
  | "date"
  | "place"
  | "event"
  | "alias"
  | "bio"
  | "recipe"
  | "tradition"
  | "other";

export interface GraphPerson {
  id: string;
  familyId: string;
  displayName: string;
  aliases: string[];
  gender?: "male" | "female" | "other" | null | undefined;
  birthDate?: string | null | undefined;
  birthYear?: number | null | undefined;
  birthPlace?: string | null | undefined;
  deathDate?: string | null | undefined;
  bio?: string | null | undefined;
  notes?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  reviewStatus: "suggested" | "confirmed" | "disputed";
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface GraphRelationship {
  id: string;
  familyId: string;
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
  status: "suggested" | "confirmed" | "disputed";
  confidence?: number | undefined;
  evidenceText?: string | null | undefined;
  sourceMemoryId?: string | null | undefined;
  reviewedBy?: string | null | undefined;
  reviewedAt?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface FactEvidence {
  id: string;
  suggestionId: string;
  memoryId?: string | null | undefined;
  conversationId?: string | null | undefined;
  excerpt: string;
  startMs?: number | null | undefined;
  endMs?: number | null | undefined;
  contributorId?: string | null | undefined;
  createdAt: string;
}

export interface FactSuggestion {
  id: string;
  familyId: string;
  factType: FactType;
  subjectPersonId?: string | null | undefined;
  objectPersonId?: string | null | undefined;
  proposedValue: Record<string, unknown>;
  confidence: number;
  status: "pending" | "confirmed" | "rejected" | "disputed";
  extractionModel: string;
  createdBy?: string | null | undefined;
  reviewedBy?: string | null | undefined;
  reviewedAt?: string | null | undefined;
  createdAt: string;
  evidence: FactEvidence[];
}

export interface PersonMergeCandidate {
  id: string;
  familyId: string;
  personAId: string;
  personBId: string;
  reason: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  reviewedBy?: string | null | undefined;
  reviewedAt?: string | null | undefined;
  createdAt: string;
}

export interface LifeEvent {
  id: string;
  familyId: string;
  personId: string;
  eventType: "birth" | "education" | "marriage" | "career" | "migration" | "recipe" | "tradition" | "life_event" | "death";
  title: string;
  description?: string | null | undefined;
  date?: string | null | undefined;
  place?: string | null | undefined;
  evidenceText?: string | null | undefined;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  familyId: string;
  actorUserId?: string | null | undefined;
  action: string;
  entityType: string;
  entityId?: string | null | undefined;
  details: Record<string, unknown>;
  createdAt: string;
}

interface FamilyGraphData {
  people: Record<string, GraphPerson>;
  relationships: Record<string, GraphRelationship>;
  suggestions: Record<string, FactSuggestion>;
  mergeCandidates: Record<string, PersonMergeCandidate>;
  events: Record<string, LifeEvent>;
  auditLogs: AuditLogEntry[];
}

function loadGraph(): FamilyGraphData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(GRAPH_FILE)) {
      const content = fs.readFileSync(GRAPH_FILE, "utf-8");
      return JSON.parse(content) as FamilyGraphData;
    }
  } catch (err) {
    console.error("Error reading graph file:", err);
  }
  return {
    people: {},
    relationships: {},
    suggestions: {},
    mergeCandidates: {},
    events: {},
    auditLogs: []
  };
}

function saveGraph(data: FamilyGraphData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving graph file:", err);
  }
}

// People Operations
export function createPerson(input: Omit<GraphPerson, "id" | "createdAt" | "updatedAt">): GraphPerson {
  const data = loadGraph();
  const id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const person: GraphPerson = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now
  };
  data.people[id] = person;
  saveGraph(data);
  return person;
}

export function getPerson(id: string, familyId?: string): GraphPerson | null {
  const data = loadGraph();
  const p = data.people[id];
  if (!p) return null;
  if (familyId && p.familyId !== familyId) return null;
  return p;
}

export function listFamilyPeople(familyId: string): GraphPerson[] {
  const data = loadGraph();
  return Object.values(data.people).filter((p) => p.familyId === familyId);
}

export function updatePerson(
  id: string,
  familyId: string,
  updates: Partial<Omit<GraphPerson, "id" | "familyId" | "createdAt" | "updatedAt">>
): GraphPerson | null {
  const data = loadGraph();
  const person = data.people[id];
  if (!person || person.familyId !== familyId) return null;
  const updated: GraphPerson = {
    ...person,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  data.people[id] = updated;
  saveGraph(data);
  return updated;
}

// Relationships Operations
export function createRelationship(
  input: Omit<GraphRelationship, "id" | "createdAt" | "updatedAt">
): GraphRelationship {
  const data = loadGraph();
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const rel: GraphRelationship = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now
  };
  data.relationships[id] = rel;
  saveGraph(data);
  return rel;
}

export function listFamilyRelationships(familyId: string): GraphRelationship[] {
  const data = loadGraph();
  return Object.values(data.relationships).filter((r) => r.familyId === familyId);
}

// Fact Suggestions & Evidence Operations
export function createFactSuggestion(input: {
  familyId: string;
  factType: FactType;
  subjectPersonId?: string | null | undefined;
  objectPersonId?: string | null | undefined;
  proposedValue: Record<string, unknown>;
  confidence: number;
  extractionModel: string;
  createdBy?: string | null | undefined;
  evidence: Array<{
    memoryId?: string | null | undefined;
    conversationId?: string | null | undefined;
    excerpt: string;
    startMs?: number | null | undefined;
    endMs?: number | null | undefined;
    contributorId?: string | null | undefined;
  }>;
}): FactSuggestion {
  const data = loadGraph();
  const id = `sugg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const suggestion: FactSuggestion = {
    id,
    familyId: input.familyId,
    factType: input.factType,
    subjectPersonId: input.subjectPersonId,
    objectPersonId: input.objectPersonId,
    proposedValue: input.proposedValue,
    confidence: input.confidence,
    status: "pending",
    extractionModel: input.extractionModel,
    createdBy: input.createdBy,
    createdAt: now,
    evidence: input.evidence.map((e) => ({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      suggestionId: id,
      ...e,
      createdAt: now
    }))
  };

  data.suggestions[id] = suggestion;
  saveGraph(data);
  return suggestion;
}

export function listFactSuggestions(
  familyId: string,
  status?: FactSuggestion["status"]
): FactSuggestion[] {
  const data = loadGraph();
  return Object.values(data.suggestions).filter(
    (s) => s.familyId === familyId && (status ? s.status === status : true)
  );
}

/**
 * Reviews and approves or rejects a fact suggestion.
 * If approved, atomic transactions update the confirmed graph (people, relationship, or life event).
 */
export function reviewFactSuggestion(
  suggestionId: string,
  familyId: string,
  review: {
    status: "confirmed" | "rejected" | "disputed";
    reviewedBy: string;
  }
): { success: boolean; suggestion: FactSuggestion; createdEntityId?: string | undefined } {
  const data = loadGraph();
  const suggestion = data.suggestions[suggestionId];
  if (!suggestion || suggestion.familyId !== familyId) {
    throw new Error("Suggestion not found");
  }

  const now = new Date().toISOString();
  suggestion.status = review.status;
  suggestion.reviewedBy = review.reviewedBy;
  suggestion.reviewedAt = now;

  let createdEntityId: string | undefined;

  // When confirmed by a family reviewer, apply to the real graph!
  if (review.status === "confirmed") {
    if (suggestion.factType === "relationship" && suggestion.subjectPersonId && suggestion.objectPersonId) {
      const relType = (suggestion.proposedValue.type as RelationshipType) || "parent";
      const rel = createRelationship({
        familyId,
        fromPersonId: suggestion.subjectPersonId,
        toPersonId: suggestion.objectPersonId,
        type: relType,
        status: "confirmed",
        confidence: suggestion.confidence,
        evidenceText: suggestion.evidence[0]?.excerpt || null,
        reviewedBy: review.reviewedBy,
        reviewedAt: now
      });
      createdEntityId = rel.id;
    } else if (suggestion.factType === "person_identity" && suggestion.proposedValue.name) {
      const person = createPerson({
        familyId,
        displayName: String(suggestion.proposedValue.name),
        aliases: Array.isArray(suggestion.proposedValue.aliases) ? (suggestion.proposedValue.aliases as string[]) : [],
        gender: (suggestion.proposedValue.gender as any) || null,
        birthYear: typeof suggestion.proposedValue.birthYear === "number" ? suggestion.proposedValue.birthYear : null,
        birthPlace: typeof suggestion.proposedValue.birthPlace === "string" ? suggestion.proposedValue.birthPlace : null,
        reviewStatus: "confirmed"
      });
      createdEntityId = person.id;
    } else if (suggestion.factType === "event" && suggestion.subjectPersonId) {
      const evId = `event_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const ev: LifeEvent = {
        id: evId,
        familyId,
        personId: suggestion.subjectPersonId,
        eventType: (suggestion.proposedValue.eventType as any) || "life_event",
        title: String(suggestion.proposedValue.title || "Family Event"),
        description: typeof suggestion.proposedValue.description === "string" ? suggestion.proposedValue.description : null,
        date: typeof suggestion.proposedValue.date === "string" ? suggestion.proposedValue.date : null,
        place: typeof suggestion.proposedValue.place === "string" ? suggestion.proposedValue.place : null,
        evidenceText: suggestion.evidence[0]?.excerpt || null,
        createdAt: now
      };
      data.events[evId] = ev;
      createdEntityId = evId;
    }
  }

  // Audit log
  data.auditLogs.push({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    familyId,
    actorUserId: review.reviewedBy,
    action: `SUGGESTION_${review.status.toUpperCase()}`,
    entityType: "fact_suggestion",
    entityId: suggestionId,
    details: { factType: suggestion.factType, createdEntityId },
    createdAt: now
  });

  saveGraph(data);
  return { success: true, suggestion, createdEntityId };
}

// Person Merge Candidates with Human Approval
export function createMergeCandidate(input: {
  familyId: string;
  personAId: string;
  personBId: string;
  reason: string;
  confidence: number;
}): PersonMergeCandidate {
  const data = loadGraph();
  const id = `merge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const candidate: PersonMergeCandidate = {
    ...input,
    id,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  data.mergeCandidates[id] = candidate;
  saveGraph(data);
  return candidate;
}

export function listMergeCandidates(familyId: string): PersonMergeCandidate[] {
  const data = loadGraph();
  return Object.values(data.mergeCandidates).filter((m) => m.familyId === familyId && m.status === "pending");
}

export function reviewMergeCandidate(
  mergeId: string,
  familyId: string,
  review: {
    status: "accepted" | "rejected";
    reviewedBy: string;
  }
): { success: boolean; mergedPerson?: GraphPerson | undefined } {
  const data = loadGraph();
  const merge = data.mergeCandidates[mergeId];
  if (!merge || merge.familyId !== familyId) throw new Error("Merge candidate not found");

  const now = new Date().toISOString();
  merge.status = review.status;
  merge.reviewedBy = review.reviewedBy;
  merge.reviewedAt = now;

  let mergedPerson: GraphPerson | undefined;

  // If accepted, re-point person B relationships and aliases to person A!
  if (review.status === "accepted") {
    const personA = data.people[merge.personAId];
    const personB = data.people[merge.personBId];
    if (personA && personB) {
      // Combine aliases
      const combinedAliases = Array.from(new Set([...personA.aliases, personB.displayName, ...personB.aliases]));
      personA.aliases = combinedAliases;
      if (!personA.birthYear && personB.birthYear) personA.birthYear = personB.birthYear;
      if (!personA.birthPlace && personB.birthPlace) personA.birthPlace = personB.birthPlace;
      if (!personA.gender && personB.gender) personA.gender = personB.gender;
      if (!personA.bio && personB.bio) personA.bio = personB.bio;
      personA.updatedAt = now;
      mergedPerson = personA;

      // Re-point relationships
      for (const rel of Object.values(data.relationships)) {
        if (rel.fromPersonId === personB.id) rel.fromPersonId = personA.id;
        if (rel.toPersonId === personB.id) rel.toPersonId = personA.id;
      }

      // Re-point life events
      for (const ev of Object.values(data.events)) {
        if (ev.personId === personB.id) ev.personId = personA.id;
      }

      // Delete personB safely
      delete data.people[personB.id];
    }
  }

  saveGraph(data);
  return { success: true, mergedPerson };
}

// Person Timeline and Evidence Aggregators
export function getPersonTimeline(personId: string, familyId: string): LifeEvent[] {
  const data = loadGraph();
  const person = data.people[personId];
  if (!person || person.familyId !== familyId) return [];

  const events: LifeEvent[] = Object.values(data.events).filter(
    (e) => e.personId === personId && e.familyId === familyId
  );

  // Auto-generate birth event if birth details exist
  if (person.birthYear || person.birthDate || person.birthPlace) {
    const birthExists = events.some((e) => e.eventType === "birth");
    if (!birthExists) {
      events.unshift({
        id: `birth_${person.id}`,
        familyId,
        personId,
        eventType: "birth",
        title: "Birth",
        date: person.birthDate || (person.birthYear ? String(person.birthYear) : undefined),
        place: person.birthPlace || undefined,
        createdAt: person.createdAt
      });
    }
  }

  // Sort chronologically
  return events.sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    return dateA.localeCompare(dateB);
  });
}

export function getPersonEvidence(personId: string, familyId: string): FactEvidence[] {
  const data = loadGraph();
  const suggestions = Object.values(data.suggestions).filter(
    (s) => (s.subjectPersonId === personId || s.objectPersonId === personId) && s.familyId === familyId
  );
  return suggestions.flatMap((s) => s.evidence);
}

export function getGraph(familyId: string): {
  people: Record<string, GraphPerson>;
  relationships: Record<string, GraphRelationship>;
  suggestions: Record<string, FactSuggestion>;
  events: Record<string, LifeEvent>;
} {
  const data = loadGraph();
  const people: Record<string, GraphPerson> = {};
  const relationships: Record<string, GraphRelationship> = {};
  const suggestions: Record<string, FactSuggestion> = {};
  const events: Record<string, LifeEvent> = {};

  for (const p of Object.values(data.people)) {
    if (p.familyId === familyId) people[p.id] = p;
  }
  for (const r of Object.values(data.relationships)) {
    if (r.familyId === familyId) relationships[r.id] = r;
  }
  for (const s of Object.values(data.suggestions)) {
    if (s.familyId === familyId) suggestions[s.id] = s;
  }
  for (const e of Object.values(data.events)) {
    if (e.familyId === familyId) events[e.id] = e;
  }

  return { people, relationships, suggestions, events };
}

export function recordLifeEvent(input: {
  familyId: string;
  personId: string;
  eventType: LifeEvent["eventType"];
  title: string;
  description?: string | undefined;
  date?: string | undefined;
  place?: string | undefined;
  isCirca?: boolean | undefined;
}): LifeEvent {
  const data = loadGraph();
  const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const event: LifeEvent = {
    ...input,
    id,
    createdAt: new Date().toISOString()
  };
  data.events[id] = event;
  saveGraph(data);
  return event;
}

export function updateRelationship(
  id: string,
  familyId: string,
  updates: Partial<Omit<GraphRelationship, "id" | "familyId" | "createdAt" | "updatedAt">>
): GraphRelationship | null {
  const data = loadGraph();
  const rel = data.relationships[id];
  if (!rel || rel.familyId !== familyId) return null;
  const updated: GraphRelationship = {
    ...rel,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  data.relationships[id] = updated;
  saveGraph(data);
  return updated;
}
