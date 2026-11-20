import test from "node:test";
import assert from "node:assert/strict";
import { getToolRegistry, executeAgentTool } from "./tool-registry.js";
import { evaluateAgentPolicy } from "./agent-policy.js";
import { recordRevision, listRevisions } from "../audit/revision-store.js";
import { undoRevision } from "../audit/undo-service.js";
import { calculateKinship } from "../genealogy/kinship-engine.js";
import { createPerson, createRelationship, getGraph } from "../graph/graph-store.js";

test("Agent Policy: strictly refuses deletion commands and forbids delete tools", () => {
  // Test deletion phrases
  const phrases = [
    "Delete my grandfather from the tree",
    "Remove Rajesh Kumar",
    "Erase this relationship",
    "Drop the family branch",
    "Wipe my mother's profile"
  ];

  for (const phrase of phrases) {
    const decision = evaluateAgentPolicy(phrase);
    assert.equal(decision.allowed, false, `Phrase "${phrase}" should be refused`);
    assert.match(decision.refusalReason || "", /cannot delete/i);
  }

  // Verify tool registry has ZERO deletion tools
  const registry = getToolRegistry();
  for (const toolName of registry.keys()) {
    assert.equal(/delete|remove|erase|drop/i.test(toolName), false, `Tool "${toolName}" must not be a deletion tool`);
  }
});

test("Agent Tool Execution: create_person, add_alias, and create_relationship with audit revisions", async () => {
  const familyId = `fam_test_${Date.now()}`;
  const ctx = {
    familyId,
    userId: "usr_agent_tester",
    userRole: "admin" as const,
    userInstruction: "Add grandfather and connect to father"
  };

  // 1. Create grandfather
  const createRes = await executeAgentTool("create_person", {
    displayName: "Govind Narayan",
    gender: "male",
    birthYear: 1935,
    birthPlace: "Jaipur, India"
  }, ctx);

  assert.equal(createRes.success, true);
  const grandpaId = (createRes.result as any).person.id;
  assert.ok(grandpaId);

  // 2. Add alias
  const aliasRes = await executeAgentTool("add_person_alias", {
    personId: grandpaId,
    alias: "Babuji"
  }, ctx);
  assert.equal(aliasRes.success, true);
  assert.deepEqual((aliasRes.result as any).aliases, ["Babuji"]);

  // 3. Create father
  const createFatherRes = await executeAgentTool("create_person", {
    displayName: "Anand Narayan",
    gender: "male",
    birthYear: 1965
  }, ctx);
  assert.equal(createFatherRes.success, true);
  const fatherId = (createFatherRes.result as any).person.id;

  // 4. Connect grandfather -> father
  const relRes = await executeAgentTool("create_relationship", {
    fromPersonId: grandpaId,
    toPersonId: fatherId,
    type: "parent",
    evidenceText: "Stated in family interview"
  }, ctx);
  assert.equal(relRes.success, true);

  // 5. Verify revision records
  const revisions = listRevisions(familyId);
  assert.ok(revisions.length >= 3, "At least 3 revisions should be recorded");
  assert.equal(revisions[0]?.actorType, "agent");
});

test("Audit & Undo: safely reverts an update without destroying audit history", async () => {
  const familyId = `fam_undo_${Date.now()}`;
  const person = createPerson({
    familyId,
    displayName: "Sunil Verma",
    aliases: [],
    birthYear: 1950,
    reviewStatus: "confirmed"
  });

  // Record an update revision
  const rev = recordRevision({
    familyId,
    actorId: "agent_runner",
    actorType: "agent",
    targetEntity: "person",
    entityId: person.id,
    operation: "update",
    previousValue: { birthYear: 1950 },
    newValue: { birthYear: 1948 },
    userInstruction: "Correct birth year to 1948"
  });

  // Execute undo
  const undoRes = undoRevision(rev.id, familyId, "usr_admin");
  assert.equal(undoRes.success, true);

  // Check graph reflects restored value
  const graph = getGraph(familyId);
  assert.equal(graph.people[person.id]?.birthYear, 1950, "Birth year should be restored to 1950");

  // Check audit history is preserved and appended
  const revisions = listRevisions(familyId);
  assert.ok(revisions.some((r) => r.id === rev.id && r.status === "reverted"));
  assert.ok(revisions.some((r) => r.userInstruction?.includes("Undo revision")));
});

