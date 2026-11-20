import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen';
import { colors, radius } from '../../src/theme';
import { FamilyTreeVisualizer } from '../../src/components/FamilyTreeVisualizer';
import { useAuth } from '../../src/lib/auth-context';
import {
  deletePerson,
  listPeople,
  listRelationships,
  updatePersonReview,
  updateRelationshipReview,
  type FamilyRelationship,
  type Person
} from '../../src/lib/database';
import {
  getCachedSession,
  initSyncSession,
  syncWithCloud,
  type StoredFamilySession
} from '../../src/lib/sync-client';

export default function FamilyScreen() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [tabView, setTabView] = useState<'tree' | 'profiles'>('tree');
  const [cloudSession, setCloudSession] = useState<StoredFamilySession | null>(getCachedSession());

  const refresh = useCallback(() => {
    listPeople().then(setPeople).catch(console.error);
    listRelationships().then(setRelationships).catch(console.error);
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    initSyncSession().then((sess) => {
      setCloudSession(sess);
      if (sess && sess.membershipStatus === 'active') {
        syncWithCloud()
          .then(() => refresh())
          .catch(() => { });
      }
    });
  }, [refresh]));

  const reviewPerson = async (id: string, status: 'confirmed' | 'disputed') => {
    await updatePersonReview(id, status);
    refresh();
  };

  const reviewRelation = async (id: string, status: 'confirmed' | 'disputed') => {
    await updateRelationshipReview(id, status);
    refresh();
  };

  const handleDeletePerson = async (id: string) => {
    await deletePerson(id);
    refresh();
  };

  return (
    <Screen scroll={tabView !== 'tree'}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Family Tree</Text>
          <Text style={styles.subtitle}>A growing map of your ancestors and loved ones.</Text>
        </View>
        <Pressable onPress={() => router.push('/login')} style={styles.profileBadge}>
          {user ? (
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
          ) : (
            <View style={styles.loginPill}>
              <Ionicons name="person-circle-outline" size={16} color={colors.terra} />
              <Text style={styles.loginPillText}>Sign In</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Cloud Collaboration Banner */}
      <Pressable onPress={() => router.push('/family-share')} style={styles.cloudBanner}>
        <View style={styles.cloudLeft}>
          <View style={[styles.cloudDot, cloudSession?.membershipStatus === 'active' && styles.cloudDotActive]} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.cloudTitle}>
              {cloudSession ? `${cloudSession.familyName} (${cloudSession.inviteCode})` : 'Share & Collaborate on Tree'}
            </Text>
            <Text style={styles.cloudSubtitle}>
              {cloudSession
                ? `Role: ${cloudSession.userRole.toUpperCase()} · ${cloudSession.membershipStatus === 'pending' ? 'Pending Approval' : 'Auto-Sync Active'}`
                : 'Invite family members with a code to view & edit together'}
            </Text>
          </View>
        </View>
        <View style={styles.cloudBtn}>
          <Ionicons name="people-outline" size={13} color={colors.terra} />
          <Text style={styles.cloudBtnText}>{cloudSession ? 'Manage' : 'Share'}</Text>
        </View>
      </Pressable>

      {/* Oral-history Agent Callout */}
      <View style={styles.agentCard}>
        <View style={styles.agentCardLeft}>
          <View style={styles.agentIconWrap}>
            <Ionicons name="sparkles" size={20} color={colors.terra} />
            <Ionicons name="mic-outline" size={20} color={colors.terra} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.agentTitle}>Talk with Family Historian</Text>
            <Text style={styles.agentTitle}>Oral History Interviewer</Text>
            <Text style={styles.agentCopy}>
              Build your tree naturally through conversation. Speak or type your memories.
              Document your elders' memories and relatives naturally by speaking aloud or typing.
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/tree-builder')} style={styles.agentBtn}>
          <Ionicons name="chatbubbles" size={16} color={colors.white} />
          <Ionicons name="chatbubbles-outline" size={16} color={colors.white} />
          <Text style={styles.agentBtnText}>Start Interview</Text>
        </Pressable>
      </View>

      {/* Quick Launch Tools Bar */}
      <View style={styles.quickLaunchRow}>
        <Pressable onPress={() => router.push('/timeline')} style={styles.quickLaunchPill}>
          <Ionicons name="time-outline" size={14} color={colors.terra} />
          <Text style={styles.quickLaunchText}>Timeline</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/review-suggestions')} style={styles.quickLaunchPill}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.terra} />
          <Text style={styles.quickLaunchText}>Verify Facts</Text>
          <Text style={styles.quickLaunchText}>Fact Review</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/documents')} style={styles.quickLaunchPill}>
          <Ionicons name="document-text-outline" size={14} color={colors.terra} />
          <Text style={styles.quickLaunchText}>OCR Docs</Text>
          <Text style={styles.quickLaunchText}>Documents</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/gedcom')} style={styles.quickLaunchPill}>
          <Ionicons name="git-branch-outline" size={14} color={colors.terra} />
          <Text style={styles.quickLaunchText}>GEDCOM</Text>
          <Text style={styles.quickLaunchText}>Genealogy</Text>
        </Pressable>
      </View>

      {/* View Switcher */}
      <View style={styles.switcher}>
        <Pressable
          onPress={() => setTabView('tree')}
          style={[styles.switchOption, tabView === 'tree' && styles.switchOptionActive]}
        >
          <Ionicons name="git-network-outline" size={15} color={tabView === 'tree' ? colors.white : colors.ink} />
          <Text style={[styles.switchText, tabView === 'tree' && styles.switchTextActive]}>
            Tree Diagram ({people.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTabView('profiles')}
          style={[styles.switchOption, tabView === 'profiles' && styles.switchOptionActive]}
        >
          <Ionicons name="list-outline" size={15} color={tabView === 'profiles' ? colors.white : colors.ink} />
          <Text style={[styles.switchText, tabView === 'profiles' && styles.switchTextActive]}>
            Profiles & Review
          </Text>
        </Pressable>
      </View>

      {tabView === 'tree' ? (
        <FamilyTreeVisualizer
          people={people}
          relationships={relationships}
          onDeletePerson={handleDeletePerson}
          onRefresh={refresh}
        />
      ) : (
        <View style={styles.profilesWrap}>
          <Text style={styles.section}>PEOPLE IN ARCHIVE · {people.length}</Text>
          {people.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your family tree is waiting</Text>
              <Text style={styles.emptyCopy}>
                Talk to the Historian Agent or save memories mentioning relatives to build their profiles here.
                Start an interview or preserve memories mentioning relatives to build their profiles here.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {people.map((p) => (
                <View key={p.id} style={styles.person}>
                  <View style={styles.avatar}>
                    <Text style={styles.initial}>{p.name.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.relation}>{p.relationship || 'Relationship not specified'}</Text>
                    {p.birthYear ? (
                      <Text style={styles.metaYear}>Born: {p.birthYear} {p.birthPlace ? `in ${p.birthPlace}` : ''}</Text>
                    ) : null}
                    {p.notes ? <Text style={styles.notes}>{p.notes}</Text> : null}
                    <Text style={styles.status}>
                      {p.reviewStatus === 'confirmed' ? 'CONFIRMED' : 'SUGGESTED FROM ARCHIVE'}
                    </Text>
                    {p.reviewStatus !== 'confirmed' ? (
                      <View style={styles.actions}>
                        <Pressable onPress={() => reviewPerson(p.id, 'confirmed')} style={styles.confirm}>
                          <Text style={styles.confirmText}>Confirm person</Text>
                        </Pressable>
                        <Pressable onPress={() => reviewPerson(p.id, 'disputed')} style={styles.reject}>
                          <Text style={styles.rejectText}>Not correct</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => {
                      Alert.alert('Remove Relative', `Remove ${p.name}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => handleDeletePerson(p.id) }
                      ]);
                    }}
                    style={styles.delIcon}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {relationships.length > 0 ? (
            <View style={styles.relations}>
              <Text style={styles.relationTitle}>RELATIONSHIPS & CONNECTIONS · {relationships.length}</Text>
              {relationships.map((r) => (
                <View key={r.id} style={styles.edge}>
                  <Text style={styles.edgeText}>{r.personA}  ➔  {r.relation.toUpperCase()}  ➔  {r.personB}</Text>
                  <Text style={styles.status}>{r.status.toUpperCase()} · SOURCE: {r.evidence ?? 'Stated in interview'}</Text>
                  {r.status === 'suggested' ? (
                    <View style={styles.actions}>
                      <Pressable onPress={() => reviewRelation(r.id, 'confirmed')} style={styles.confirm}>
                        <Text style={styles.confirmText}>Confirm link</Text>
                      </Pressable>
                      <Pressable onPress={() => reviewRelation(r.id, 'disputed')} style={styles.reject}>
                        <Text style={styles.rejectText}>Reject</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  profileBadge: {
    marginLeft: 8
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16
  },
  loginPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: '#EBDCCE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999
  },
  loginPillText: {
    color: colors.terra,
    fontWeight: '800',
    fontSize: 11
  },
  title: { color: colors.ink, fontSize: 31, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: -4 },
  cloudBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EBDCCE',
    marginTop: 4
  },
  cloudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1
  },
  cloudDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted
  },
  cloudDotActive: {
    backgroundColor: colors.green
  },
  cloudTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800'
  },
  cloudSubtitle: {
    color: colors.muted,
    fontSize: 11
  },
  cloudBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border
  },
  cloudBtnText: {
    color: colors.terra,
    fontSize: 11,
    fontWeight: '800'
  },
  agentCard: {
    backgroundColor: '#F2E7D9',
    padding: 16,
    borderRadius: radius.lg,
    gap: 12,
    marginVertical: 10
  },
  agentCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center'
  },
  agentTitle: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  agentCopy: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  agentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.terra,
    paddingVertical: 11,
    borderRadius: 999
  },
  agentBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  quickLaunchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap'
  },
  quickLaunchPill: {
    flex: 1,
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  quickLaunchText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  switcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 12
  },
  switchOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md - 2
  },
  switchOptionActive: { backgroundColor: colors.terra },
  switchText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  switchTextActive: { color: colors.white },
  profilesWrap: { gap: 12 },
  section: { color: colors.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: '800' },
  empty: {
    padding: 24,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 8
  },
  emptyTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  emptyCopy: { color: colors.muted, textAlign: 'center', lineHeight: 20, fontSize: 12 },
  list: { gap: 10 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  initial: { color: colors.terra, fontSize: 19, fontWeight: '800' },
  name: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  relation: { color: colors.terra, fontSize: 12, fontWeight: '700' },
  metaYear: { color: colors.muted, fontSize: 11 },
  notes: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  status: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  confirm: { backgroundColor: colors.green, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  confirmText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  reject: { backgroundColor: colors.surfaceWarm, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  rejectText: { color: colors.terra, fontSize: 10, fontWeight: '800' },
  delIcon: { padding: 6 },
  relations: { gap: 8, backgroundColor: colors.surface, padding: 14, borderRadius: radius.md, marginTop: 10 },
  relationTitle: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  edge: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  edgeText: { color: colors.ink, fontSize: 13, fontWeight: '700' }
});
