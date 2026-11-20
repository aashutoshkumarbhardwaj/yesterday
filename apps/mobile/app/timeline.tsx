import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import {
  addPersonEvent,
  listAllTimelineEvents,
  listPeople,
  type LocalLifeEvent,
  type Person
} from '../src/lib/database';

export default function TimelineScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<LocalLifeEvent[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Add Milestone Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetPersonId, setTargetPersonId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('life_event');
  const [eventDate, setEventDate] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [allEvents, allPeople] = await Promise.all([
        listAllTimelineEvents(),
        listPeople()
      ]);
      setEvents(allEvents);
      setPeople(allPeople);
      if (allPeople.length > 0 && allPeople[0] && !targetPersonId) {
        setTargetPersonId(allPeople[0].id);
      }
    } catch (err) {
      console.error('Failed to load timeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveMilestone = async () => {
    if (!targetPersonId) {
      Alert.alert('Relative Required', 'Please select which family member this milestone belongs to.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for this milestone.');
      return;
    }

    await addPersonEvent({
      personId: targetPersonId,
      eventType,
      title: title.trim(),
      description: description.trim() || null,
      eventDate: eventDate.trim() || null,
      place: place.trim() || null,
      evidence: 'Recorded in Family Timeline'
    });

    setTitle('');
    setEventDate('');
    setPlace('');
    setDescription('');
    setShowAddModal(false);
    loadData();
    Alert.alert('Saved', 'Family milestone added successfully.');
  };

  const personMap = new Map(people.map(p => [p.id, p]));

  const filteredEvents = events.filter(evt => {
    if (activeFilter !== 'all' && evt.eventType !== activeFilter) return false;
    if (selectedPersonId && evt.personId !== selectedPersonId) return false;
    return true;
  });

  const filterChips = [
    { key: 'all', label: 'All Milestones' },
    { key: 'birth', label: 'Births' },
    { key: 'marriage', label: 'Marriages' },
    { key: 'migration', label: 'Migrations' },
    { key: 'education', label: 'Education' },
    { key: 'career', label: 'Career' },
    { key: 'tradition', label: 'Traditions' }
  ];

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Family Timeline</Text>
        <Pressable onPress={() => setShowAddModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>Milestone</Text>
        </Pressable>
      </View>

      {/* Filter by Category Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterScrollWrapper}
      >
        {filterChips.map(chip => (
          <Pressable
            key={chip.key}
            onPress={() => setActiveFilter(chip.key)}
            style={[styles.chip, activeFilter === chip.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeFilter === chip.key && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Filter by Person Chips */}
      {people.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.personFilterScroll}
          style={styles.personFilterWrapper}
        >
          <Pressable
            onPress={() => setSelectedPersonId(null)}
            style={[styles.personChip, selectedPersonId === null && styles.personChipActive]}
          >
            <Text style={[styles.personChipText, selectedPersonId === null && styles.personChipTextActive]}>
              Everyone
            </Text>
          </Pressable>
          {people.map(p => (
            <Pressable
              key={p.id}
              onPress={() => setSelectedPersonId(p.id)}
              style={[styles.personChip, selectedPersonId === p.id && styles.personChipActive]}
            >
              <Text style={[styles.personChipText, selectedPersonId === p.id && styles.personChipTextActive]}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Main Timeline List */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.terra} style={{ marginTop: 40 }} />
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No Timeline Events Found</Text>
            <Text style={styles.emptySubtitle}>
              Tap the "+ Milestone" button above or record a family voice story to automatically extract historical dates and life milestones.
            </Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            {filteredEvents.map((evt, idx) => {
              const person = personMap.get(evt.personId);
              return (
                <View key={evt.id} style={styles.timelineRow}>
                  <View style={styles.trackCol}>
                    <View style={styles.milestoneDot} />
                    {idx < filteredEvents.length - 1 ? <View style={styles.trackLine} /> : null}
                  </View>
                  <View style={styles.milestoneCard}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.dateBadge}>{evt.eventDate || 'Historical Date'}</Text>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{evt.eventType.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.milestoneTitle}>{evt.title}</Text>
                    {person ? (
                      <View style={styles.personTagRow}>
                        <Ionicons name="person-circle-outline" size={14} color={colors.terra} />
                        <Text style={styles.personTagText}>{person.name}</Text>
                      </View>
                    ) : null}
                    {evt.place ? (
                      <View style={styles.placeRow}>
                        <Ionicons name="location-outline" size={13} color={colors.muted} />
                        <Text style={styles.placeText}>{evt.place}</Text>
                      </View>
                    ) : null}
                    {evt.description ? (
                      <Text style={styles.descText}>{evt.description}</Text>
                    ) : null}
                    {evt.evidence ? (
                      <Text style={styles.evidenceText}>Verified via: {evt.evidence}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Milestone Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.topBar}>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
            <Text style={styles.topBarTitle}>Add Family Milestone</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.inputLabel}>FAMILY MEMBER *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {people.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => setTargetPersonId(p.id)}
                  style={[styles.selectPersonChip, targetPersonId === p.id && styles.selectPersonChipActive]}
                >
                  <Text style={[styles.selectPersonText, targetPersonId === p.id && styles.selectPersonTextActive]}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>MILESTONE TITLE *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Moved to London, Founded family business"
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>CATEGORY</Text>
            <View style={styles.categoryWrap}>
              {[
                { key: 'birth', label: 'Birth' },
                { key: 'marriage', label: 'Marriage' },
                { key: 'migration', label: 'Migration' },
                { key: 'education', label: 'Education' },
                { key: 'career', label: 'Career' },
                { key: 'tradition', label: 'Tradition' },
                { key: 'life_event', label: 'General' }
              ].map(cat => (
                <Pressable
                  key={cat.key}
                  onPress={() => setEventType(cat.key)}
                  style={[styles.catBtn, eventType === cat.key && styles.catBtnActive]}
                >
                  <Text style={[styles.catBtnText, eventType === cat.key && styles.catBtnTextActive]}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>DATE OR YEAR</Text>
            <TextInput
              value={eventDate}
              onChangeText={setEventDate}
              placeholder="e.g. 1978 or 14 August 1947"
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>LOCATION / PLACE</Text>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="e.g. Delhi, Punjab, Nairobi"
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>STORIES & DETAILS</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Enter family anecdotes, quotes, or historical context..."
              multiline
              style={[styles.modalInput, { height: 90 }]}
            />

            <Pressable onPress={handleSaveMilestone} style={styles.saveSubmitBtn}>
              <Text style={styles.saveSubmitBtnText}>Save Milestone to Timeline</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.terra,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md
  },
  addBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  filterScrollWrapper: { maxHeight: 46, backgroundColor: colors.card },
  filterScroll: { paddingHorizontal: 14, alignItems: 'center', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  chipTextActive: { color: colors.white },
  personFilterWrapper: { maxHeight: 40, backgroundColor: colors.paper, marginTop: 4 },
  personFilterScroll: { paddingHorizontal: 14, alignItems: 'center', gap: 6 },
  personChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  personChipActive: { backgroundColor: colors.surfaceWarm, borderColor: colors.terra },
  personChipText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  personChipTextActive: { color: colors.terra, fontWeight: '800' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  emptySubtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  timelineList: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  trackCol: { width: 20, alignItems: 'center' },
  milestoneDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.terra,
    marginTop: 6
  },
  trackLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  milestoneCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    gap: 6
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBadge: { fontSize: 12, fontWeight: '800', color: colors.terra },
  typeBadge: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  typeBadgeText: { fontSize: 9, fontWeight: '800', color: colors.muted },
  milestoneTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  personTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  personTagText: { fontSize: 12, fontWeight: '700', color: colors.terra },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  placeText: { fontSize: 11, color: colors.muted },
  descText: { fontSize: 12, color: colors.ink, lineHeight: 18, marginTop: 2 },
  evidenceText: { fontSize: 10, color: colors.muted, fontStyle: 'italic', marginTop: 2 },
  modalContainer: { flex: 1, backgroundColor: colors.paper },
  modalScroll: { padding: 16, gap: 12, paddingBottom: 40 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  modalInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border
  },
  selectPersonChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6
  },
  selectPersonChipActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  selectPersonText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  selectPersonTextActive: { color: colors.white },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  catBtnActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  catBtnText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  catBtnTextActive: { color: colors.white },
  saveSubmitBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10
  },
  saveSubmitBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' }
});