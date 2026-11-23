import { z } from "zod";
import {
  createPerson,
  createRelationship,
  getGraph,
  getPersonEvidence,
  getPersonTimeline,
  recordLifeEvent,
  updatePerson,
  updateRelationship,
  createMemory,
  updateMemory,
  getMemory,
  listMemories,
  attachPeopleToMemory,
  addPersonFact,
  updatePersonFact,
  searchPersonFacts,
  validateFamilyGraph,
  correctRelationship,
  GraphPerson,
  GraphRelationship,
  GraphMemory,
  FactSuggestion,
  RelationshipType,
  FactType
} from "../graph/graph-store.js";
import { recordRevision } from "../audit/revision-store.js";
import { calculateKinship } from "../genealogy/kinship-engine.js";
import { createInvitation, getFamily } from "../sync/family-store.js";
import { listFamilyActivity } from "../activity/activity-store.js";
import { createShareToken } from "../share/share-store.js";

export interface ToolContext {
  familyId: string;
  userId: string;
  userRole: "owner" | "admin" | "editor" | "viewer";
  userInstruction?: string | undefined;
  idempotencyKey?: string | undefined;
  recentlyCreatedPersonId?: string | undefined;
}

export interface AgentToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  riskLevel: "low" | "moderate";
  schema: z.ZodSchema<TInput>;
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// 1. PEOPLE TOOLS
// ---------------------------------------------------------------------------

export const searchPeopleTool: AgentToolDefinition = {
  name: "search_people",
  description: "Search for family members by name, alias, birth place, or notes.",
  riskLevel: "low",
  schema: z.object({
    query: z.string().min(1).describe("Search string (name, nickname, or place)")
  }),
  execute: async ({ query }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const people = Object.values(graph.people) as GraphPerson[];
    const q = query.toLowerCase().trim();
    const matches = people.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q)) ||
        (p.birthPlace && p.birthPlace.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    );
    return {
      totalMatches: matches.length,
      people: matches.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        aliases: p.aliases,
        gender: p.gender,
        birthYear: p.birthYear,
        birthPlace: p.birthPlace,
        notes: p.notes,
        reviewStatus: p.reviewStatus
      }))
    };
  }
};

export const getPersonDetailsTool: AgentToolDefinition = {
  name: "get_person_details",
  description: "Get full profile, immediate kin, life events, and kinship to the user for a person.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Unique person ID")
  }),
  execute: async ({ personId }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const person = graph.people[personId];
    if (!person) {
      return { found: false, message: `Person with ID "${personId}" does not exist in this family.` };
    }

    const timeline = getPersonTimeline(personId, ctx.familyId);
    const evidence = getPersonEvidence(personId, ctx.familyId);
    const kinship = calculateKinship(ctx.userId, personId, graph.people, graph.relationships);

    return {
      found: true,
      person,
      kinshipToUser: kinship,
      timeline,
      evidenceCount: evidence.length
    };
  }
};

