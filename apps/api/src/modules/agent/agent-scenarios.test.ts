import test from "node:test";
import assert from "node:assert/strict";
import { processFamilyAgentChat } from "./family-agent.js";
import { getToolRegistry, executeAgentTool } from "./tool-registry.js";
import { evaluateAgentPolicy } from "./agent-policy.js";
import {
  createPerson,
  createRelationship,
  validateFamilyGraph,
  correctRelationship,
  getGraph,
  listMemories,
  searchPersonFacts
} from "../graph/graph-store.js";

test("Scenario 1: Natural Conversation - Grandfather Rajesh Sharma creation and fact extraction", async () => {
  const familyId = `fam_sc1_${Date.now()}`;
  const response = await processFamilyAgentChat({
    message: "My grandfather was named Rajesh Sharma. He was born in 1945 in Lucknow. He was a teacher and loved telling stories about his childhood.",
    context: {
      familyId,
      userId: "user_test_1",
      userRole: "admin"
    }
  });

  assert.ok(response.reply);
  assert.equal(response.graphUpdated, true);
  assert.ok(response.actionsExecuted.length >= 1);

  const graph = getGraph(familyId);
  const rajesh = Object.values(graph.people).find((p) => p.displayName === "Rajesh Sharma");
  assert.ok(rajesh, "Rajesh Sharma should exist in graph");
  assert.equal(rajesh.birthYear, 1945);
  assert.equal(rajesh.birthPlace, "Lucknow");
});

test("Scenario 2: Duplicate Prevention - Existing relative updated instead of duplicated", async () => {
  const familyId = `fam_sc2_${Date.now()}`;
  // First turn: create Rajesh Sharma
  await processFamilyAgentChat({
    message: "My grandfather was named Rajesh Sharma. He was born in 1945 in Lucknow.",
    context: { familyId, userId: "user_test_2", userRole: "admin" }
  });

  // Second turn: talk about Rajesh Sharma again
  const response = await processFamilyAgentChat({
    message: "My grandfather Rajesh Sharma was a teacher and loved telling stories about his childhood.",
    context: { familyId, userId: "user_test_2", userRole: "admin" }
  });

  assert.ok(response.reply);
  const graph = getGraph(familyId);
  const rajeshs = Object.values(graph.people).filter((p) => p.displayName === "Rajesh Sharma");
  assert.equal(rajeshs.length, 1, "Should not duplicate Rajesh Sharma");
});

test("Scenario 3: Story Preservation - Unstructured narrative preserved as Memory, separate from facts", async () => {
  const familyId = `fam_sc3_${Date.now()}`;
  const story = "My grandmother used to wake up at 4 AM every morning. She prepared food for the entire family. During festivals, she would cook special dishes, especially for Diwali. My grandfather used to tell us stories every evening.";

  const response = await processFamilyAgentChat({
    message: story,
    context: { familyId, userId: "user_test_3", userRole: "admin" }
  });

  assert.ok(response.reply);
  const memories = listMemories(familyId);
  assert.ok(memories.length >= 1, "Should record at least one memory");
  assert.ok(memories[0]?.narrative.includes("wake up at 4 AM"));
});

test("Scenario 4: Contextual Follow-up Question - Asks single relevant follow-up", async () => {
  const familyId = `fam_sc4_${Date.now()}`;
  // Create relative first
  const person = createPerson({
    familyId,
    displayName: "Rajesh Sharma",
    birthYear: 1945,
    aliases: [],
    reviewStatus: "confirmed"
  });

  const response = await processFamilyAgentChat({
    message: "He worked in the railway department in Kanpur.",
    context: {
      familyId,
      userId: "user_test_4",
      userRole: "admin",
      focusPersonId: person.id
    }
  });

  assert.ok(response.reply);
  assert.ok(response.clarificationQuestion || response.reply.includes("?") || response.reply.includes("when"));
});

test("Scenario 5: Multi-turn Pronoun Resolution - Resolves 'He' to focus person", async () => {
  const familyId = `fam_sc5_${Date.now()}`;
  const conversationId = `conv_sc5_${Date.now()}`;

  // Turn 1: Introduce grandfather
  const turn1 = await processFamilyAgentChat({
    message: "My grandfather was named Rajesh Sharma. He was born in 1945 in Lucknow.",
    conversationId,
    context: { familyId, userId: "user_test_5", userRole: "admin", conversationId }
  });
  assert.ok(turn1.focusPersonName?.includes("Rajesh Sharma"));

  // Turn 2: Refer to him with pronoun 'He'
  const turn2 = await processFamilyAgentChat({
    message: "He worked in the railway department in Kanpur.",
    conversationId,
    context: { familyId, userId: "user_test_5", userRole: "admin", conversationId }
  });

  assert.ok(turn2.actionsExecuted.length > 0 || turn2.reply.includes("railway"));
});

