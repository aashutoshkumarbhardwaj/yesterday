import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { colors, radius } from '../../src/theme';
import { extractFamilyFacts } from '../../src/lib/family-ai';
import { listStories, saveStory, type Story, type SuggestedPerson, type SuggestedRelationship } from '../../src/lib/database';
import { StoryCard } from '../../src/components/StoryCard';

export default function StoriesScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listStories(search).then(setStories).catch(console.error);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function saveText() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      let people: SuggestedPerson[] = [];
      let extractedRelationships: SuggestedRelationship[] = [];
      try {
        const extracted = await extractFamilyFacts(text.trim());
        people = extracted.people ?? [];
        extractedRelationships = extracted.relationships ?? [];
      } catch (e) {
        console.warn('Family extraction unavailable; saving source text locally.', e);
      }
      const title = text.trim().split(/[.!?\n]/)[0]?.slice(0, 70) || 'A family memory';
      await saveStory({
        title,
        narrative: text.trim(),
        transcript: text.trim(),
        sourceType: 'text',
        people,
        relationships: extractedRelationships
      });
      setText('');
      refresh();
      Alert.alert(
        'Memory saved',
        `${people.length} possible family member(s) and ${extractedRelationships.length} relationship(s) suggested. Please review names and relationships in Family.`
      );
    } catch (e) {
      Alert.alert('Could not save memory', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Stories</Text>
      <Text style={styles.subtitle}>Every story is a piece of where you come from.</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search your saved memories..."
        placeholderTextColor={colors.muted}
        style={styles.search}
      />
      <View style={styles.composer}>
        <Text style={styles.composerTitle}>Write a family memory</Text>
        <Text style={styles.helper}>
          Type what you remember. Yesterday will suggest people and connections from your words.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="My grandmother Sita used to tell us stories about..."
          placeholderTextColor={colors.muted}
          style={styles.textArea}
        />
        <Pressable disabled={!text.trim() || busy} onPress={saveText} style={[styles.button, (!text.trim() || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Save memory & find family members</Text>}
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Preserve Memory in Archive</Text>}
        </Pressable>
      </View>
      <Text style={styles.label}>SAVED STORIES · {stories.length}</Text>
      {stories.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No saved stories yet</Text>
          <Text style={styles.emptyCopy}>
            Your real recordings, photographs and written memories will appear here. No sample stories are shown.
            Record an elder's voice, upload a photograph, or write down a family tale to begin your archive.
          </Text>
        </View>
      ) : (
        stories.map((s) => <StoryCard key={s.id} story={s} onRefresh={refresh} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 31, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: -12 },
  search: {
    height: 50,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    color: colors.ink
  },
  composer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  composerTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21
  },
  button: { backgroundColor: colors.terra, padding: 14, borderRadius: 999, alignItems: 'center' },
  buttonText: { color: colors.white, fontWeight: '800' },
  label: { color: colors.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  empty: { padding: 22, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', gap: 7 },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  emptyCopy: { color: colors.muted, textAlign: 'center', lineHeight: 19, fontSize: 12 }
});