export const createPersonTool: AgentToolDefinition = {
  name: "create_person",
  description: "Add a new relative or ancestor to the family archive.",
  riskLevel: "low",
  schema: z.object({
    displayName: z.string().optional().describe("Full name of the family member"),
    name: z.string().optional().describe("Alternative field for full name"),
    gender: z.union([z.enum(["male", "female", "other"]), z.string()]).optional().describe("Gender if known"),
    birthYear: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional().describe("Year of birth if known"),
    birthPlace: z.string().optional().describe("Place or hometown of birth"),
    birthplace: z.string().optional().describe("Place or hometown of birth"),
    place: z.string().optional().describe("Place or hometown of birth"),
    bio: z.string().optional().describe("Biographical notes, stories, occupation"),
    notes: z.string().optional().describe("Biographical notes, stories, occupation"),
    aliases: z.array(z.string()).optional().describe("Alternative names, pet names, or nicknames")
  }).transform((val) => {
    const displayName = (val.displayName || val.name || "").trim();
    let gender: "male" | "female" | "other" | undefined = undefined;
    if (val.gender) {
      const g = val.gender.toLowerCase().trim();
      if (g === "male" || g === "m") gender = "male";
      else if (g === "female" || g === "f") gender = "female";
      else gender = "other";
    }
    return {
      displayName,
      gender,
      birthYear: typeof val.birthYear === "number" && !isNaN(val.birthYear) ? val.birthYear : undefined,
      birthPlace: (val.birthPlace || val.birthplace || val.place || "").trim() || undefined,
      bio: (val.bio || val.notes || "").trim() || undefined,
      aliases: val.aliases || []
    };
  }).refine((val) => val.displayName.length > 0, {
    message: "A non-empty name or displayName is required to create a person."
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    const people = Object.values(graph.people) as GraphPerson[];
    // Duplicate check
    const existing = people.find(
      (p) => p.displayName.toLowerCase().trim() === input.displayName.toLowerCase().trim()
    );
    if (existing) {
      return {
        created: false,
        existingId: existing.id,
        message: `A family member named "${existing.displayName}" already exists (ID: ${existing.id}).`
      };
    }

    const newPerson = createPerson({
      familyId: ctx.familyId,
      displayName: input.displayName.trim(),
      aliases: input.aliases || [],
      gender: input.gender,
      birthYear: input.birthYear,
      birthPlace: input.birthPlace?.trim(),
      bio: input.bio?.trim(),
      reviewStatus: "confirmed",
      createdBy: ctx.userId
    });

    recordRevision({
      familyId: ctx.familyId,
      actorId: ctx.userId,
      actorType: "agent",
      targetEntity: "person",
      entityId: newPerson.id,
      operation: "create",
      previousValue: null,
      newValue: newPerson as unknown as Record<string, unknown>,
      userInstruction: ctx.userInstruction,
      idempotencyKey: ctx.idempotencyKey
    });

    return {
      created: true,
      person: newPerson,
      message: `Added ${newPerson.displayName} to your family tree.`
    };
  }
};

export const updatePersonTool: AgentToolDefinition = {
  name: "update_person",
  description: "Update a family member's details (birth year, birthplace, notes, bio, or name correction).",
  riskLevel: "moderate",
  schema: z.object({
    personId: z.string().optional().describe("ID of the person to update"),
    id: z.string().optional().describe("Alternative for personId"),
    displayName: z.string().optional().describe("Corrected full name"),
    name: z.string().optional().describe("Alternative for displayName"),
    gender: z.union([z.enum(["male", "female", "other"]), z.string()]).optional(),
    birthYear: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
    birthPlace: z.string().optional(),
    birthplace: z.string().optional(),
    place: z.string().optional(),
    bio: z.string().optional(),
    notes: z.string().optional()
  }).transform((val) => {
    let gender: "male" | "female" | "other" | undefined = undefined;
    if (val.gender) {
      const g = val.gender.toLowerCase().trim();
      if (g === "male" || g === "m") gender = "male";
      else if (g === "female" || g === "f") gender = "female";
      else gender = "other";
    }
    return {
      personId: (val.personId || val.id || "").trim(),
      displayName: (val.displayName || val.name || "").trim() || undefined,
      gender,
      birthYear: typeof val.birthYear === "number" && !isNaN(val.birthYear) ? val.birthYear : undefined,
      birthPlace: (val.birthPlace || val.birthplace || val.place || "").trim() || undefined,
      bio: (val.bio || val.notes || "").trim() || undefined,
      notes: (val.notes || "").trim() || undefined
    };
  }).refine((val) => val.personId.length > 0, {
    message: "personId or id is required to update a person."
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    const prev = graph.people[input.personId];
    if (!prev) {
      return { success: false, message: `Person "${input.personId}" not found.` };
    }

    const previousSnapshot = { ...prev };
    const updated = updatePerson(input.personId, ctx.familyId, {
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
      ...(input.birthPlace !== undefined ? { birthPlace: input.birthPlace.trim() } : {}),
      ...(input.bio !== undefined ? { bio: input.bio.trim() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() } : {})
    });

    if (!updated) {
      return { success: false, message: "Update operation could not be saved." };
    }

    recordRevision({
      familyId: ctx.familyId,
      actorId: ctx.userId,
      actorType: "agent",
      targetEntity: "person",
      entityId: input.personId,
      operation: "update",
      previousValue: previousSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
      userInstruction: ctx.userInstruction,
      idempotencyKey: ctx.idempotencyKey
    });

    return {
      success: true,
      person: updated,
      message: `Updated profile details for ${updated.displayName}.`
    };
  }
};

export const addPersonAliasTool: AgentToolDefinition = {
  name: "add_person_alias",
  description: "Add a nickname, maiden name, or alternative spelling for a relative.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().optional().describe("Person ID or Name"),
    id: z.string().optional().describe("Alternative for personId"),
    alias: z.string().optional().describe("Nickname or alternate name"),
    nickname: z.string().optional().describe("Alternative for alias"),
    name: z.string().optional().describe("Alternative for alias")
  }).transform((val) => ({
    personId: (val.personId || val.id || "").trim(),
    alias: (val.alias || val.nickname || val.name || "").trim()
  })).refine((val) => val.personId.length > 0 && val.alias.length > 0, {
    message: "Both personId and alias are required."
  }),
  execute: async ({ personId, alias }, ctx) => {
    const graph = getGraph(ctx.familyId);
    let person = graph.people[personId];
    if (!person) {
      // Lookup by name
      const lower = personId.toLowerCase();
      person = Object.values(graph.people).find(
        (p) => p.displayName.toLowerCase().trim() === lower || p.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
    }
    if (!person) return { success: false, message: `Person "${personId}" not found.` };

    const cleanAlias = alias.trim();
    if (!person.aliases.includes(cleanAlias)) {
      const prev = { ...person };
      person.aliases.push(cleanAlias);
      person.updatedAt = new Date().toISOString();
      updatePerson(personId, ctx.familyId, { aliases: person.aliases });

      recordRevision({
        familyId: ctx.familyId,
        actorId: ctx.userId,
        actorType: "agent",
        targetEntity: "person",
        entityId: personId,
        operation: "update",
        previousValue: prev as unknown as Record<string, unknown>,
        newValue: person as unknown as Record<string, unknown>,
        userInstruction: ctx.userInstruction
      });
    }

    return { success: true, aliases: person.aliases, message: `Added alias "${cleanAlias}" to ${person.displayName}.` };
  }
};

// ---------------------------------------------------------------------------
// 2. RELATIONSHIPS TOOLS
// ---------------------------------------------------------------------------

export const createRelationshipTool: AgentToolDefinition = {
  name: "create_relationship",
  description: "Connect two family members with a relationship edge (parent, child, spouse, sibling, etc.).",
  riskLevel: "low",
  schema: z.object({
    fromPersonId: z.string().optional().describe("Parent / Partner / Sibling ID or Name"),
    personA: z.string().optional().describe("Alternative for fromPersonId"),
    from: z.string().optional().describe("Alternative for fromPersonId"),
    parent: z.string().optional().describe("Alternative for fromPersonId"),
    toPersonId: z.string().optional().describe("Child / Partner / Sibling ID or Name"),
    personB: z.string().optional().describe("Alternative for toPersonId"),
    to: z.string().optional().describe("Alternative for toPersonId"),
    child: z.string().optional().describe("Alternative for toPersonId"),
    type: z.string().optional().describe("Standard relationship type"),
    relation: z.string().optional().describe("Alternative for type"),
    relationship: z.string().optional().describe("Alternative for type"),
    evidenceText: z.string().optional().describe("Why this relationship is true"),
    evidence: z.string().optional().describe("Alternative for evidenceText")
  }).transform((val) => {
    return {
      fromPersonId: (val.fromPersonId || val.personA || val.from || val.parent || "").trim(),
      toPersonId: (val.toPersonId || val.personB || val.to || val.child || "").trim(),
      type: (val.type || val.relation || val.relationship || "parent").toLowerCase().trim() as any,
      evidenceText: val.evidenceText || val.evidence || "Stated by user in conversation"
    };
  }).refine((val) => val.fromPersonId.length > 0 && val.toPersonId.length > 0, {
    message: "Both fromPersonId and toPersonId are required to create a relationship."
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);

    // Helper to resolve an ID or Person Name
    const resolvePerson = (idOrName: string): GraphPerson | undefined => {
      if (ctx.recentlyCreatedPersonId && (idOrName.toLowerCase().includes("placeholder") || idOrName.toLowerCase().includes("new_person"))) {
        if (graph.people[ctx.recentlyCreatedPersonId]) return graph.people[ctx.recentlyCreatedPersonId];
      }

      if (graph.people[idOrName]) return graph.people[idOrName];
      const lower = idOrName.toLowerCase().trim();
      if (lower === "me" || lower === "myself" || lower === "user" || lower === "user_default" || lower === ctx.userId.toLowerCase()) {
        if (graph.people[ctx.userId]) return graph.people[ctx.userId];
        const userPerson = Object.values(graph.people).find((p) => p.displayName.toLowerCase() === "me" || p.id === ctx.userId);
        if (userPerson) return userPerson;

        // Auto-create user person node in the graph so root connection is solid
        const newUserNode = createPerson({
          familyId: ctx.familyId,
          displayName: "Me (You)",
          aliases: ["Me", "Myself", ctx.userId],
          reviewStatus: "confirmed",
          createdBy: ctx.userId
        });
        graph.people[newUserNode.id] = newUserNode;
        return newUserNode;
      }
      return Object.values(graph.people).find(
        (p) => p.displayName.toLowerCase().trim() === lower || p.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
    };

    const pA = resolvePerson(input.fromPersonId);
    const pB = resolvePerson(input.toPersonId);

    if (!pA || !pB) {
      return {
        created: false,
        message: `Could not identify one or both relatives ("${input.fromPersonId}", "${input.toPersonId}") in this family.`
      };
    }
    if (pA.id === pB.id) {
      return { created: false, message: "Cannot connect a person to themselves." };
    }

    // Normalize type
    let validRelType: any = "parent";
    const rawType = input.type.toLowerCase();
    if (rawType.includes("child") || rawType.includes("son") || rawType.includes("daughter")) validRelType = "child";
    else if (rawType.includes("spouse") || rawType.includes("wife") || rawType.includes("husband") || rawType.includes("married")) validRelType = "spouse";
    else if (rawType.includes("sibling") || rawType.includes("brother") || rawType.includes("sister")) validRelType = "sibling";
    else if (rawType.includes("step_parent") || rawType.includes("step-parent")) validRelType = "step_parent";
    else if (rawType.includes("step_child") || rawType.includes("step-child")) validRelType = "step_child";
    else if (rawType.includes("partner")) validRelType = "partner";
    else validRelType = "parent";

    const relationships = Object.values(graph.relationships) as GraphRelationship[];
    // Check if relationship edge already exists
    const existing = relationships.find(
      (r) =>
        (r.fromPersonId === pA.id && r.toPersonId === pB.id && r.type === validRelType) ||
        (r.fromPersonId === pB.id && r.toPersonId === pA.id && r.type === validRelType)
    );
    if (existing) {
      return { created: false, message: `Relationship already exists between ${pA.displayName} and ${pB.displayName}.` };
    }

    const rel = createRelationship({
      familyId: ctx.familyId,
      fromPersonId: pA.id,
      toPersonId: pB.id,
      type: validRelType,
      status: "confirmed",
      evidenceText: input.evidenceText || "Stated by user in conversation",
      reviewedBy: ctx.userId
    });

    recordRevision({
      familyId: ctx.familyId,
      actorId: ctx.userId,
      actorType: "agent",
      targetEntity: "relationship",
      entityId: rel.id,
      operation: "create",
      previousValue: null,
      newValue: rel as unknown as Record<string, unknown>,
      userInstruction: ctx.userInstruction,
      idempotencyKey: ctx.idempotencyKey
    });

    return {
      created: true,
      relationship: rel,
      message: `Connected ${pA.displayName} as ${validRelType} to ${pB.displayName}.`
    };
  }
};

export const getRelationshipPathTool: AgentToolDefinition = {
  name: "get_relationship_path",
  description: "Calculate how two family members are related to each other or to the user.",
  riskLevel: "low",
  schema: z.object({
    personAId: z.string().describe("First person ID (defaults to current user if omitted)").optional(),
    personBId: z.string().describe("Second person ID to calculate relationship for")
  }),
  execute: async ({ personAId, personBId }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const refId = personAId || ctx.userId;
    const kinship = calculateKinship(refId, personBId, graph.people, graph.relationships);
    return kinship;
  }
};

export const getAncestorsTool: AgentToolDefinition = {
  name: "get_ancestors",
  description: "Retrieve all parents, grandparents, and ancestors for a relative.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Person ID")
  }),
  execute: async ({ personId }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const target = graph.people[personId];
    if (!target) return { found: false, message: "Person not found." };

    const ancestors: GraphPerson[] = [];
    const queue = [personId];
    const visited = new Set<string>([personId]);
    const relationships = Object.values(graph.relationships) as GraphRelationship[];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      // Find parents (where fromPersonId is parent of curr)
      for (const rel of relationships) {
        if (rel.toPersonId === curr && (rel.type === "parent" || rel.type === "adoptive_parent" || rel.type === "step_parent")) {
          const parent = graph.people[rel.fromPersonId];
          if (parent && !visited.has(parent.id)) {
            visited.add(parent.id);
            ancestors.push(parent);
            queue.push(parent.id);
          }
        }
      }
    }

    return {
      person: target.displayName,
      totalAncestors: ancestors.length,
      ancestors: ancestors.map((a) => ({ id: a.id, name: a.displayName, birthYear: a.birthYear, gender: a.gender }))
    };
  }
};