test("Scenario 6: Relationship Correction - Updates relationship dynamically", async () => {
  const familyId = `fam_sc6_${Date.now()}`;
  const rajesh = createPerson({ familyId, displayName: "Rajesh Sharma", aliases: [], reviewStatus: "confirmed" });
  const mahesh = createPerson({ familyId, displayName: "Mahesh", aliases: [], reviewStatus: "confirmed" });

  // Initially mistaken as grandfather
  createRelationship({
    familyId,
    fromPersonId: mahesh.id,
    toPersonId: rajesh.id,
    type: "parent",
    status: "confirmed"
  });

  // Correct via tool
  const correction = correctRelationship({
    familyId,
    personAId: mahesh.id,
    personBId: rajesh.id,
    newRelation: "sibling"
  });

  assert.equal(correction.success, true);
  assert.equal(correction.relationship?.type, "sibling");
  assert.equal(correction.previousRelation, "parent");
});

test("Scenario 7: Cycle Detection - Prevents ancestor from becoming own child", () => {
  const familyId = `fam_sc7_${Date.now()}`;
  const gen1 = createPerson({ familyId, displayName: "Harir", aliases: [], reviewStatus: "confirmed" });
  const gen2 = createPerson({ familyId, displayName: "Ramesh", aliases: [], reviewStatus: "confirmed" });
  const gen3 = createPerson({ familyId, displayName: "Vikram", aliases: [], reviewStatus: "confirmed" });

  createRelationship({ familyId, fromPersonId: gen1.id, toPersonId: gen2.id, type: "parent", status: "confirmed" });
  createRelationship({ familyId, fromPersonId: gen2.id, toPersonId: gen3.id, type: "parent", status: "confirmed" });

  // Attempt to make Vikram parent of Harir (creates cycle: Harir -> Ramesh -> Vikram -> Harir)
  createRelationship({ familyId, fromPersonId: gen3.id, toPersonId: gen1.id, type: "parent", status: "confirmed" });

  const validation = validateFamilyGraph(familyId);
  assert.equal(validation.valid, false, "Cycle should invalidate the family graph");
  assert.equal(validation.cycleFound, true, "Should report cycleFound = true");
});

test("Scenario 8: Self-Link Prevention - Disallows connecting a person to themselves", async () => {
  const familyId = `fam_sc8_${Date.now()}`;
  const person = createPerson({ familyId, displayName: "Self Link Test", aliases: [], reviewStatus: "confirmed" });

  const ctx = { familyId, userId: "tester", userRole: "admin" as const };
  const res = await executeAgentTool("create_relationship", {
    fromPersonId: person.id,
    toPersonId: person.id,
    type: "parent"
  }, ctx);

  assert.equal(res.success, true);
  assert.equal((res.result as any).created, false);
  assert.match((res.result as any).message, /themselves/i);
});

test("Scenario 9: Security Deletion Refusal - Agent strictly refuses deletion commands", () => {
  const deletionCommands = [
    "Delete my grandfather from the tree",
    "Remove Rajesh Sharma",
    "Erase this memory",
    "Wipe the family archive",
    "Destroy relationship edge"
  ];

  for (const cmd of deletionCommands) {
    const policy = evaluateAgentPolicy(cmd);
    assert.equal(policy.allowed, false, `Command "${cmd}" must be refused`);
    assert.match(policy.refusalReason || "", /cannot delete/i);
  }
});

test("Scenario 10: Narrative Word Permissibility - Does not block legitimate stories containing 'dropped'", () => {
  const story = "My grandfather was very hardworking. He dropped out of school in 1920 to support his siblings.";
  const policy = evaluateAgentPolicy(story);
  assert.equal(policy.allowed, true, "Narrative phrases like 'dropped out' must not be blocked");
});

test("Scenario 11: Tool Registry Completeness - Contains all required tools with zero delete tools", () => {
  const registry = getToolRegistry();
  const requiredTools = [
    "search_people",
    "get_person_details",
    "create_person",
    "update_person",
    "add_person_alias",
    "get_relationships",
    "create_relationship",
    "update_relationship",
    "correct_relationship",
    "validate_family_graph",
    "create_memory",
    "update_memory",
    "attach_people_to_memory",
    "search_memories",
    "retrieve_memory_details",
    "add_person_fact",
    "update_person_fact",
    "search_person_facts",
    "get_family_tree",
    "get_family_context",
    "search_family_members"
  ];

  for (const toolName of requiredTools) {
    assert.ok(registry.has(toolName), `Tool "${toolName}" must be registered`);
  }

  // Ensure ZERO deletion tools exist
  for (const toolName of registry.keys()) {
    assert.equal(/delete|remove|erase|drop/i.test(toolName), false, `Tool "${toolName}" must not be a deletion tool`);
  }
});

test("Scenario 12: Family Context and Tree Retrieval - Returns structured family tree", async () => {
  const familyId = `fam_sc12_${Date.now()}`;
  const ctx = { familyId, userId: "tester", userRole: "admin" as const };

  createPerson({ familyId, displayName: "Grandpa", birthYear: 1930, aliases: [], reviewStatus: "confirmed" });
  createPerson({ familyId, displayName: "Grandma", birthYear: 1935, aliases: [], reviewStatus: "confirmed" });

  const treeRes = await executeAgentTool("get_family_tree", {}, ctx);
  assert.equal(treeRes.success, true);
  assert.equal((treeRes.result as any).totalMembers, 2);

  const contextRes = await executeAgentTool("get_family_context", {}, ctx);
  assert.equal(contextRes.success, true);
  assert.equal((contextRes.result as any).memberCount, 2);
});
