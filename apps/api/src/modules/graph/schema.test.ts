import test from "node:test";
import assert from "node:assert/strict";
import {
  familyGraphExtractionSchema,
  keepEvidenceGrounded,
  resolvePersonMentions,
  validateProposedRelationships
} from "./schema.js";

const sample = familyGraphExtractionSchema.parse({
  people: [
    { mentionId: "a", mentionText: "Dadi", displayName: "Sushila Devi", aliases: ["Dadi"], relationshipToNarrator: "grandmother", notes: null },
    { mentionId: "b", mentionText: "my mother", displayName: null, aliases: [], relationshipToNarrator: "mother", notes: null }
  ],
  relationships: [{ fromMentionId: "b", toMentionId: "a", type: "other", confidence: "high", evidenceText: "my mother", needsClarification: true }],
  followUpQuestions: [], summary: ""
});

test("exact alias resolves to existing person without fuzzy auto-merge", () => {
  const result = resolvePersonMentions(sample.people, [{ id: "person-1", displayName: "Sushila Devi", aliases: ["Dadi"] }]);
  assert.equal(result[0]?.status, "exact_match");
  assert.equal(result[0]?.matchedPersonId, "person-1");
});

test("similar names become review candidates, not automatic matches", () => {
  const result = resolvePersonMentions(sample.people, [{ id: "person-1", displayName: "Sushila Devi Sharma" }]);
  assert.equal(result[0]?.status, "candidate_review");
  assert.equal(result[0]?.matchedPersonId, null);
});

test("evidence not copied exactly from source is removed", () => {
  const extraction = { ...sample, relationships: [
    ...sample.relationships,
    { ...sample.relationships[0]!, evidenceText: "She is definitely the grandmother" }
  ] };
  const grounded = keepEvidenceGrounded(extraction, "my mother told me about Dadi.");
  assert.equal(grounded.relationships.length, 1);
});

test("self-parent relationship is rejected", () => {
  const people = [{ mentionId: "a", mentionText: "Me", displayName: "Me", aliases: [], relationshipToNarrator: null, notes: null }];
  const relationships = [{ fromMentionId: "a", toMentionId: "a", type: "parent" as const, confidence: "high" as const, evidenceText: "Me is my own parent", needsClarification: false }];
  const issues = validateProposedRelationships({ people, relationships });
  assert.equal(issues[0]?.code, "SELF_RELATIONSHIP");
});

test("parent cycle is detected", () => {
  const people = [
    { mentionId: "a", mentionText: "A", displayName: "A", aliases: [], relationshipToNarrator: null, notes: null },
    { mentionId: "b", mentionText: "B", displayName: "B", aliases: [], relationshipToNarrator: null, notes: null }
  ];
  const resolutions = [
    { mentionId: "a", mentionText: "A", status: "exact_match" as const, matchedPersonId: "A", candidates: [] },
    { mentionId: "b", mentionText: "B", status: "exact_match" as const, matchedPersonId: "B", candidates: [] }
  ];
  const issues = validateProposedRelationships({
    people,
    relationships: [{ fromMentionId: "b", toMentionId: "a", type: "parent" as const, confidence: "high" as const, evidenceText: "B is parent of A", needsClarification: false }],
    resolutions,
    existingPeople: [{ id: "A", displayName: "A" }, { id: "B", displayName: "B" }],
    existingRelationships: [{ fromPersonId: "A", toPersonId: "B", type: "parent" }]
  });
  assert.ok(issues.some((issue) => issue.code === "ANCESTRY_CYCLE"));
});
