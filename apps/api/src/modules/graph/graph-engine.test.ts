import test from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { registerGraphRoutes } from "../../routes/graph.js";
import {
  createPerson,
  createRelationship,
  createFactSuggestion,
  reviewFactSuggestion,
  createMergeCandidate,
  reviewMergeCandidate,
  getPersonTimeline
} from "./graph-store.js";

test("Family Graph Engine: create and query people and relationships", () => {
  const familyId = `fam_${Date.now()}`;
  const dadi = createPerson({
    familyId,
    displayName: "Sushila Devi",
    aliases: ["Dadi", "Amma"],
    gender: "female",
    birthYear: 1942,
    birthPlace: "Lucknow, Uttar Pradesh",
    reviewStatus: "confirmed"
  });
  assert.ok(dadi.id);
  assert.strictEqual(dadi.displayName, "Sushila Devi");
  assert.strictEqual(dadi.aliases.includes("Dadi"), true);

  const son = createPerson({
    familyId,
    displayName: "Ramesh Sharma",
    aliases: ["Papa"],
    gender: "male",
    birthYear: 1968,
    birthPlace: "Kanpur",
    reviewStatus: "confirmed"
  });

  const rel = createRelationship({
    familyId,
    fromPersonId: dadi.id,
    toPersonId: son.id,
    type: "parent",
    status: "confirmed",
    evidenceText: "Dadi gave birth to Ramesh in 1968."
  });
  assert.ok(rel.id);
  assert.strictEqual(rel.type, "parent");
  assert.strictEqual(rel.fromPersonId, dadi.id);
  assert.strictEqual(rel.toPersonId, son.id);
});

test("Family Graph Engine: fact suggestion and review workflow commits to confirmed graph", () => {
  const familyId = `fam_sugg_${Date.now()}`;
  const person = createPerson({
    familyId,
    displayName: "Shri Dina Nath",
    aliases: ["Dadaji"],
    reviewStatus: "confirmed"
  });

  // 1. Propose an event fact suggestion
  const suggestion = createFactSuggestion({
    familyId,
    factType: "event",
    subjectPersonId: person.id,
    proposedValue: {
      eventType: "migration",
      title: "Moved from Lahore to Jaipur",
      date: "1947",
      place: "Jaipur, Rajasthan"
    },
    confidence: 0.95,
    extractionModel: "sarvam-105b",
    createdBy: "usr_interviewer",
    evidence: [{
      excerpt: "In 1947, during partition, Dadaji Dina Nath moved the whole family from Lahore to Jaipur.",
      startMs: 14000,
      endMs: 22000
    }]
  });
  assert.strictEqual(suggestion.status, "pending");
  assert.strictEqual(suggestion.evidence.length, 1);

  // 2. Review and confirm the suggestion
  const reviewResult = reviewFactSuggestion(suggestion.id, familyId, {
    status: "confirmed",
    reviewedBy: "usr_admin_reviewer"
  });
  assert.strictEqual(reviewResult.success, true);
  assert.strictEqual(reviewResult.suggestion.status, "confirmed");
  assert.ok(reviewResult.createdEntityId);

  // 3. Verify event is now present in person's timeline
  const timeline = getPersonTimeline(person.id, familyId);
  const migrationEvent = timeline.find((e) => e.eventType === "migration");
  assert.ok(migrationEvent);
  assert.strictEqual(migrationEvent?.title, "Moved from Lahore to Jaipur");
  assert.strictEqual(migrationEvent?.date, "1947");
});

test("Family Graph Engine: person merge candidate review re-points edges cleanly", () => {
  const familyId = `fam_merge_${Date.now()}`;
  const p1 = createPerson({ familyId, displayName: "Ramesh Sharma", aliases: ["Ramesh"], reviewStatus: "confirmed" });
  const p2 = createPerson({ familyId, displayName: "Ramesh Kumar Sharma", aliases: ["Rameshji"], reviewStatus: "confirmed" });

  const child = createPerson({ familyId, displayName: "Aashutosh", aliases: [], reviewStatus: "confirmed" });
  createRelationship({ familyId, fromPersonId: p2.id, toPersonId: child.id, type: "parent", status: "confirmed" });

  const merge = createMergeCandidate({
    familyId,
    personAId: p1.id,
    personBId: p2.id,
    reason: "Exact same person referenced in two separate voice memories",
    confidence: 0.92
  });
  assert.strictEqual(merge.status, "pending");

  const mergeResult = reviewMergeCandidate(merge.id, familyId, {
    status: "accepted",
    reviewedBy: "usr_admin"
  });
  assert.strictEqual(mergeResult.success, true);
  assert.ok(mergeResult.mergedPerson);
  assert.strictEqual(mergeResult.mergedPerson?.aliases.includes("Rameshji"), true);
});

test("Fastify Graph Routes: /v1/graph/suggestions and review endpoint", async () => {
  const app = Fastify();
  await registerGraphRoutes(app);

  const familyId = `fam_route_${Date.now()}`;
  const person = createPerson({ familyId, displayName: "Kavita", aliases: [], reviewStatus: "confirmed" });

  // Post suggestion
  const postRes = await app.inject({
    method: "POST",
    url: "/v1/graph/suggestions",
    payload: {
      familyId,
      factType: "bio",
      subjectPersonId: person.id,
      proposedValue: { bio: "Taught mathematics at Lucknow University for 30 years." },
      confidence: 0.88,
      extractionModel: "sarvam-105b",
      evidence: [{ excerpt: "Kavita taught mathematics at Lucknow University." }]
    }
  });
  assert.strictEqual(postRes.statusCode, 200);
  const postBody = JSON.parse(postRes.body);
  assert.strictEqual(postBody.success, true);
  assert.ok(postBody.suggestion.id);

  // Get suggestions
  const getRes = await app.inject({
    method: "GET",
    url: `/v1/graph/suggestions?familyId=${familyId}&status=pending`
  });
  assert.strictEqual(getRes.statusCode, 200);
  const getBody = JSON.parse(getRes.body);
  assert.strictEqual(getBody.success, true);
  assert.strictEqual(getBody.suggestions.length, 1);

  // Review suggestion
  const reviewRes = await app.inject({
    method: "POST",
    url: `/v1/graph/suggestions/${postBody.suggestion.id}/review`,
    payload: {
      familyId,
      status: "confirmed",
      reviewedBy: "admin_user_1"
    }
  });
  assert.strictEqual(reviewRes.statusCode, 200);
  const reviewBody = JSON.parse(reviewRes.body);
  assert.strictEqual(reviewBody.success, true);
  assert.strictEqual(reviewBody.suggestion.status, "confirmed");
});

