import test from "node:test";
import assert from "node:assert/strict";
import {
  detectAncestryCycles,
  resolveKinship,
  traceAncestralLine,
  type KinshipPerson,
  type KinshipRelationship
} from "./kinship.js";

const samplePeople: KinshipPerson[] = [
  { id: "1", name: "Ramesh Sharma", gender: "male" },
  { id: "2", name: "Sunita Sharma", gender: "female" },
  { id: "3", name: "Aarav Sharma", gender: "male" },
  { id: "4", name: "Priya Sharma", gender: "female" },
  { id: "5", name: "Vikas Sharma", gender: "male" },
  { id: "6", name: "Kavita Sharma", gender: "female" },
  { id: "7", name: "Rohan Sharma", gender: "male" },
  { id: "8", name: "Sita Devi", gender: "female" }
];

const sampleRelationships: KinshipRelationship[] = [
  // Sita is mother of Ramesh
  { personA: "8", personB: "1", relation: "parent", evidence: "Sita is Ramesh's mother" },
  // Ramesh married Sunita
  { personA: "1", personB: "2", relation: "spouse", evidence: "Ramesh married Sunita" },
  // Ramesh & Sunita parents of Aarav and Priya
  { personA: "1", personB: "3", relation: "parent", evidence: "Ramesh has a son Aarav" },
  { personA: "2", personB: "3", relation: "parent", evidence: "Sunita is Aarav's mother" },
  { personA: "1", personB: "4", relation: "parent", evidence: "Ramesh's daughter Priya" },
  { personA: "2", personB: "4", relation: "parent", evidence: "Sunita's daughter Priya" },
  // Ramesh and Vikas are brothers
  { personA: "1", personB: "5", relation: "sibling", evidence: "Vikas is Ramesh's brother" },
  // Vikas married Kavita
  { personA: "5", personB: "6", relation: "spouse", evidence: "Vikas is married to Kavita" },
  // Vikas & Kavita parents of Rohan
  { personA: "5", personB: "7", relation: "parent", evidence: "Vikas has a son Rohan" }
];

test("resolves direct parent, child and spouse relationships", () => {
  const fatherRes = resolveKinship("1", "3", samplePeople, sampleRelationships);
  assert.equal(fatherRes.found, true);
  assert.equal(fatherRes.relationDescription, "Father");

  const childRes = resolveKinship("3", "1", samplePeople, sampleRelationships);
  assert.equal(childRes.found, true);
  assert.equal(childRes.relationDescription, "Son");

  const spouseRes = resolveKinship("1", "2", samplePeople, sampleRelationships);
  assert.equal(spouseRes.found, true);
  assert.equal(spouseRes.relationDescription, "Husband");
});

test("resolves sibling and uncle relationships", () => {
  const siblingRes = resolveKinship("3", "4", samplePeople, sampleRelationships);
  assert.equal(siblingRes.found, true);
  assert.equal(siblingRes.relationDescription, "Brother");

  // Vikas is uncle of Aarav (brother of Aarav's father Ramesh)
  const uncleRes = resolveKinship("5", "3", samplePeople, sampleRelationships);
  assert.equal(uncleRes.found, true);
  assert.match(uncleRes.relationDescription, /Paternal Uncle/);
});

test("resolves cousins and grandparents", () => {
  // Rohan (Vikas's son) and Aarav (Ramesh's son) are cousins
  const cousinRes = resolveKinship("7", "3", samplePeople, sampleRelationships);
  assert.equal(cousinRes.found, true);
  assert.equal(cousinRes.relationDescription, "Cousin");

  // Sita Devi is grandmother of Aarav
  const grandmaRes = resolveKinship("8", "3", samplePeople, sampleRelationships);
  assert.equal(grandmaRes.found, true);
  assert.match(grandmaRes.relationDescription, /Grandmother/);
});

test("traces ancestral lines", () => {
  const paternalLine = traceAncestralLine("3", "paternal", samplePeople, sampleRelationships);
  assert.equal(paternalLine.line.length >= 2, true);
  assert.equal(paternalLine.line[0]?.name, "Aarav Sharma");
  assert.equal(paternalLine.line[1]?.name, "Ramesh Sharma");
});

test("detects circular ancestry loops", () => {
  const valid = detectAncestryCycles(sampleRelationships);
  assert.equal(valid.hasCycle, false);

  const cyclicalRelationships: KinshipRelationship[] = [
    { personA: "A", personB: "B", relation: "parent" },
    { personA: "B", personB: "C", relation: "parent" },
    { personA: "C", personB: "A", relation: "parent" }
  ];
  const cycleResult = detectAncestryCycles(cyclicalRelationships);
  assert.equal(cycleResult.hasCycle, true);
});

