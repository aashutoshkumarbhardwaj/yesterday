import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFamily,
  updateFamilySettings,
  hasPermission,
  createInvitation,
  listInvitations,
  acceptInvitation,
  revokeInvitation,
  syncFamilyTree,
  getFamily
} from "./sync/family-store.js";
import { logActivity, listFamilyActivity } from "./activity/activity-store.js";
import {
  addComment,
  listComments,
  deleteComment,
  toggleReaction,
  listReactions,
  addStoryContribution,
  listStoryContributions
} from "./social/social-store.js";
import {
  createNotification,
  listNotifications,
  markAsRead,
  markAllAsRead
} from "./notifications/notification-store.js";
import {
  createShareToken,
  getSharePayload,
  revokeShareToken,
  generatePrintableTreeHtml
} from "./share/share-store.js";

describe("Family Collaboration, RBAC & Sharing Test Suite", () => {
  const testOwnerId = `usr_owner_${Date.now()}`;
  const testContributorId = `usr_contrib_${Date.now()}`;
  const testViewerId = `usr_viewer_${Date.now()}`;
  let familyId: string;
  let inviteToken: string;

  it("1. Family Creation and 5-tier RBAC rules", () => {
    // RBAC permissions matrix checks
    assert.equal(hasPermission("owner", "delete_family"), true);
    assert.equal(hasPermission("admin", "delete_family"), false);
    assert.equal(hasPermission("admin", "manage_roles"), true);
    assert.equal(hasPermission("admin", "manage_members"), true);
    assert.equal(hasPermission("contributor", "edit_archive"), true);
    assert.equal(hasPermission("contributor", "manage_roles"), false);
    assert.equal(hasPermission("contributor", "manage_members"), false);
    assert.equal(hasPermission("reviewer", "review_suggestions"), true);
    assert.equal(hasPermission("viewer", "view_archive"), true);
    assert.equal(hasPermission("viewer", "edit_archive"), false);

    const fam = createFamily({
      familyName: "The Sharma Heritage",
      creatorId: testOwnerId,
      creatorName: "Aarav Sharma",
      description: "Ancestral roots in Varanasi and Jaipur",
      ancestralLocation: "Varanasi, UP",
      privacy: "family_only"
    });

    familyId = fam.id;
    assert.ok(fam.id.startsWith("fam_"));
    assert.equal(fam.name, "The Sharma Heritage");
    assert.equal(fam.ancestralLocation, "Varanasi, UP");
    assert.equal(fam.privacy, "family_only");
    assert.equal(fam.members.length, 1);
    assert.equal(fam.members[0]!.role, "owner");
  });

  it("2. Family Invitations with Role assignment and Token Security", () => {
    const inviteRes = createInvitation({
      familyId,
      inviterId: testOwnerId,
      recipientEmail: "priya.sharma@example.com",
      role: "contributor",
      expiresInDays: 7
    });

    assert.ok(inviteRes.invitation);
    assert.equal(inviteRes.invitation.role, "contributor");
    assert.equal(inviteRes.invitation.status, "pending");
    assert.ok(inviteRes.invitation.token.length >= 16);
    inviteToken = inviteRes.invitation.token;

    // Unauthorized user cannot invite
    const badInvite = createInvitation({
      familyId,
      inviterId: "random_intruder",
      role: "admin"
    });
    assert.ok(badInvite.error);

    // Accept invitation
    const acceptRes = acceptInvitation({
      token: inviteToken,
      userId: testContributorId,
      userName: "Priya Sharma"
    });

    assert.equal(acceptRes.success, true);
    assert.equal(acceptRes.role, "contributor");

    const updatedFam = getFamily(familyId);
    assert.ok(updatedFam);
    const member = updatedFam.members.find((m) => m.id === testContributorId);
    assert.ok(member);
    assert.equal(member.role, "contributor");
    assert.equal(member.status, "active");
  });

  it("3. Activity Stream logging & retrieval", () => {
    logActivity({
      familyId,
      actorId: testContributorId,
      actorName: "Priya Sharma",
      actionType: "person_added",
      entityTitle: "Dada Ji (Ramesh Sharma)",
      details: { relationship: "grandfather" }
      details: "Relationship: grandfather"
    });

    const feed = listFamilyActivity(familyId, 10);
    assert.ok(feed.length >= 1);
    const item = feed[0]!;
    assert.equal(item.actorName, "Priya Sharma");
    assert.equal(item.actionType, "person_added");
    assert.equal(item.entityTitle, "Dada Ji (Ramesh Sharma)");
  });

  it("4. Heritage Comments and Reactions System", () => {
    const testStoryId = `story_${Date.now()}`;

    // Add comment
    const comment = addComment({
      familyId,
      entityType: "story",
      entityId: testStoryId,
      authorId: testContributorId,
      authorName: "Priya Sharma",
      content: "I remember this festival! Dadi made jalebis that afternoon."
    });

    assert.ok(comment.id.startsWith("com_"));
    assert.equal(comment.content, "I remember this festival! Dadi made jalebis that afternoon.");

    // Reply to comment
    const reply = addComment({
      familyId,
      entityType: "story",
      entityId: testStoryId,
      authorId: testOwnerId,
      authorName: "Aarav Sharma",
      content: "Yes! And grandfather told the story about the 1971 train journey.",
      parentId: comment.id
    });
    assert.equal(reply.parentId, comment.id);

    const comments = listComments("story", testStoryId);
    assert.equal(comments.length, 2);

    // Toggle reaction (heart & remember)
    toggleReaction({
      familyId,
      entityType: "story",
      entityId: testStoryId,
      userId: testContributorId,
      userName: "Priya Sharma",
      reactionType: "heart"
    });

    toggleReaction({
      familyId,
      entityType: "story",
      entityId: testStoryId,
      userId: testOwnerId,
      userName: "Aarav Sharma",
      reactionType: "remember"
    });

    const reactionsData = listReactions("story", testStoryId);
    assert.equal(reactionsData.counts.heart, 1);
    assert.equal(reactionsData.counts.remember, 1);
  });

  it("5. Collaborative Memory Building (Multi-Perspective Contributions)", () => {
    const testStoryId = `story_contrib_${Date.now()}`;
    const contribution = addStoryContribution({
      familyId,
      storyId: testStoryId,
      contributorId: testContributorId,
      contributorName: "Priya Sharma",
      perspectiveText: "From my perspective sitting on the porch, it was raining heavily that evening.",
      photoUris: ["file:///tmp/porch_rain.jpg"],
      dateCorrection: "October 1978"
    });

    assert.ok(contribution.id.startsWith("cnt_"));
    assert.equal(contribution.contributorName, "Priya Sharma");
    assert.equal(contribution.dateCorrection, "October 1978");

    const list = listStoryContributions(testStoryId);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.perspectiveText, "From my perspective sitting on the porch, it was raining heavily that evening.");
  });

  it("6. Real-Time In-App Notifications", () => {
    createNotification({
      userId: testOwnerId,
      familyId,
      type: "comment_added",
      title: "New memory comment",
      body: "Priya Sharma commented on: 'Dada Ji Journey'",
      linkUrl: "/(tabs)/stories"
    });

    const notifs = listNotifications(testOwnerId);
    assert.ok(notifs.notifications.length >= 1);
    assert.equal(notifs.unreadCount >= 1, true);

    const targetId = notifs.notifications[0]!.id;
    markAsRead(testOwnerId, targetId);

    const updated = listNotifications(testOwnerId);
    const readItem = updated.notifications.find((n) => n.id === targetId);
    assert.equal(readItem?.read, true);

    markAllAsRead(testOwnerId);
    const allRead = listNotifications(testOwnerId);
    assert.equal(allRead.unreadCount, 0);
  });

  it("7. External Share Tokens and Printable Family Tree Export", () => {
    const share = createShareToken({
      familyId,
      createdById: testOwnerId,
      createdByName: "Aarav Sharma",
      entityType: "tree",
      title: "Sharma Family Tree Heritage",
      expiresInDays: 30
    });

    assert.ok(share.token);
    assert.equal(share.status, "active");

    const payload = getSharePayload(share.token);
    assert.ok(payload.share);
    assert.equal(payload.share.title, "Sharma Family Tree Heritage");
    assert.ok(payload.data);

    // Printable HTML Generation
    const html = generatePrintableTreeHtml(familyId);
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("The Sharma Heritage"));
    assert.ok(html.includes("Varanasi, UP"));
    assert.ok(html.includes("window.print()"));

    // Revocation
    const revoked = revokeShareToken(share.token, testOwnerId);
    assert.equal(revoked, true);
    const payloadAfter = getSharePayload(share.token);
    assert.ok(payloadAfter.error);
  });
});
