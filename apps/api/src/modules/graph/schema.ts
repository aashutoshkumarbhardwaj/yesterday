import { z } from "zod";

export const relationshipTypeSchema = z.enum([
  "parent",
  "spouse",
  "partner",
  "sibling",
  "adoptive_parent",
  "step_parent",
  "guardian",
  "other"
]);

export const extractedPersonSchema = z.object({
  mentionId: z.string().min(1).max(80),
  mentionText: z.string().min(1).max(300),
  displayName: z.string().max(160).nullable(),
  aliases: z.array(z.string().min(1).max(120)).max(20).default([]),
  relationshipToNarrator: z.string().max(120).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null)
});

export const extractedRelationshipSchema = z.object({
  fromMentionId: z.string().min(1).max(80),
  toMentionId: z.string().min(1).max(80),
  type: relationshipTypeSchema,
  confidence: z.enum(["low", "medium", "high"]),
  evidenceText: z.string().min(1).max(500),
  needsClarification: z.boolean().default(false)
});

export const familyGraphExtractionSchema = z.object({
  people: z.array(extractedPersonSchema).max(80),
  relationships: z.array(extractedRelationshipSchema).max(120),
  followUpQuestions: z.array(z.string().min(1).max(500)).max(10).default([]),
  summary: z.string().max(2000).default("")
});

export type FamilyGraphExtraction = z.infer<typeof familyGraphExtractionSchema>;
export type ExistingPerson = { id: string; displayName: string; aliases?: string[] };
export type PersonResolution = {
  mentionId: string;
  mentionText: string;
  status: "exact_match" | "candidate_review" | "new_person_suggestion" | "ambiguous";
  matchedPersonId: string | null;
  candidates: Array<{ personId: string; displayName: string; score: number }>;
};

