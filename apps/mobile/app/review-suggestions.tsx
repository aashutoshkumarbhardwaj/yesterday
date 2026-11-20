import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import {
  listLocalSuggestions,
  reviewLocalSuggestion,
  upsertTreeEntities,
  type LocalSuggestion
} from '../src/lib/database';
import { fetchSuggestions, reviewSuggestion } from '../src/lib/api';

export default function ReviewSuggestionsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'rejected'>('pending');
  const [suggestions, setSuggestions] = useState<LocalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load from local database first
      const local = await listLocalSuggestions(activeTab);
      
      // 2. Try fetching latest remote suggestions from backend
      try {
        const remote = await fetchSuggestions('default-family', activeTab);
        if (remote.suggestions && remote.suggestions.length > 0) {
          const merged: LocalSuggestion[] = [...local];
          for (const s of remote.suggestions) {
            if (!merged.find(m => m.id === s.id)) {
              merged.push({
                id: s.id,
                factType: s.factType,
                subjectName: s.subjectName ?? null,
                objectName: s.objectName ?? null,
                valueJson: JSON.stringify(s.extractedValue),
                confidence: s.confidence,
                evidenceExcerpt: s.evidenceExcerpt || 'Extracted by AI assistant',
                status: s.status === 'approved' ? 'confirmed' : s.status === 'rejected' ? 'rejected' : 'pending',
                createdAt: s.createdAt
              });
            }
          }
          setSuggestions(merged);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to local if offline
      }

      setSuggestions(local);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleReview = async (suggestion: LocalSuggestion, action: 'confirmed' | 'rejected') => {
    setActionLoadingId(suggestion.id);
    try {
      // Update locally
      await reviewLocalSuggestion(suggestion.id, action);

      // If confirmed, integrate into family knowledge
      if (action === 'confirmed') {
        const parsed = JSON.parse(suggestion.valueJson || '{}');
        const subject = suggestion.subjectName || parsed.subject || parsed.personName;
        const object = suggestion.objectName || parsed.object || parsed.relatedTo;

        if (subject && (suggestion.factType === 'parent_child' || suggestion.factType === 'spouse' || suggestion.factType === 'sibling')) {
          await upsertTreeEntities(
            [
              { name: subject },
              ...(object ? [{ name: object }] : [])
            ],
            object ? [
              {
                personA: subject,
                personB: object,
                type: suggestion.factType,
                evidence: suggestion.evidenceExcerpt
              }
            ] : []
          );
        }
      }

      // Sync with server if reachable
      try {
        await reviewSuggestion(
          suggestion.id,
          action === 'confirmed' ? 'approved' : 'rejected',
          'Family Admin'
        );
      } catch {
        // Safe to ignore server sync if offline
      }

      Alert.alert(
        action === 'confirmed' ? 'Fact Confirmed' : 'Fact Rejected',
        action === 'confirmed'
          ? 'Knowledge added to your family archive with source citation.'
          : 'Suggestion dismissed.'
      );
      loadData();
    } catch (err) {
      Alert.alert('Action Failed', 'Could not update suggestion review status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Review AI Fact Suggestions</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Principle Banner */}
      <View style={styles.banner}>
        <Ionicons name="shield-checkmark" size={18} color={colors.terra} />
        <Text style={styles.bannerText}>
          Yesterday never invents family history. AI extracts facts from your voices, but family members hold final approval.
        </Text>
      </View>

      {/* Status Tabs */}
      <View style={styles.tabsRow}>
        {(['pending', 'confirmed', 'rejected'] as const).map(tab => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Main List */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.terra} style={{ marginTop: 40 }} />
        ) : suggestions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No {activeTab} suggestions</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'pending'
                ? 'All extracted facts have been verified! Record more memories to discover relationships and stories.'
                : `No suggestions currently marked as ${activeTab}.`}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {suggestions.map(s => {
              let valueDisplay = '';
              try {
                const parsed = JSON.parse(s.valueJson);
                valueDisplay = parsed.value || parsed.relation || parsed.name || s.valueJson;
              } catch {
                valueDisplay = s.valueJson;
              }

              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.factBadge}>
                      <Text style={styles.factBadgeText}>{s.factType.replace(/_/g, ' ').toUpperCase()}</Text>
                    </View>
                    <Text style={styles.confidenceScore}>
                      {Math.round(s.confidence * 100)}% Confidence
                    </Text>
                  </View>

                  <View style={styles.claimRow}>
                    <Text style={styles.claimSubject}>{s.subjectName || 'Relative'}</Text>
                    {s.objectName ? (
                      <>
                        <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                        <Text style={styles.claimObject}>{s.objectName}</Text>
                      </>
                    ) : (
                      <Text style={styles.claimValue}>: {valueDisplay}</Text>
                    )}
                  </View>

                  {s.evidenceExcerpt ? (
                    <View style={styles.quoteCard}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.terra} />
                      <Text style={styles.quoteText}>"{s.evidenceExcerpt}"</Text>
                    </View>
                  ) : null}

                  {activeTab === 'pending' ? (
                    <View style={styles.actionsRow}>
                      <Pressable
                        onPress={() => handleReview(s, 'rejected')}
                        disabled={actionLoadingId === s.id}
                        style={styles.rejectBtn}
                      >
                        <Ionicons name="close" size={16} color="#A23A2A" />
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleReview(s, 'confirmed')}
                        disabled={actionLoadingId === s.id}
                        style={styles.approveBtn}
                      >
                        {actionLoadingId === s.id ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={16} color={colors.white} />
                            <Text style={styles.approveBtnText}>Confirm Fact</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.statusFooter}>
                      <Ionicons
                        name={activeTab === 'confirmed' ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={activeTab === 'confirmed' ? '#1B5E20' : '#A23A2A'}
                      />
                      <Text style={styles.statusFooterText}>
                        Status: {activeTab.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: { padding: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  bannerText: { flex: 1, fontSize: 11, color: colors.terra, fontWeight: '600', lineHeight: 16 },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabBtnActive: { borderBottomColor: colors.terra },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: colors.terra },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 30,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  emptySubtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  factBadge: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  factBadgeText: { fontSize: 10, fontWeight: '800', color: colors.terra },
  confidenceScore: { fontSize: 11, fontWeight: '800', color: '#1B5E20' },
  claimRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  claimSubject: { fontSize: 15, fontWeight: '800', color: colors.ink },
  claimObject: { fontSize: 15, fontWeight: '800', color: colors.terra },
  claimValue: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  quoteCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 6,
    padding: 10
  },
  quoteText: { flex: 1, fontSize: 12, color: colors.ink, fontStyle: 'italic', lineHeight: 18 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: '#FDEAE8'
  },
  rejectBtnText: { color: '#A23A2A', fontSize: 13, fontWeight: '800' },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.terra
  },
  approveBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  statusFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusFooterText: { fontSize: 11, fontWeight: '700', color: colors.muted }
});