export const getDescendantsTool: AgentToolDefinition = {
  name: "get_descendants",
  description: "Retrieve all children, grandchildren, and descendants of a family member.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Person ID")
  }),
  execute: async ({ personId }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const target = graph.people[personId];
    if (!target) return { found: false, message: "Person not found." };

    const descendants: GraphPerson[] = [];
    const queue = [personId];
    const visited = new Set<string>([personId]);
    const relationships = Object.values(graph.relationships) as GraphRelationship[];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      // Find children (where fromPersonId is curr)
      for (const rel of relationships) {
        if (rel.fromPersonId === curr && (rel.type === "parent" || rel.type === "adoptive_parent")) {
          const child = graph.people[rel.toPersonId];
          if (child && !visited.has(child.id)) {
            visited.add(child.id);
            descendants.push(child);
            queue.push(child.id);
          }
        }
      }
    }

    return {
      person: target.displayName,
      totalDescendants: descendants.length,
      descendants: descendants.map((d) => ({ id: d.id, name: d.displayName, birthYear: d.birthYear, gender: d.gender }))
    };
  }
};

// ---------------------------------------------------------------------------
// 3. TREE PREFERENCES & ORIENTATION
// ---------------------------------------------------------------------------

export const changeTreeOrientationTool: AgentToolDefinition = {
  name: "change_tree_orientation",
  description: "Change the visual display orientation of the family tree.",
  riskLevel: "low",
  schema: z.object({
    orientation: z.enum(["top_to_bottom", "bottom_to_top", "left_to_right", "right_to_left"]).describe("New orientation layout")
  }),
  execute: async ({ orientation }) => {
    return {
      success: true,
      orientation,
      message: `Family tree orientation switched to ${orientation.replace(/_/g, " ")}.`
    };
  }
};

