import { getRevision, recordRevision, updateRevisionStatus, EntityRevision } from "./revision-store.js";
import { updatePerson, updateRelationship, getGraph } from "../graph/graph-store.js";

export function undoRevision(
  revisionId: string,
  familyId: string,
  userId: string
): { success: boolean; message: string; restoredRevision?: EntityRevision } {
  const revision = getRevision(revisionId);
  if (!revision) {
    return { success: false, message: "Revision record not found." };
  }
  if (revision.familyId !== familyId) {
    return { success: false, message: "Unauthorized: revision belongs to a different family archive." };
  }
  if (revision.status === "reverted") {
    return { success: false, message: "This revision has already been undone." };
  }

  const graph = getGraph(familyId);

  // Undo Person mutation
  if (revision.targetEntity === "person") {
    const person = graph.people[revision.entityId];
    if (!person) return { success: false, message: "Target person no longer exists." };

    if (revision.operation === "update" && revision.previousValue) {
      updatePerson(revision.entityId, familyId, revision.previousValue as any);
    } else if (revision.operation === "create") {
      updatePerson(revision.entityId, familyId, { reviewStatus: "disputed" });
    }
  }

  // Undo Relationship mutation
  if (revision.targetEntity === "relationship") {
    const rel = graph.relationships[revision.entityId];
    if (!rel) return { success: false, message: "Target relationship not found." };

    if (revision.operation === "update" && revision.previousValue) {
      updateRelationship(revision.entityId, familyId, revision.previousValue as any);
    } else if (revision.operation === "create") {
      updateRelationship(revision.entityId, familyId, { status: "disputed" });
    }
  }

  // Mark original revision as reverted
  updateRevisionStatus(revisionId, "reverted");
  revision.status = "reverted";

  // Create audit trail for the undo operation itself
  const undoLog = recordRevision({
    familyId,
    actorId: userId,
    actorType: "user",
    targetEntity: revision.targetEntity,
    entityId: revision.entityId,
    operation: "update",
    previousValue: revision.newValue,
    newValue: revision.previousValue || { status: "disputed" },
    userInstruction: `Undo revision ${revisionId}`
  });

  return {
    success: true,
    message: `Successfully undone operation on ${revision.targetEntity}.`,
    restoredRevision: undoLog
  };
}
