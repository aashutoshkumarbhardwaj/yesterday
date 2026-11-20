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
  GraphPerson,
  GraphRelationship
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