// ---------------------------------------------------------------------------
// 4. TIMELINE & LIFE EVENTS TOOLS
// ---------------------------------------------------------------------------

export const createLifeEventTool: AgentToolDefinition = {
  name: "create_event",
  description: "Record a life milestone for a relative (birth, marriage, graduation, migration, career, recipe).",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Person ID"),
    eventType: z.enum(["birth", "marriage", "migration", "education", "career", "tradition", "life_event"]),
    title: z.string().min(1).describe("Event title"),
    description: z.string().optional().describe("Story or context"),
    date: z.string().optional().describe("Year or date string"),
    place: z.string().optional().describe("Location of milestone")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    const person = graph.people[input.personId];
    if (!person) return { success: false, message: "Person not found." };

    const event = recordLifeEvent({
      familyId: ctx.familyId,
      personId: input.personId,
      eventType: input.eventType,
      title: input.title.trim(),
      description: input.description?.trim(),
      date: input.date?.trim(),
      place: input.place?.trim()
    });

    recordRevision({
      familyId: ctx.familyId,
      actorId: ctx.userId,
      actorType: "agent",
      targetEntity: "life_event",
      entityId: event.id,
      operation: "create",
      previousValue: null,
      newValue: event as unknown as Record<string, unknown>,
      userInstruction: ctx.userInstruction
    });

    return {
      success: true,
      event,
      message: `Recorded "${input.title}" on ${person.displayName}'s timeline.`
    };
  }
};

export const retrievePersonTimelineTool: AgentToolDefinition = {
  name: "retrieve_person_timeline",
  description: "Get all chronological life events and milestones for a relative.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Person ID")
  }),
  execute: async ({ personId }, ctx) => {
    const timeline = getPersonTimeline(personId, ctx.familyId);
    return { events: timeline };
  }
};

// ---------------------------------------------------------------------------
// 5. COLLABORATION & SHARING TOOLS
// ---------------------------------------------------------------------------

export const inviteRelativeTool: AgentToolDefinition = {
  name: "invite_relative",
  description: "Generate a secure invitation link or email invitation for a relative to join the family archive.",
  riskLevel: "low",
  schema: z.object({
    recipientEmail: z.string().optional().describe("Relative's email address if known"),
    role: z.enum(["admin", "contributor", "reviewer", "viewer"]).optional().describe("Role to assign")
  }),
  execute: async (input, ctx) => {
    const res = createInvitation({
      familyId: ctx.familyId,
      inviterId: ctx.userId,
      recipientEmail: input.recipientEmail || null,
      role: input.role || "contributor"
    });

    if (res.error || !res.invitation) {
      return { success: false, message: res.error || "Could not generate invitation." };
    }

    const shareUrl = `https://yesterday.heritage/join?token=${res.invitation.token}`;
    return {
      success: true,
      invitation: res.invitation,
      shareUrl,
      message: `Created an invitation for ${input.recipientEmail || "your relative"} with role "${res.invitation.role}". Share link: ${shareUrl}`
    };
  }
};

