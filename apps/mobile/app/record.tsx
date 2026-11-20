import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { Screen } from "../src/components/Screen";
import { colors, radius } from "../src/theme";
import { createStory, getBatchTranscription, startBatchTranscription, transcribeAudio, type StoryDraft } from "../src/lib/api";
import { saveStory, type SuggestedPerson, type SuggestedRelationship } from "../src/lib/database";
import { extractFamilyFacts } from "../src/lib/family-ai";

export default function RecordScreen() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: "document" });
  const recorderState = useAudioRecorderState(recorder);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [storyDraft, setStoryDraft] = useState<StoryDraft | null>(null);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone permission needed", "Allow microphone access to preserve a family story.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setSavedUri(null);
      setTranscript(null);
      setStoryDraft(null);
      setSaved(false);
      setBatchJobId(null);
    } catch (error) {
      Alert.alert("Recording error", error instanceof Error ? error.message : "Could not start recording.");
    }
  }

  async function stopRecording() {
    try {
      await recorder.stop();
      setSavedUri(recorder.uri ?? null);
      if (!recorder.uri) Alert.alert("Recording stopped", "The recording file could not be located.");
    } catch (error) {
      Alert.alert("Recording error", error instanceof Error ? error.message : "Could not save recording.");
    }
  }

  async function runTranscription() {
    if (!savedUri) return;
    setBusy(true);
    try {
      const durationSeconds = recorderState.durationMillis / 1000;
      if (durationSeconds <= 60 && !batchJobId) {
        const result = await transcribeAudio(savedUri);
        setTranscript(result.transcript);
        Alert.alert("Transcript ready", result.note);
      } else {
        let jobId = batchJobId;
        if (!jobId) {
          const job = await startBatchTranscription(savedUri);
          jobId = job.jobId;
          setBatchJobId(jobId);
          Alert.alert("Transcription started", "Sarvam is processing this recording with speaker separation. Keep this screen open or check again later.");
          Alert.alert("Transcription started", "Your audio is being transcribed with speaker separation. Keep this screen open or check again later.");
        }
        let completed = false;
        for (let attempt = 0; attempt < 36; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const result = await getBatchTranscription(jobId);
          if (result.status === "Completed" || result.status === "PartiallyCompleted") {
            if (result.transcript) setTranscript(result.transcript);
            setBatchJobId(null);
            completed = true;
            break;
          }
          if (result.status === "Failed") {
            setBatchJobId(null);
            throw new Error("Sarvam could not process this recording.");
            throw new Error("Could not transcribe this recording. Please try again.");
          }
        }
        if (!completed) Alert.alert("Still processing", "Your original recording is safe. Tap Check transcription later to continue checking the same Sarvam job.");
        if (!completed) Alert.alert("Still processing", "Your original recording is safe. Tap Check transcription later to continue checking your text.");
      }
    } catch (error) {
      Alert.alert("Transcription unavailable", error instanceof Error ? error.message : "Check your API server and provider keys.");
    } finally {
      setBusy(false);
    }
  }

  async function generateStoryDraft() {
    if (!transcript) return;
    setBusy(true);
    try {
      const draft = await createStory({ transcript, familyContext: "A family oral-history recording. Do not invent names, dates, locations or events." });
      setStoryDraft(draft);
    } catch (error) {
      Alert.alert("Story generation failed", error instanceof Error ? error.message : "Check Gemini configuration.");
    } finally { setBusy(false); }
  }


  async function preserveStory() {
    if (!savedUri || !transcript) return;
    setBusy(true);
    try {
      let people: SuggestedPerson[] = []; let relationships: SuggestedRelationship[] = [];
      try { const extracted = await extractFamilyFacts(transcript); people = extracted.people ?? []; relationships = extracted.relationships ?? []; } catch (error) { console.warn("Family extraction unavailable; preserving transcript anyway.", error); }
      const title = storyDraft?.title ?? transcript.trim().split(/[.!?\n]/)[0]?.slice(0, 70) ?? "Recorded family memory";
      await saveStory({ title: title || "Recorded family memory", narrative: storyDraft?.narrative ?? transcript, transcript, sourceType: "audio", sourceUri: savedUri, people, relationships });
      setSaved(true);
      Alert.alert("Memory preserved", `Your original recording stays on this device. ${people.length} possible family member(s) and ${relationships.length} relationship(s) were suggested for review.`);
    } catch (error) { Alert.alert("Could not save memory", error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  const isRecording = recorderState.isRecording;
  return <Screen>
    <View style={styles.header}><Text onPress={() => router.back()} style={styles.back}>‹  Back</Text><Text style={styles.headerLabel}>PRESERVE A MEMORY</Text></View>
    <View style={styles.center}>
      <View style={styles.micHalo}><Text style={styles.mic}>♫</Text></View>
      <Text style={styles.title}>{isRecording ? "Listening to a story..." : "Every story begins\nwith a voice."}</Text>
      <Text style={styles.copy}>{isRecording ? "Take your time. There's no rush." : "Invite someone to share a memory. The original audio stays on this device."}</Text>
      <View style={styles.wave}>{Array.from({ length: 31 }, (_, i) => <View key={i} style={[styles.bar, { height: 8 + ((i * 17) % 29) }]} />)}</View>
      <Text style={styles.time}>{isRecording ? `${Math.floor(recorderState.durationMillis / 60000).toString().padStart(2, "0")}:${Math.floor((recorderState.durationMillis % 60000) / 1000).toString().padStart(2, "0")}` : "READY TO RECORD"}</Text>
      <Pressable onPress={isRecording ? stopRecording : startRecording} style={[styles.recordButton, isRecording && styles.stopButton]}>
        <View style={styles.recordInner} />
      </Pressable>
      <Text style={styles.hint}>{isRecording ? "Tap to stop and save" : "Tap once to begin recording"}</Text>
      {savedUri && !isRecording && <Pressable onPress={runTranscription} disabled={busy} style={styles.transcribeButton}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.transcribeText}>{batchJobId ? "Check transcription" : "Transcribe with Sarvam"}</Text>}
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.transcribeText}>{batchJobId ? "Check transcription" : "Transcribe Voice Memory"}</Text>}
      </Pressable>}
    </View>
    {transcript ? <View style={styles.transcript}><Text style={styles.promptLabel}>TRANSCRIPT DRAFT</Text><Text style={styles.transcriptText}>{transcript}</Text><Pressable onPress={generateStoryDraft} disabled={busy} style={styles.transcribeButton}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.transcribeText}>Turn transcript into a story</Text>}</Pressable>{storyDraft && <><Text style={styles.promptLabel}>{storyDraft.title}</Text><Text style={styles.transcriptText}>{storyDraft.narrative}</Text>{storyDraft.factsToConfirm.map((fact, index) => <Text key={index} style={styles.privacy}>Needs confirmation: {fact}</Text>)}</>}{transcript && !saved && <Pressable onPress={preserveStory} disabled={busy} style={styles.transcribeButton}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.transcribeText}>Preserve this story in my archive</Text>}</Pressable>}{saved && <Text style={styles.privacy}>Saved to your local family archive.</Text>}</View> : <View style={styles.prompt}><Text style={styles.promptLabel}>A QUESTION TO GET STARTED</Text><Text style={styles.promptText}>What is a moment from your childhood that you still remember clearly?</Text></View>}
    <Text style={styles.privacy}>AI transcription sends a copy to your configured provider. Your original recording remains on this device.</Text>
    <Text style={styles.privacy}>Your voice recordings and memories remain securely on this device and within your private family vault.</Text>
  </Screen>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { color: colors.terra, fontWeight: "700", fontSize: 15 },
  headerLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
  center: { alignItems: "center", paddingTop: 26, gap: 17 },
  micHalo: { width: 86, height: 86, borderRadius: 43, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  mic: { color: colors.terra, fontSize: 39 },
  title: { color: colors.ink, fontSize: 27, fontWeight: "800", textAlign: "center", lineHeight: 33 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 280 },
  wave: { flexDirection: "row", alignItems: "center", height: 48, gap: 3, marginTop: 12 },
  bar: { width: 4, backgroundColor: colors.gold, borderRadius: 4, opacity: 0.85 },
  time: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  recordButton: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: colors.terra, alignItems: "center", justifyContent: "center", backgroundColor: "#F9EFE5", marginTop: 2 },
  stopButton: { backgroundColor: "#F2DCD2" },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.terra },
  hint: { color: colors.muted, fontSize: 12 },
  transcribeButton: { backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 13, minWidth: 190, alignItems: "center" },
  transcribeText: { color: colors.white, fontWeight: "700" },
  prompt: { backgroundColor: colors.surfaceWarm, padding: 17, borderRadius: radius.md, gap: 8, marginTop: 20 },
  promptLabel: { color: colors.terra, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  promptText: { color: colors.ink, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  transcript: { backgroundColor: colors.card, padding: 17, borderRadius: radius.md, gap: 8, marginTop: 20, borderWidth: 1, borderColor: colors.border },
  transcriptText: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  privacy: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15, marginTop: 15 }
});