test("Kinship Engine: paternal vs maternal distinctions, uncles, siblings, and cousins", () => {
  const people: Record<string, any> = {
    me: { id: "me", displayName: "Me (User)", gender: "male" },
    father: { id: "father", displayName: "Father Anand", gender: "male" },
    mother: { id: "mother", displayName: "Mother Meena", gender: "female" },
    dada: { id: "dada", displayName: "Grandpa Govind", gender: "male" },
    nana: { id: "nana", displayName: "Grandpa Shankar", gender: "male" },
    chacha: { id: "chacha", displayName: "Uncle Suresh", gender: "male" },
    mama: { id: "mama", displayName: "Uncle Deepak", gender: "male" },
    brother: { id: "brother", displayName: "Brother Rohit", gender: "male" },
    cousin: { id: "cousin", displayName: "Cousin Varun", gender: "male" }
  };

  const relationships: Record<string, any> = {
    r1: { id: "r1", fromPersonId: "father", toPersonId: "me", type: "parent", status: "confirmed" },
    r2: { id: "r2", fromPersonId: "mother", toPersonId: "me", type: "parent", status: "confirmed" },
    r3: { id: "r3", fromPersonId: "dada", toPersonId: "father", type: "parent", status: "confirmed" },
    r4: { id: "r4", fromPersonId: "nana", toPersonId: "mother", type: "parent", status: "confirmed" },
    r5: { id: "r5", fromPersonId: "dada", toPersonId: "chacha", type: "parent", status: "confirmed" },
    r6: { id: "r6", fromPersonId: "nana", toPersonId: "mama", type: "parent", status: "confirmed" },
    r7: { id: "r7", fromPersonId: "father", toPersonId: "brother", type: "parent", status: "confirmed" },
    r8: { id: "r8", fromPersonId: "chacha", toPersonId: "cousin", type: "parent", status: "confirmed" }
  };

  // 1. Father & Mother
  const fKin = calculateKinship("me", "father", people, relationships);
  assert.equal(fKin.englishLabel, "Father");
  assert.equal(fKin.hindiLabel, "पिताजी");

  const mKin = calculateKinship("me", "mother", people, relationships);
  assert.equal(mKin.englishLabel, "Mother");
  assert.equal(mKin.hindiLabel, "माँ");

  // 2. Paternal vs Maternal Grandfather (Dada vs Nana)
  const dadaKin = calculateKinship("me", "dada", people, relationships);
  assert.equal(dadaKin.englishLabel, "Paternal Grandfather");
  assert.equal(dadaKin.hindiLabel, "दादाजी");
  assert.equal(dadaKin.lineage, "paternal");

  const nanaKin = calculateKinship("me", "nana", people, relationships);
  assert.equal(nanaKin.englishLabel, "Maternal Grandfather");
  assert.equal(nanaKin.hindiLabel, "नाना");
  assert.equal(nanaKin.lineage, "maternal");

  // 3. Paternal Uncle (Chacha) vs Maternal Uncle (Mama)
  const chachaKin = calculateKinship("me", "chacha", people, relationships);
  assert.equal(chachaKin.englishLabel, "Paternal Uncle");
  assert.equal(chachaKin.hindiLabel, "चाचा / ताऊ");

  const mamaKin = calculateKinship("me", "mama", people, relationships);
  assert.equal(mamaKin.englishLabel, "Maternal Uncle");
  assert.equal(mamaKin.hindiLabel, "मामा");

  // 4. Sibling & Cousin
  const broKin = calculateKinship("me", "brother", people, relationships);
  assert.equal(broKin.englishLabel, "Brother");

  const cousinKin = calculateKinship("me", "cousin", people, relationships);
  assert.equal(cousinKin.englishLabel, "Paternal Cousin");
  assert.equal(cousinKin.hindiLabel, "चचेरा भाई/बहन");
});
