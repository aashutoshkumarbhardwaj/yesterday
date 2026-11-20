import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { SectionTitle } from '../../src/components/SectionTitle';
import { colors, radius } from '../../src/theme';
import { getStats, listStories, type Story } from '../../src/lib/database';
import { useAuth } from '../../src/lib/auth-context';
import { NotificationCenterModal } from '../../src/components/NotificationCenterModal';
import { listNotificationsClient } from '../../src/lib/sync-client';

export default function HomeScreen() {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [stats, setStats] = useState({ stories: 0, people: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const refresh = useCallback(() => {
    listStories().then(setStories).catch(console.error);
    getStats().then(setStats).catch(console.error);
    listNotificationsClient().then(res => setUnreadCount(res.unreadCount || 0)).catch(() => { });
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>LIVING FAMILY ARCHIVE</Text>
          <Text style={styles.brand}>Yesterday</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => setShowNotifications(true)} style={styles.notificationBtn}>
            <Ionicons name="notifications-outline" size={21} color={colors.ink} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.push('/login')} style={[styles.avatar, user && styles.avatarLoggedIn]}>
            {user ? (
              <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
            ) : (
              <Ionicons name="person-outline" size={20} color={colors.terra} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Ionicons name="leaf-outline" size={12} color={colors.terra} />
          <Text style={styles.heroEyebrow}>ORAL TRADITION & ROOTS</Text>
        </View>
        <Text style={styles.heroTitle}>Every elder's voice holds{'\n'}a library of memories.</Text>
        <Text style={styles.heroCopy}>Preserve the voices, recipes, and heirlooms you never want to lose.</Text>
        <View style={styles.actionRow}>
          <Pressable onPress={() => router.push('/record')} style={styles.recordButton}>
            <Ionicons name="mic" size={18} color={colors.white} />
            <Text style={styles.recordText}>Record a voice</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/import')} style={styles.importButton}>
            <Ionicons name="images-outline" size={17} color={colors.terra} />
            <Text style={styles.importText}>Add photos</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/stories')} style={styles.textAction}>
          <Ionicons name="create-outline" size={16} color={colors.terra} />
          <Text style={styles.importText}>Write a memory</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/tree-builder')} style={styles.treeAgentCard}>
        <View style={styles.treeAgentIcon}>
          <Ionicons name="leaf-outline" size={18} color={colors.terra} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.treeAgentTitle}>Oral History Interviewer</Text>
          <Text style={styles.treeAgentCopy}>Speak aloud or write memories to map your living lineage</Text>
        </View>
        <Ionicons name="arrow-forward" size={17} color={colors.terra} />
      </Pressable>

      <Pressable onPress={() => router.push('/family-share')} style={styles.collabBanner}>
        <View style={styles.collabIconCircle}>
          <Ionicons name="people" size={18} color={colors.terra} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.collabTitle}>Family Circle & Sharing</Text>
          <Text style={styles.collabSubtitle}>Invite relatives, assign roles, and view shared family activity</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>

      <View style={styles.quickGrid}>
        <Pressable onPress={() => router.push('/timeline')} style={styles.gridCard}>
          <Ionicons name="calendar-outline" size={18} color={colors.terra} />
          <Text style={styles.gridCardTitle}>Timeline</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/documents')} style={styles.gridCard}>
          <Ionicons name="document-text-outline" size={18} color={colors.terra} />
          <Text style={styles.gridCardTitle}>Documents</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/review-suggestions')} style={styles.gridCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.terra} />
          <Text style={styles.gridCardTitle}>Fact Review</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/gedcom')} style={styles.gridCard}>
          <Ionicons name="git-network-outline" size={18} color={colors.terra} />
          <Text style={styles.gridCardTitle}>Genealogy</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{stats.stories}</Text>
          <Text style={styles.statLabel}>Stories Saved</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{stats.people}</Text>
          <Text style={styles.statLabel}>Relatives Mapped</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{Math.max(1, Math.min(4, Math.ceil(stats.people / 3)))}</Text>
          <Text style={styles.statLabel}>Generations</Text>
        </View>
      </View>

      <SectionTitle title="Recently preserved" action="See all" />
      <View style={{ gap: 10 }}>
        {stories.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your archive starts here</Text>
            <Text style={styles.emptyCopy}>Record a voice, add a photograph or write a memory. Your saved stories will appear here.</Text>
          </View>
        ) : (
          stories.slice(0, 4).map((s) => (
            <Pressable key={s.id} onPress={() => router.push('/(tabs)/stories')} style={styles.story}>
              <View style={styles.storyIcon}>
                <Ionicons
                  name={s.sourceType === 'audio' ? 'mic-outline' : s.sourceType === 'image' ? 'image-outline' : 'book-outline'}
                  size={20}
                  color={colors.terra}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.storyTitle}>{s.title}</Text>
                <Text numberOfLines={2} style={styles.storyCopy}>{s.narrative}</Text>
                <Text style={styles.storyDate}>{new Date(s.createdAt).toLocaleDateString()}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <NotificationCenterModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        onBadgeUpdated={setUnreadCount}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  brand: { color: colors.ink, fontSize: 29, fontWeight: '800', letterSpacing: -1.1, marginTop: 2 },
  notificationBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: colors.terra, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.surface },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EBDCCE' },
  avatarLoggedIn: { backgroundColor: colors.terra, borderColor: colors.terra },
  avatarInitial: { color: colors.white, fontWeight: '800', fontSize: 18 },
  hero: { backgroundColor: '#F2E7D9', borderRadius: radius.lg, padding: 22, overflow: 'hidden', gap: 11, minHeight: 230 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#E7D6C3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroEyebrow: { color: colors.terra, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  heroTitle: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.8 },
  heroCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  recordButton: { flexDirection: 'row', gap: 9, alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.terra, borderRadius: 999, paddingHorizontal: 17, paddingVertical: 12, marginTop: 4 },
  recordText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  importButton: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12 },
  importText: { color: colors.terra, fontWeight: '700', fontSize: 12 },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: 4 },
  stats: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 16, borderWidth: 1, borderColor: colors.border, justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 4, flex: 1 },
  statNumber: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 10 },
  statDivider: { width: 1, backgroundColor: colors.border },
  empty: { padding: 22, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', gap: 7 },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  emptyCopy: { color: colors.muted, textAlign: 'center', lineHeight: 19, fontSize: 12 },
  story: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  storyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  storyTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  storyCopy: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  storyDate: { color: colors.terra, fontSize: 10, fontWeight: '700' },
  treeAgentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginVertical: 4 },
  treeAgentIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  treeAgentTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  treeAgentCopy: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  collabBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#FFF9F2', borderWidth: 1, borderColor: '#EBDCCE', borderRadius: radius.md, marginVertical: 2 },
  collabIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  collabTitle: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  collabSubtitle: { color: colors.muted, fontSize: 11 },
  quickGrid: { flexDirection: 'row', gap: 8, marginVertical: 2 },
  gridCard: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', gap: 4 },
  gridCardTitle: { fontSize: 11, fontWeight: '700', color: colors.ink }
});
