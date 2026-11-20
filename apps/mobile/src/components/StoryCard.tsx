import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";
import type { Story } from "../lib/database";
import {
  addCommentClient,
  addStoryContributionClient,
  createShareTokenClient,
  deleteCommentClient,
  listCommentsClient,
  listReactionsClient,
  listStoryContributionsClient,
  toggleReactionClient
} from "../lib/sync-client";
import {
  deleteLocalComment,
  listLocalComments,
  listLocalContributions,
  listLocalReactions,
  saveLocalComment,
  saveLocalContribution,
  saveLocalReaction
} from "../lib/database";

export interface StoryCardProps {
  story: Story;
  onRefresh?: () => void;
}

const REACTIONS: Array<{ type: 'heart' | 'like' | 'remember' | 'meaningful' | 'thank_you'; emoji: string; label: string }> = [
  { type: 'heart', emoji: '❤️', label: 'Heart' },
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'remember', emoji: '🕯️', label: 'Remember' },
  { type: 'meaningful', emoji: '✨', label: 'Meaningful' },
  { type: 'thank_you', emoji: '🙏', label: 'Thank you' }
];

export function StoryCard({ story, onRefresh }: StoryCardProps) {
  // Reactions State
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReactions, setUserReactions] = useState<Set<string>>(new Set());

  // Comments State
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Contributions State
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributions, setContributions] = useState<any[]>([]);
  const [perspectiveInput, setPerspectiveInput] = useState("");
  const [dateCorrectionInput, setDateCorrectionInput] = useState("");
  const [submittingContribution, setSubmittingContribution] = useState(false);

  // Sharing state
  const [sharing, setSharing] = useState(false);

  // 1. Load Reactions & Comments Count
  const loadSocialData = useCallback(async () => {
    try {
      // Local first
      const localRxns = await listLocalReactions("story", story.id);
      const initialCounts: Record<string, number> = {};
      const userSet = new Set<string>();
      for (const r of localRxns) {
        initialCounts[r.reactionType] = (initialCounts[r.reactionType] || 0) + 1;
        userSet.add(r.reactionType);
      }
      setReactionCounts(initialCounts);
      setUserReactions(userSet);

      const localComms = await listLocalComments("story", story.id);
      setComments(localComms);

      const localContribs = await listLocalContributions(story.id);
      setContributions(localContribs);

      // Cloud sync if available
      try {
        const cloudRxns = await listReactionsClient("story", story.id);
        if (cloudRxns.counts) setReactionCounts(cloudRxns.counts);

        const cloudComms = await listCommentsClient("story", story.id);
        if (cloudComms.length) setComments(cloudComms);

        const cloudContribs = await listStoryContributionsClient(story.id);
        if (cloudContribs.length) setContributions(cloudContribs);
      } catch {
        // Cloud offline; local persistence active
      }
    } catch (err) {
      console.warn("Could not load social data for story:", err);
    }
  }, [story.id]);

  useEffect(() => {
    loadSocialData();
  }, [loadSocialData]);

  // Handle Reaction
  const handleToggleReaction = async (rxnType: 'heart' | 'like' | 'remember' | 'meaningful' | 'thank_you') => {
    const isCurrentlyActive = userReactions.has(rxnType);
    const newSet = new Set(userReactions);
    if (isCurrentlyActive) newSet.delete(rxnType);
    else newSet.add(rxnType);
    setUserReactions(newSet);

    setReactionCounts((prev) => ({
      ...prev,
      [rxnType]: Math.max(0, (prev[rxnType] || 0) + (isCurrentlyActive ? -1 : 1))
    }));

    try {
      await saveLocalReaction({
        entityType: "story",
        entityId: story.id,
        userId: "user_default",
        userName: "You",
        reactionType: rxnType
      });

      await toggleReactionClient({
        entityType: "story",
        entityId: story.id,
        reactionType: rxnType
      });
    } catch {
      // Local reaction saved
    }
  };

  // Handle Post Comment
  const handlePostComment = async () => {
    const text = commentInput.trim();
    if (!text || submittingComment) return;

    setSubmittingComment(true);
    try {
      const localId = await saveLocalComment({
        entityType: "story",
        entityId: story.id,
        authorId: "user_default",
        authorName: "You",
        content: text
      });

      const newComment = {
        id: localId,
        authorId: "user_default",
        authorName: "You",
        content: text,
        createdAt: new Date().toISOString()
      };
      setComments((prev) => [...prev, newComment]);
      setCommentInput("");

      try {
        await addCommentClient({
          entityType: "story",
          entityId: story.id,
          content: text
        });
      } catch {
        // Local comment saved
      }
    } catch (err) {
      Alert.alert("Error", "Could not save comment.");
    } finally {
      setSubmittingComment(false);
    }
  };

  // Handle Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteLocalComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      try {
        await deleteCommentClient(commentId);
      } catch {}
    } catch (err) {
      Alert.alert("Error", "Could not delete comment.");
    }
  };

  // Handle Post Contribution
  const handlePostContribution = async () => {
    const text = perspectiveInput.trim();
    if (!text || submittingContribution) return;

    setSubmittingContribution(true);
    try {
      const localId = await saveLocalContribution({
        storyId: story.id,
        contributorId: "user_default",
        contributorName: "You",
        perspectiveText: text,
        dateCorrection: dateCorrectionInput.trim() || null
      });

      const newContrib = {
        id: localId,
        contributorName: "You",
        perspectiveText: text,
        dateCorrection: dateCorrectionInput.trim() || null,
        createdAt: new Date().toISOString()
      };
      setContributions((prev) => [...prev, newContrib]);
      setPerspectiveInput("");
      setDateCorrectionInput("");
      setShowContributionModal(false);

      try {
        await addStoryContributionClient({
          storyId: story.id,
          perspectiveText: text,
          dateCorrection: dateCorrectionInput.trim() || null
        });
      } catch {}

      Alert.alert("Perspective Added", "Your perspective has been attached to this family memory.");
    } catch (err) {
      Alert.alert("Error", "Could not save contribution.");
    } finally {
      setSubmittingContribution(false);
    }
  };

  // Handle Share Story
  const handleShareStory = async () => {
    setSharing(true);
    try {
      let shareUrl = `https://yesterday.heritage/story/${story.id}`;
      try {
        const shareResult = await createShareTokenClient({
          entityType: "story",
          entityId: story.id,
          title: story.title
        });
        if (shareResult?.token) {
          shareUrl = `https://yesterday.heritage/share/${shareResult.token}`;
        }
      } catch {
        // Fallback to direct deep link
      }

      await Share.share({
        title: story.title,
        message: `Preserved Family Story: "${story.title}"\n\n"${story.narrative.slice(0, 200)}..."\n\nRead the full family memory: ${shareUrl}`,
        url: Platform.OS === "ios" ? shareUrl : undefined
      });
    } catch (err) {
      console.warn("Share cancelled or failed:", err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Story Title & Meta */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title}>{story.title}</Text>
          <Text style={styles.meta}>
            {story.sourceType.toUpperCase()} · {new Date(story.createdAt).toLocaleDateString()}
            {story.sourceType === 'audio' ? '🎙️ Oral Voice Recording' : story.sourceType === 'image' ? '📷 Family Photograph' : '✍️ Written Story'} · {new Date(story.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <Pressable onPress={handleShareStory} disabled={sharing} style={styles.shareIconBtn}>
          <Ionicons name="share-social-outline" size={18} color={colors.terra} />
        </Pressable>
      </View>

      {/* Main Narrative */}
      <Text style={styles.narrative}>{story.narrative}</Text>

      {/* Collaborative Perspectives / Contributions List */}
      {contributions.length > 0 ? (
        <View style={styles.contributionsBox}>
          <Text style={styles.contributionsLabel}>FAMILY PERSPECTIVES ({contributions.length})</Text>
          {contributions.map((c, idx) => (
            <View key={idx} style={styles.contribItem}>
              <View style={styles.contribHeader}>
                <Ionicons name="person-circle-outline" size={14} color={colors.terra} />
                <Text style={styles.contribAuthor}>{c.contributorName}</Text>
                {c.dateCorrection ? (
                  <Text style={styles.contribDateCorrection}>· Year note: {c.dateCorrection}</Text>
                  <Text style={styles.contribDateCorrection}>· Note: {c.dateCorrection}</Text>
                ) : null}
              </View>
              <Text style={styles.contribText}>{c.perspectiveText}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Heritage Reactions Bar */}
      <View style={styles.reactionsBar}>
        {REACTIONS.map((r) => {
          const count = reactionCounts[r.type] || 0;
          const isActive = userReactions.has(r.type);
          return (
            <Pressable
              key={r.type}
              onPress={() => handleToggleReaction(r.type)}
              style={[styles.reactionPill, isActive && styles.reactionPillActive]}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {count > 0 ? (
                <Text style={[styles.reactionCount, isActive && styles.reactionCountActive]}>{count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Action Footer: Comments, Add Perspective, Share */}
      <View style={styles.footerRow}>
        <Pressable onPress={() => setShowCommentsModal(true)} style={styles.footerBtn}>
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.ink} />
          <Text style={styles.footerBtnText}>
            Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </Text>
        </Pressable>

        <Pressable onPress={() => setShowContributionModal(true)} style={styles.footerBtn}>
          <Ionicons name="git-merge-outline" size={15} color={colors.terra} />
          <Ionicons name="people-outline" size={15} color={colors.terra} />
          <Text style={[styles.footerBtnText, { color: colors.terra }]}>Add Perspective</Text>
        </Pressable>
      </View>

      {/* COMMENTS MODAL */}
      <Modal
        visible={showCommentsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCommentsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Memory Discussion</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>{story.title}</Text>
              </View>
              <Pressable onPress={() => setShowCommentsModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView style={styles.commentsScroll} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Ionicons name="chatbubbles-outline" size={36} color={colors.border} />
                  <Text style={styles.emptyCommentsText}>No comments yet. Share your thoughts or memories!</Text>
                </View>
              ) : (
                comments.map((item) => (
                  <View key={item.id} style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>{(item.authorName || "Y").charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.commentTop}>
                        <Text style={styles.commentAuthor}>{item.authorName}</Text>
                        <Text style={styles.commentTime}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                      </View>
                      <Text style={styles.commentContent}>{item.content}</Text>
                    </View>
                    {item.authorId === "user_default" || item.authorName === "You" ? (
                      <Pressable onPress={() => handleDeleteComment(item.id)} style={styles.delCommentBtn}>
                        <Ionicons name="trash-outline" size={14} color={colors.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>

            {/* Comment Composer */}
            <View style={styles.commentComposer}>
              <TextInput
                value={commentInput}
                onChangeText={setCommentInput}
                placeholder="Write a comment..."
                placeholderTextColor={colors.muted}
                style={styles.commentInput}
                multiline
              />
              <Pressable
                onPress={handlePostComment}
                disabled={!commentInput.trim() || submittingComment}
                style={[styles.postCommentBtn, (!commentInput.trim() || submittingComment) && { opacity: 0.4 }]}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={14} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* COLLABORATIVE CONTRIBUTION MODAL */}
      <Modal
        visible={showContributionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContributionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add Your Perspective</Text>
                <Text style={styles.modalSubtitle}>Contribute details without changing the original story</Text>
              </View>
              <Pressable onPress={() => setShowContributionModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingVertical: 10 }}>
              <Text style={styles.inputLabel}>YOUR PERSPECTIVE OR ADDITIONAL DETAILS *</Text>
              <TextInput
                value={perspectiveInput}
                onChangeText={setPerspectiveInput}
                placeholder="e.g. My mother used to say this happened in 1968, and my uncle was also there..."
                placeholderTextColor={colors.muted}
                style={styles.perspectiveArea}
                multiline
              />

              <Text style={styles.inputLabel}>YEAR OR LOCATION CORRECTION (OPTIONAL)</Text>
              <TextInput
                value={dateCorrectionInput}
                onChangeText={setDateCorrectionInput}
                placeholder="e.g. 1968 (instead of 1970)"
                placeholderTextColor={colors.muted}
                style={styles.singleInput}
              />

              <Pressable
                onPress={handlePostContribution}
                disabled={!perspectiveInput.trim() || submittingContribution}
                style={[styles.submitContribBtn, (!perspectiveInput.trim() || submittingContribution) && { opacity: 0.4 }]}
              >
                {submittingContribution ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitContribText}>Save Family Perspective</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    backgroundColor: '#FFFDF9',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderColor: '#EAE1D5',
    padding: 16,
    gap: 12,
    marginBottom: 12
    marginBottom: 14,
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22
  },
  meta: {
    color: colors.terra,
    fontSize: 11,
    fontWeight: "700"
  },
  shareIconBtn: {
    padding: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16
  },
  narrative: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20
  },
  contributionsBox: {
    backgroundColor: "#FAF6F0",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.terra,
    padding: 10,
    gap: 8,
    marginTop: 2
  },
  contributionsLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1
  },
  contribItem: {
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE8DE",
    paddingBottom: 6
  },
  contribHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  contribAuthor: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700"
  },
  contribDateCorrection: {
    color: colors.terra,
    fontSize: 10,
    fontWeight: "600"
  },
  contribText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    paddingLeft: 18
  },
  reactionsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent"
  },
  reactionPillActive: {
    backgroundColor: "#FCEEEA",
    borderColor: colors.terra
  },
  reactionEmoji: {
    fontSize: 13
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.ink
  },
  reactionCountActive: {
    color: colors.terra
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 6
  },
  footerBtnText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "82%",
    padding: 18,
    gap: 12
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 12
  },
  closeBtn: {
    padding: 6
  },
  commentsScroll: {
    maxHeight: 280,
    paddingVertical: 6
  },
  emptyComments: {
    alignItems: "center",
    padding: 24,
    gap: 8
  },
  emptyCommentsText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center"
  },
  commentItem: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center"
  },
  commentAvatarText: {
    color: colors.terra,
    fontWeight: "800",
    fontSize: 12
  },
  commentTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  commentAuthor: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  commentTime: {
    color: colors.muted,
    fontSize: 10
  },
  commentContent: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 18
  },
  delCommentBtn: {
    padding: 4
  },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 13,
    maxHeight: 80
  },
  postCommentBtn: {
    backgroundColor: colors.terra,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6
  },
  perspectiveArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.ink,
    fontSize: 13,
    minHeight: 110,
    textAlignVertical: "top"
  },
  singleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 13
  },
  submitContribBtn: {
    backgroundColor: colors.terra,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
    marginBottom: 10
  },
  submitContribText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 14
  }
});