export const getFamilyActivityTool: AgentToolDefinition = {
  name: "get_family_activity",
  description: "Retrieve recent family activities, contributions, newly added stories, and milestones.",
  riskLevel: "low",
  schema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe("Number of activity events to fetch")
  }),
  execute: async (input, ctx) => {
    const activities = listFamilyActivity(ctx.familyId, input.limit || 15);
    return {
      success: true,
      count: activities.length,
      activities: activities.map((a) => ({
        actor: a.actorName,
        action: a.actionType,
        title: a.entityTitle,
        time: a.timestamp
      }))
    };
  }
};

export const shareMemoryTool: AgentToolDefinition = {
  name: "share_memory",
  description: "Generate a secure, shareable link for a story, person profile, or the entire family tree.",
  riskLevel: "low",
  schema: z.object({
    entityType: z.enum(["story", "person", "tree", "timeline", "recipe"]).describe("What to share"),
    entityId: z.string().optional().describe("Story ID or Person ID (optional for tree)"),
    title: z.string().optional().describe("Title for the shared link")
  }),
  execute: async (input, ctx) => {
    const family = getFamily(ctx.familyId);
    const title = input.title || (input.entityType === "tree" ? `${family?.name || "Family"} Tree` : "Family Memory");
    const share = createShareToken({
      familyId: ctx.familyId,
      createdById: ctx.userId,
      createdByName: "Family Historian Agent",
      entityType: input.entityType,
      entityId: input.entityId,
      title
    });

    const shareUrl = `https://yesterday.heritage/share/${share.token}`;
    return {
      success: true,
      shareToken: share.token,
      shareUrl,
      message: `Generated secure share link for ${input.entityType}: ${shareUrl}`
    };
  }
};

export const listContributorMemoriesTool: AgentToolDefinition = {
  name: "list_contributor_memories",
  description: "Find memories and stories saved or contributed by a specific relative.",
  riskLevel: "low",
  schema: z.object({
    contributorName: z.string().min(1).describe("Name of the relative who contributed")
  }),
  execute: async ({ contributorName }, ctx) => {
    const family = getFamily(ctx.familyId);
    if (!family) return { success: false, memories: [] };

    const q = contributorName.toLowerCase().trim();
    const matches = family.stories.filter(
      (s) => s.authorName && s.authorName.toLowerCase().includes(q)
    );

    return {
      success: true,
      contributor: contributorName,
      count: matches.length,
      stories: matches.map((m) => ({ id: m.id, title: m.title, createdAt: m.createdAt }))
    };
  }
};

// ---------------------------------------------------------------------------
// 6. RELATIONSHIPS ENHANCED TOOLS
// ---------------------------------------------------------------------------

export const getRelationshipsTool: AgentToolDefinition = {
  name: "get_relationships",
  description: "Retrieve family relationships, optionally filtered by person ID or name.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().optional().describe("Filter relationships involving this person ID or name")
  }),
  execute: async ({ personId }, ctx) => {
    const graph = getGraph(ctx.familyId);
    const rels = Object.values(graph.relationships) as GraphRelationship[];
    let filtered = rels;

    if (personId) {
      const pLower = personId.toLowerCase().trim();
      // Match by ID or Name
      const targetPerson = Object.values(graph.people).find(
        (p) => p.id === personId || p.displayName.toLowerCase() === pLower || p.aliases.some((a) => a.toLowerCase() === pLower)
      );
      const targetId = targetPerson ? targetPerson.id : personId;
      filtered = rels.filter((r) => r.fromPersonId === targetId || r.toPersonId === targetId);
    }

    return {
      total: filtered.length,
      relationships: filtered.map((r) => ({
        id: r.id,
        fromPersonId: r.fromPersonId,
        fromName: graph.people[r.fromPersonId]?.displayName || r.fromPersonId,
        toPersonId: r.toPersonId,
        toName: graph.people[r.toPersonId]?.displayName || r.toPersonId,
        type: r.type,
        status: r.status,
        evidenceText: r.evidenceText
      }))
    };
  }
};

