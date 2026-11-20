import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Screen } from "../src/components/Screen";
import { colors, radius } from "../src/theme";
import { createStory, understandImage, type ImageUnderstanding, type StoryDraft } from "../src/lib/api";
import { saveStory, type SuggestedPerson, type SuggestedRelationship } from "../src/lib/database";
import { extractFamilyFacts } from "../src/lib/family-ai";

export default function ImportMemoryScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState("image/jpeg");
  const [imageFilename, setImageFilename] = useState("family-photo.jpg");
  const [context, setContext] = useState("");
  const [analysis, setAnalysis] = useState<ImageUnderstanding | null>(null);
  const [story, setStory] = useState<StoryDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    setImageUri(result.assets[0].uri);
    setImageMimeType(result.assets[0].mimeType ?? "image/jpeg");
    setImageFilename(result.assets[0].fileName ?? "family-photo.jpg");
    setAnalysis(null);
    setStory(null);
    setSaved(false);
  }

  async function analyzePhoto() {
    if (!imageUri) return;
    setBusy(true);
    try {
      const result = await understandImage(imageUri, context, imageMimeType, imageFilename);
      setAnalysis(result);
    } catch (error) {
      Alert.alert("Image analysis failed", error instanceof Error ? error.message : "Check the API server and Gemini key.");
    } finally { setBusy(false); }
  }

  async function makeStory() {
    if (!analysis && !context.trim()) return;
    setBusy(true);
    try {
      const result = await createStory({ imageDescriptions: analysis ? [analysis.description, ...analysis.visibleDetails] : [], familyContext: context });
      setStory(result);
    } catch (error) {
      Alert.alert("Story generation failed", error instanceof Error ? error.message : "Check the API server and Gemini key.");
    } finally { setBusy(false); }
  }


  async function preservePhotoStory() {
    if (!imageUri || (!story && !analysis && !context.trim())) return;
    setBusy(true);
    const source = [context, analysis?.description, ...(analysis?.visibleDetails ?? []), story?.narrative].filter(Boolean).join("\n");
    try {
      let people: SuggestedPerson[] = []; let relationships: SuggestedRelationship[] = [];
      try { const extracted = await extractFamilyFacts(source); people = extracted.people ?? []; relationships = extracted.relationships ?? []; } catch (error) { console.warn("Family extraction unavailable; preserving photo context anyway.", error); }
      const archiveDir = `${FileSystem.documentDirectory}family-photos/`;
      await FileSystem.makeDirectoryAsync(archiveDir, { intermediates: true }).catch(() => undefined);
      const extension = imageFilename.includes(".") ? imageFilename.split(".").pop() : "jpg";
      const permanentUri = `${archiveDir}${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: imageUri, to: permanentUri });
      await saveStory({ title: story?.title ?? "Family photograph", narrative: story?.narrative ?? source, transcript: source, sourceType: "image", sourceUri: permanentUri, people, relationships });
      setSaved(true);
      Alert.alert("Photograph preserved", `${people.length} possible family member(s) and ${relationships.length} relationship(s) suggested for review.`);
    } catch (error) { Alert.alert("Could not save photograph", error instanceof Error ? error.message : "Try again."); }
    finally { setBusy(false); }
  }

  return <Screen>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 30 }}>
      <View style={styles.header}><Text onPress={() => router.back()} style={styles.back}>‹  Back</Text><Text style={styles.eyebrow}>ADD TO YOUR FAMILY ARCHIVE</Text></View>
      <Text style={styles.title}>A photograph can hold a whole story.</Text>
      <Text style={styles.copy}>Add an old photograph and tell us what your family remembers. AI will help organize the details, not decide who people are.</Text>
      <Pressable onPress={pickPhoto} style={styles.pickButton}><Text style={styles.pickText}>{imageUri ? "Choose a different photograph" : "Choose a photograph"}</Text></Pressable>
      {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover"/>}
      <Text style={styles.label}>WHAT DOES YOUR FAMILY KNOW ABOUT THIS PHOTO?</Text>
      <TextInput value={context} onChangeText={setContext} multiline placeholder="For example: This was taken outside our old house. I think it was around 1985..." placeholderTextColor={colors.muted} style={styles.input}/>
      <Pressable disabled={!imageUri || busy} onPress={analyzePhoto} style={[styles.primaryButton, (!imageUri || busy) && styles.disabled]}>
        {busy ? <ActivityIndicator color={colors.white}/> : <Text style={styles.primaryText}>Understand this photograph</Text>}
      </Pressable>
      {analysis && <View style={styles.resultCard}>
        <Text style={styles.label}>WHAT THE IMAGE SHOWS</Text>
        <Text style={styles.body}>{analysis.description}</Text>
        {!!analysis.visibleDetails.length && <Text style={styles.body}>Visible details: {analysis.visibleDetails.join(", ")}</Text>}
        {!!analysis.questionsForFamily.length && <><Text style={styles.label}>QUESTIONS FOR YOUR FAMILY</Text>{analysis.questionsForFamily.map((q, i) => <Text key={i} style={styles.body}>• {q}</Text>)}</>}
        <Text style={styles.caution}>{analysis.caution}</Text>
        <Pressable disabled={busy} onPress={makeStory} style={styles.secondaryButton}><Text style={styles.secondaryText}>Create a story draft</Text></Pressable>
      </View>}
      {story && <View style={styles.resultCard}>
        <Text style={styles.label}>AI-GENERATED DRAFT · REVIEW BEFORE SAVING</Text>
        <Text style={styles.storyTitle}>{story.title}</Text>
        <Text style={styles.body}>{story.narrative}</Text>
        {!!story.factsToConfirm.length && <><Text style={styles.label}>DETAILS TO CONFIRM</Text>{story.factsToConfirm.map((fact, i) => <Text key={i} style={styles.body}>• {fact}</Text>)}</>}
        <Text style={styles.caution}>This draft is based on supplied material. Review it before treating it as verified family history.</Text>
      </View>}
      {imageUri && !saved && (story || analysis || context.trim()) && <Pressable disabled={busy} onPress={preservePhotoStory} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.white}/> : <Text style={styles.primaryText}>Preserve photograph and story</Text>}</Pressable>}
      {saved && <Text style={styles.caution}>Saved to your local family archive.</Text>}
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: colors.terra, fontWeight: "700", fontSize: 15 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  pickButton: { borderWidth: 1, borderColor: colors.terra, borderStyle: "dashed", backgroundColor: colors.surfaceWarm, borderRadius: radius.lg, padding: 17, alignItems: "center" },
  pickText: { color: colors.terra, fontWeight: "800" },
  preview: { width: "100%", height: 240, borderRadius: radius.lg, backgroundColor: colors.surface },
  label: { color: colors.terra, fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 5 },
  input: { minHeight: 100, textAlignVertical: "top", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, color: colors.ink, fontSize: 14, lineHeight: 21 },
  primaryButton: { backgroundColor: colors.terra, padding: 15, borderRadius: 999, alignItems: "center" },
  disabled: { opacity: 0.45 },
  primaryText: { color: colors.white, fontWeight: "800" },
  resultCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  caution: { color: colors.muted, fontSize: 11, lineHeight: 17, fontStyle: "italic" },
  secondaryButton: { backgroundColor: colors.green, padding: 14, borderRadius: 999, alignItems: "center", marginTop: 5 },
  secondaryText: { color: colors.white, fontWeight: "800" },
  storyTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", lineHeight: 27 }
});