export function normalizePersonName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function tokenSimilarity(a: string, b: string): number {
  const left = new Set(normalizePersonName(a).split(" ").filter(Boolean));
  const right = new Set(normalizePersonName(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

/** Exact aliases can be linked; fuzzy matches are always sent for human review. */
export function resolvePersonMentions(mentions: FamilyGraphExtraction["people"], existing: ExistingPerson[]): PersonResolution[] {
  return mentions.map((mention) => {
    const names = [mention.displayName, mention.mentionText, ...mention.aliases].filter((x): x is string => Boolean(x)).map(normalizePersonName);
    const exact = existing.filter((person) => [person.displayName, ...(person.aliases ?? [])]
      .map(normalizePersonName).some((alias) => names.includes(alias)));

    if (exact.length === 1) return {
      mentionId: mention.mentionId,
      mentionText: mention.mentionText,
      status: "exact_match" as const,
      matchedPersonId: exact[0]!.id,
      candidates: [{ personId: exact[0]!.id, displayName: exact[0]!.displayName, score: 1 }]
    };
    if (exact.length > 1) return {
      mentionId: mention.mentionId,
      mentionText: mention.mentionText,
      status: "ambiguous" as const,
      matchedPersonId: null,
      candidates: exact.map((person) => ({ personId: person.id, displayName: person.displayName, score: 1 }))
    };

    const reference = mention.displayName ?? mention.mentionText;
    const candidates = existing.map((person) => ({
      personId: person.id,
      displayName: person.displayName,
      score: Math.max(0, ...[person.displayName, ...(person.aliases ?? [])].map((name) => tokenSimilarity(reference, name)))
    })).filter((candidate) => candidate.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);

    return {
      mentionId: mention.mentionId,
      mentionText: mention.mentionText,
      status: candidates.length ? "candidate_review" as const : "new_person_suggestion" as const,
      matchedPersonId: null,
      candidates
    };
  });
}

export type ExistingRelationship = { fromPersonId: string; toPersonId: string; type: string };
export type GraphValidationIssue = { code: "SELF_RELATIONSHIP" | "ANCESTRY_CYCLE" | "MISSING_PERSON_REFERENCE"; relationshipIndex: number; message: string };

/** Checks proposed edges against known people and the existing parent graph. */
export function validateProposedRelationships(input: {
  people: FamilyGraphExtraction["people"];
  relationships: FamilyGraphExtraction["relationships"];
  existingPeople?: ExistingPerson[];
  resolutions?: PersonResolution[];
  existingRelationships?: ExistingRelationship[];
}): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const mentionIds = new Set(input.people.map((person) => person.mentionId));
  const resolutionByMention = new Map((input.resolutions ?? []).map((item) => [item.mentionId, item]));
  const existingIds = new Set((input.existingPeople ?? []).map((person) => person.id));
  const parentEdges: Array<[string, string]> = (input.existingRelationships ?? [])
    .filter((edge) => ["parent", "adoptive_parent", "step_parent"].includes(edge.type))
    .map((edge) => [edge.fromPersonId, edge.toPersonId]);

  input.relationships.forEach((relationship, index) => {
    if (relationship.fromMentionId === relationship.toMentionId) {
      issues.push({ code: "SELF_RELATIONSHIP", relationshipIndex: index, message: "A person cannot have a relationship with themselves." });
      return;
    }
    if (!mentionIds.has(relationship.fromMentionId) || !mentionIds.has(relationship.toMentionId)) {
      issues.push({ code: "MISSING_PERSON_REFERENCE", relationshipIndex: index, message: "Relationship refers to a person mention that was not extracted." });
      return;
    }
    if (["parent", "adoptive_parent", "step_parent"].includes(relationship.type)) {
      const from = resolutionByMention.get(relationship.fromMentionId)?.matchedPersonId ?? `mention:${relationship.fromMentionId}`;
      const to = resolutionByMention.get(relationship.toMentionId)?.matchedPersonId ?? `mention:${relationship.toMentionId}`;
      if (from === to) {
        issues.push({ code: "SELF_RELATIONSHIP", relationshipIndex: index, message: "Resolved relationship points to the same person." });
        return;
      }
      const edges = [...parentEdges, [from, to] as [string, string]];
      const adjacency = new Map<string, string[]>();
      for (const [parent, child] of edges) adjacency.set(parent, [...(adjacency.get(parent) ?? []), child]);
      const visited = new Set<string>();
      const active = new Set<string>();
      const hasCycle = (node: string): boolean => {
        if (active.has(node)) return true;
        if (visited.has(node)) return false;
        visited.add(node); active.add(node);
        for (const child of adjacency.get(node) ?? []) if (hasCycle(child)) return true;
        active.delete(node); return false;
      };
      if ([...existingIds, ...edges.flat()].some(hasCycle)) {
        issues.push({ code: "ANCESTRY_CYCLE", relationshipIndex: index, message: "This parent relationship would create a circular ancestry path." });
      }
      parentEdges.push([from, to]);
    }
  });
  return issues;
}

/** Rejects model-generated evidence that is not an exact substring of the source. */
export function keepEvidenceGrounded(extraction: FamilyGraphExtraction, source: string): FamilyGraphExtraction {
  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedSource = normalizeWhitespace(source);
  const groundedPeople = extraction.people
    .filter((person) => normalizedSource.toLocaleLowerCase().includes(normalizeWhitespace(person.mentionText).toLocaleLowerCase()))
    .map((person) => ({
      ...person,
      // A formal name not present in the source is not accepted as extracted fact.
      displayName: person.displayName && normalizedSource.toLocaleLowerCase().includes(normalizeWhitespace(person.displayName).toLocaleLowerCase()) ? person.displayName : null,
      aliases: person.aliases.filter((alias) => normalizedSource.toLocaleLowerCase().includes(normalizeWhitespace(alias).toLocaleLowerCase())),
      relationshipToNarrator: person.relationshipToNarrator && normalizedSource.toLocaleLowerCase().includes(normalizeWhitespace(person.relationshipToNarrator).toLocaleLowerCase()) ? person.relationshipToNarrator : null,
      notes: null
    }));
  const validMentionIds = new Set(groundedPeople.map((person) => person.mentionId));
  return {
    ...extraction,
    people: groundedPeople,
    relationships: extraction.relationships.filter((relationship) =>
      validMentionIds.has(relationship.fromMentionId) &&
      validMentionIds.has(relationship.toMentionId) &&
      normalizedSource.includes(normalizeWhitespace(relationship.evidenceText))
    )
  };
}