export const updateRelationshipTool: AgentToolDefinition = {
  name: "update_relationship",
  description: "Update details or status of an existing relationship edge.",
  riskLevel: "moderate",
  schema: z.object({
    relationshipId: z.string().describe("ID of the relationship to update"),
    type: z.string().optional().describe("Corrected relationship type"),
    status: z.enum(["suggested", "confirmed", "disputed"]).optional(),
    evidenceText: z.string().optional().describe("Updated evidence context")
  }),
  execute: async (input, ctx) => {
    const updated = updateRelationship(input.relationshipId, ctx.familyId, {
      ...(input.type ? { type: input.type as RelationshipType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.evidenceText ? { evidenceText: input.evidenceText } : {})
    });

    if (!updated) {
      return { success: false, message: `Relationship "${input.relationshipId}" not found.` };
    }

    return { success: true, relationship: updated, message: `Updated relationship ${updated.id}.` };
  }
};

export const correctRelationshipTool: AgentToolDefinition = {
  name: "correct_relationship",
  description: "Correct an inaccurate relationship between two relatives (e.g. 'Mahesh is my grandfather\\'s brother, not my grandfather'), ensuring no impossible cycle is created.",
  riskLevel: "moderate",
  schema: z.object({
    personA: z.string().describe("First person's ID or full name"),
    personB: z.string().describe("Second person's ID or full name"),
    newRelation: z.string().describe("Corrected relationship type (parent, child, spouse, sibling, uncle, aunt, etc.)"),
    evidenceText: z.string().optional().describe("Reason or conversation excerpt for this correction")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);

    const resolvePerson = (idOrName: string): GraphPerson | undefined => {
      if (graph.people[idOrName]) return graph.people[idOrName];
      const lower = idOrName.toLowerCase().trim();
      if (lower === "me" || lower === "myself" || lower === "user" || lower === ctx.userId.toLowerCase()) {
        return graph.people[ctx.userId] || Object.values(graph.people).find((p) => p.displayName.toLowerCase() === "me");
      }
      return Object.values(graph.people).find(
        (p) => p.displayName.toLowerCase().trim() === lower || p.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
    };

    const pA = resolvePerson(input.personA);
    const pB = resolvePerson(input.personB);

    if (!pA || !pB) {
      return {
        success: false,
        message: `Could not identify relative "${!pA ? input.personA : input.personB}" in the family.`
      };
    }

    let relType: RelationshipType = "parent";
    const lowerType = input.newRelation.toLowerCase();
    if (lowerType.includes("child") || lowerType.includes("son") || lowerType.includes("daughter")) relType = "child";
    else if (lowerType.includes("spouse") || lowerType.includes("wife") || lowerType.includes("husband") || lowerType.includes("married")) relType = "spouse";
    else if (lowerType.includes("sibling") || lowerType.includes("brother") || lowerType.includes("sister")) relType = "sibling";
    else if (lowerType.includes("uncle") || lowerType.includes("chacha") || lowerType.includes("mama")) relType = "uncle";
    else if (lowerType.includes("aunt") || lowerType.includes("chachi") || lowerType.includes("mami") || lowerType.includes("bua")) relType = "aunt";
    else if (lowerType.includes("grandparent") || lowerType.includes("dada") || lowerType.includes("nana")) relType = "grandparent";
    else if (lowerType.includes("parent") || lowerType.includes("father") || lowerType.includes("mother")) relType = "parent";
    else relType = "other";

    const result = correctRelationship({
      familyId: ctx.familyId,
      personAId: pA.id,
      personBId: pB.id,
      newRelation: relType,
      evidenceText: input.evidenceText,
      actorId: ctx.userId
    });

    return result;
  }
};

export const validateFamilyGraphTool: AgentToolDefinition = {
  name: "validate_family_graph",
  description: "Inspect the family tree for structural errors, circular parent-child ancestry, self-links, or contradictions.",
  riskLevel: "low",
  schema: z.object({}),
  execute: async (_, ctx) => {
    const validation = validateFamilyGraph(ctx.familyId);
    return {
      valid: validation.valid,
      summary: validation.valid
        ? "Family tree graph is mathematically consistent with no cycles or self-references."
        : `Found ${validation.errors.length} integrity issue(s): ${validation.errors.join("; ")}`,
      cycleFound: validation.cycleFound,
      selfLinks: validation.selfLinks,
      contradictions: validation.contradictions,
      errors: validation.errors
    };
  }
};

// ---------------------------------------------------------------------------
// 7. MEMORIES & STORIES TOOLS (PRESERVING UNSTRUCTURED NARRATIVES)
// ---------------------------------------------------------------------------

export const createMemoryTool: AgentToolDefinition = {
  name: "create_memory",
  description: "Save a family narrative, memory, cultural tradition, or childhood story verbatim, separate from individual facts.",
  riskLevel: "low",
  schema: z.object({
    title: z.string().describe("Descriptive title for the memory or story"),
    narrative: z.string().describe("Full original story or narrative told by the user"),
    peopleInvolved: z.array(z.string()).optional().describe("Names or IDs of family members in this story"),
    approximateDate: z.string().optional().describe("Estimated date or decade (e.g. '1970s', 'Diwali 1985')"),
    location: z.string().optional().describe("Location where the event happened"),
    traditions: z.array(z.string()).optional().describe("Traditions, recipes, or cultural customs mentioned"),
    mediaUrls: z.array(z.string()).optional().describe("Associated photograph or audio URLs")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    const resolvedPeople: string[] = [];

    if (input.peopleInvolved && Array.isArray(input.peopleInvolved)) {
      for (const p of input.peopleInvolved) {
        if (graph.people[p]) {
          resolvedPeople.push(p);
        } else {
          const lower = p.toLowerCase().trim();
          const found = Object.values(graph.people).find(
            (item) => item.displayName.toLowerCase().trim() === lower || item.aliases.some((a) => a.toLowerCase().trim() === lower)
          );
          if (found) resolvedPeople.push(found.id);
          else resolvedPeople.push(p);
        }
      }
    }

    const memory = createMemory({
      familyId: ctx.familyId,
      title: input.title.trim(),
      narrative: input.narrative.trim(),
      peopleInvolved: resolvedPeople,
      approximateDate: input.approximateDate?.trim(),
      location: input.location?.trim(),
      traditions: input.traditions || [],
      mediaUrls: input.mediaUrls || [],
      sourceType: "conversation",
      createdBy: ctx.userId
    });

    return {
      success: true,
      memory,
      message: `Preserved family story: "${memory.title}".`
    };
  }
};

export const updateMemoryTool: AgentToolDefinition = {
  name: "update_memory",
  description: "Update an existing family memory's narrative, title, location, or date.",
  riskLevel: "low",
  schema: z.object({
    memoryId: z.string().describe("ID of the memory to update"),
    title: z.string().optional(),
    narrative: z.string().optional(),
    approximateDate: z.string().optional(),
    location: z.string().optional(),
    traditions: z.array(z.string()).optional()
  }),
  execute: async (input, ctx) => {
    const updated = updateMemory(input.memoryId, ctx.familyId, {
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.narrative ? { narrative: input.narrative.trim() } : {}),
      ...(input.approximateDate ? { approximateDate: input.approximateDate.trim() } : {}),
      ...(input.location ? { location: input.location.trim() } : {}),
      ...(input.traditions ? { traditions: input.traditions } : {})
    });

    if (!updated) {
      return { success: false, message: `Memory "${input.memoryId}" not found.` };
    }

    return { success: true, memory: updated, message: `Updated story: "${updated.title}".` };
  }
};

export const attachPeopleToMemoryTool: AgentToolDefinition = {
  name: "attach_people_to_memory",
  description: "Link family members to a previously saved memory or story.",
  riskLevel: "low",
  schema: z.object({
    memoryId: z.string().describe("ID of the memory"),
    people: z.array(z.string()).describe("Names or IDs of family members to associate")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    const resolvedIds: string[] = [];

    for (const p of input.people) {
      if (graph.people[p]) {
        resolvedIds.push(p);
      } else {
        const lower = p.toLowerCase().trim();
        const found = Object.values(graph.people).find(
          (item) => item.displayName.toLowerCase().trim() === lower || item.aliases.some((a) => a.toLowerCase().trim() === lower)
        );
        if (found) resolvedIds.push(found.id);
        else resolvedIds.push(p);
      }
    }

    const updated = attachPeopleToMemory(input.memoryId, resolvedIds, ctx.familyId);
    if (!updated) {
      return { success: false, message: `Memory "${input.memoryId}" not found.` };
    }

    return {
      success: true,
      memory: updated,
      message: `Attached ${resolvedIds.length} person(s) to "${updated.title}".`
    };
  }
};

export const searchMemoriesTool: AgentToolDefinition = {
  name: "search_memories",
  description: "Search saved family stories and memories by keyword, location, tradition, or person.",
  riskLevel: "low",
  schema: z.object({
    query: z.string().optional().describe("Search keywords in title, story narrative, or location"),
    personId: z.string().optional().describe("Filter memories involving this person ID or name"),
    limit: z.number().optional().describe("Max memories to return")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    let resolvedPersonId = input.personId;
    if (input.personId && !graph.people[input.personId]) {
      const lower = input.personId.toLowerCase().trim();
      const found = Object.values(graph.people).find(
        (p) => p.displayName.toLowerCase().trim() === lower || p.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
      if (found) resolvedPersonId = found.id;
    }

    const results = listMemories(ctx.familyId, {
      query: input.query,
      personId: resolvedPersonId,
      limit: input.limit || 20
    });

    return {
      total: results.length,
      memories: results.map((m) => ({
        id: m.id,
        title: m.title,
        approximateDate: m.approximateDate,
        location: m.location,
        peopleInvolved: m.peopleInvolved.map((pid) => graph.people[pid]?.displayName || pid),
        traditions: m.traditions,
        excerpt: m.narrative.length > 200 ? m.narrative.slice(0, 200) + "..." : m.narrative
      }))
    };
  }
};

export const retrieveMemoryDetailsTool: AgentToolDefinition = {
  name: "retrieve_memory_details",
  description: "Fetch the full narrative and linked relatives for a specific family memory.",
  riskLevel: "low",
  schema: z.object({
    memoryId: z.string().describe("ID of the memory")
  }),
  execute: async ({ memoryId }, ctx) => {
    const memory = getMemory(memoryId, ctx.familyId);
    if (!memory) {
      return { found: false, message: `Memory "${memoryId}" not found.` };
    }

    const graph = getGraph(ctx.familyId);
    return {
      found: true,
      memory: {
        ...memory,
        peopleNames: memory.peopleInvolved.map((pid) => graph.people[pid]?.displayName || pid)
      }
    };
  }
};

// ---------------------------------------------------------------------------
// 8. FACTS TOOLS (STRUCTURED BIOGRAPHICAL EVIDENCE)
// ---------------------------------------------------------------------------

export const addPersonFactTool: AgentToolDefinition = {
  name: "add_person_fact",
  description: "Record a verified biographical fact (e.g. occupation, birthplace, education, religion, military service) for a relative.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().describe("Person ID or full name"),
    factType: z.enum(["person_identity", "relationship", "date", "place", "event", "alias", "bio", "recipe", "tradition", "other"]).default("bio"),
    fieldName: z.string().describe("Attribute name (e.g. 'occupation', 'birthPlace', 'education')"),
    fieldValue: z.any().describe("Value of the fact"),
    evidenceText: z.string().optional().describe("Verbatim quote or excerpt establishing this fact"),
    confidence: z.number().min(0).max(1).optional().default(0.95)
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    let person = graph.people[input.personId];
    if (!person) {
      const lower = input.personId.toLowerCase().trim();
      person = Object.values(graph.people).find(
        (p) => p.displayName.toLowerCase().trim() === lower || p.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
    }
    if (!person) {
      return { success: false, message: `Person "${input.personId}" not found.` };
    }

    const fact = addPersonFact({
      familyId: ctx.familyId,
      personId: person.id,
      factType: input.factType as FactType,
      value: { [input.fieldName]: input.fieldValue },
      confidence: input.confidence,
      evidenceText: input.evidenceText || `Stated during conversation`,
      createdBy: ctx.userId
    });

    return {
      success: true,
      factId: fact.id,
      personName: person.displayName,
      message: `Recorded fact: ${input.fieldName} = "${input.fieldValue}" for ${person.displayName}.`
    };
  }
};

export const updatePersonFactTool: AgentToolDefinition = {
  name: "update_person_fact",
  description: "Update or confirm a person's recorded biographical fact.",
  riskLevel: "moderate",
  schema: z.object({
    factId: z.string().describe("ID of the fact to update"),
    value: z.record(z.any()).optional().describe("Updated fact fields"),
    status: z.enum(["pending", "confirmed", "rejected", "disputed"]).optional()
  }),
  execute: async (input, ctx) => {
    const updated = updatePersonFact(input.factId, ctx.familyId, {
      value: input.value,
      status: input.status,
      reviewedBy: ctx.userId
    });

    if (!updated) {
      return { success: false, message: `Fact "${input.factId}" not found.` };
    }

    return { success: true, fact: updated, message: `Updated fact "${input.factId}".` };
  }
};

export const searchPersonFactsTool: AgentToolDefinition = {
  name: "search_person_facts",
  description: "Search for specific facts recorded across family members.",
  riskLevel: "low",
  schema: z.object({
    personId: z.string().optional().describe("Filter by person ID or name"),
    factType: z.string().optional().describe("Filter by fact type"),
    query: z.string().optional().describe("Search keyword inside fact values")
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    let targetPersonId = input.personId;
    if (input.personId && !graph.people[input.personId]) {
      const lower = input.personId.toLowerCase().trim();
      const p = Object.values(graph.people).find(
        (item) => item.displayName.toLowerCase().trim() === lower || item.aliases.some((a) => a.toLowerCase().trim() === lower)
      );
      if (p) targetPersonId = p.id;
    }

    const facts = searchPersonFacts(ctx.familyId, {
      ...(targetPersonId ? { personId: targetPersonId } : {}),
      ...(input.factType ? { factType: input.factType as FactType } : {}),
      ...(input.query ? { query: input.query } : {})
    });

    return {
      total: facts.length,
      facts: facts.map((f) => ({
        id: f.id,
        personName: f.subjectPersonId ? graph.people[f.subjectPersonId]?.displayName : undefined,
        factType: f.factType,
        value: f.proposedValue,
        status: f.status
      }))
    };
  }
};

// ---------------------------------------------------------------------------
// 9. FAMILY CONTEXT & FULL TREE RETRIEVAL
// ---------------------------------------------------------------------------

export const getFamilyTreeTool: AgentToolDefinition = {
  name: "get_family_tree",
  description: "Retrieve the full family tree structure including all members, relationships, generation layers, and active orientation.",
  riskLevel: "low",
  schema: z.object({}),
  execute: async (_, ctx) => {
    const graph = getGraph(ctx.familyId);
    const people = Object.values(graph.people) as GraphPerson[];
    const relationships = Object.values(graph.relationships) as GraphRelationship[];

    return {
      totalMembers: people.length,
      totalRelationships: relationships.length,
      people: people.map((p) => ({
        id: p.id,
        name: p.displayName,
        birthYear: p.birthYear,
        birthPlace: p.birthPlace,
        gender: p.gender,
        aliases: p.aliases
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        from: graph.people[r.fromPersonId]?.displayName || r.fromPersonId,
        to: graph.people[r.toPersonId]?.displayName || r.toPersonId,
        type: r.type
      }))
    };
  }
};

export const getFamilyContextTool: AgentToolDefinition = {
  name: "get_family_context",
  description: "Get high-level summary of the family heritage archive, member count, key branches, and recent updates.",
  riskLevel: "low",
  schema: z.object({}),
  execute: async (_, ctx) => {
    const graph = getGraph(ctx.familyId);
    const people = Object.values(graph.people) as GraphPerson[];
    const relationships = Object.values(graph.relationships) as GraphRelationship[];
    const memories = Object.values(graph.memories || {}) as GraphMemory[];

    return {
      familyId: ctx.familyId,
      memberCount: people.length,
      relationshipCount: relationships.length,
      memoryCount: memories.length,
      activeUser: ctx.userId,
      keyMembers: people.slice(0, 8).map((p) => p.displayName)
    };
  }
};

export const searchFamilyMembersTool: AgentToolDefinition = {
  name: "search_family_members",
  description: "Find family members using multi-attribute search (name, hometown, alive status, gender).",
  riskLevel: "low",
  schema: z.object({
    name: z.string().optional().describe("Name or nickname to match"),
    hometown: z.string().optional().describe("Birth place or hometown"),
    gender: z.enum(["male", "female", "other"]).optional(),
    isLiving: z.boolean().optional()
  }),
  execute: async (input, ctx) => {
    const graph = getGraph(ctx.familyId);
    let people = Object.values(graph.people) as GraphPerson[];

    if (input.name) {
      const q = input.name.toLowerCase().trim();
      people = people.filter((p) => p.displayName.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q)));
    }
    if (input.hometown) {
      const q = input.hometown.toLowerCase().trim();
      people = people.filter((p) => p.birthPlace && p.birthPlace.toLowerCase().includes(q));
    }
    if (input.gender) {
      people = people.filter((p) => p.gender === input.gender);
    }
    if (input.isLiving !== undefined) {
      people = people.filter((p) => (input.isLiving ? !p.deathDate : !!p.deathDate));
    }

    return {
      totalMatches: people.length,
      members: people.map((p) => ({
        id: p.id,
        name: p.displayName,
        gender: p.gender,
        birthYear: p.birthYear,
        birthPlace: p.birthPlace,
        aliases: p.aliases
      }))
    };
  }
};

