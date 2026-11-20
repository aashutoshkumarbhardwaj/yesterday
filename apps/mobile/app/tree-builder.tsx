import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Screen } from '../src/components/Screen';
import { colors, radius } from '../src/theme';
import { FamilyTreeVisualizer } from '../src/components/FamilyTreeVisualizer';
import { chatWithAgent, transcribeAudio, type AgentChatApiResponse } from '../src/lib/api';
import {
  clearTreeMessages,
  deletePerson,
  listPeople,
  listRelationships,
  listTreeMessages,
  saveTreeMessage,
  upsertTreeEntities,
  type FamilyRelationship,
  type Person,
  type SuggestedPerson,
  type SuggestedRelationship
} from '../src/lib/database';
import { interviewTreeAgent, type TreeInterviewResponse } from '../src/lib/family-ai';
import { getServerUrl, setServerUrl, syncWithCloud, testServerConnection } from '../src/lib/sync-client';

interface MessageUI {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  extractedPeople?: SuggestedPerson[] | undefined;
  extractedRelationships?: SuggestedRelationship[] | undefined;
  conflicts?: Array<{ type: string; message: string }> | undefined;
  suggestedQuestions?: string[] | undefined;
  actionsExecuted?: Array<{ toolName: string; summary: string; result?: unknown }> | undefined;
  isRefusal?: boolean | undefined;
}

const RELATION_OPTIONS = [
  'Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Son', 'Daughter',
  'Paternal Grandfather (Dada)', 'Paternal Grandmother (Dadi)',
  'Maternal Grandfather (Nana)', 'Maternal Grandmother (Nani)',
  'Uncle', 'Aunt'
];

export default function TreeBuilderScreen() {
  const [viewMode, setViewMode] = useState<'chat' | 'tree'>('chat');
  const [inputMessage, setInputMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([
    'My father is Ramesh Sharma',
    'My mother is Sunita Sharma',
    'My paternal grandfather is Dina Nath',
    'Who is in my family tree right now?'
  ]);
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);

  // Add Relative Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualRelation, setManualRelation] = useState('Father');
  const [manualGender, setManualGender] = useState<'male' | 'female' | 'other'>('male');
  const [manualBirthYear, setManualBirthYear] = useState('');
  const [manualBirthPlace, setManualBirthPlace] = useState('');

  // Server Settings Modal State
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [serverInputUrl, setServerInputUrl] = useState(getServerUrl());
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
  const [serverTesting, setServerTesting] = useState(false);

  const scrollViewRef = useRef<any>(null);

  // Audio Recorder Setup
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);

  const refreshTree = useCallback(async () => {
    try {
      const [allPeople, allRels] = await Promise.all([listPeople(), listRelationships()]);
      setPeople(allPeople);
      setRelationships(allRels);
    } catch (err) {
      console.error('Failed to load family graph:', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const stored = await listTreeMessages();
      if (stored.length > 0) {
        const mapped: MessageUI[] = stored.map((m) => {
          let extra: any = {};
          if (m.extractedJson) {
            try {
              extra = JSON.parse(m.extractedJson);
            } catch {
              // ignore
            }
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            extractedPeople: extra.extractedPeople,
            extractedRelationships: extra.extractedRelationships?.map((r: any) => ({
              personA: r.personA,
              personB: r.personB,
              type: r.relation || r.type,
              evidence: r.evidence
            })),
            conflicts: extra.conflicts,
            suggestedQuestions: extra.suggestedQuestions,
            actionsExecuted: extra.actionsExecuted,
            isRefusal: extra.isRefusal
          };
        });
        setMessages(mapped);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load tree messages:', err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    refreshTree();
  }, [loadHistory, refreshTree]);

  // Handle sending message to agent
  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputMessage).trim();
    if (!text || busy) return;

    setInputMessage('');
    setBusy(true);

    const userMsgId = `usr-${Date.now()}`;
    const newHistory: MessageUI[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: text }
    ];
    setMessages(newHistory);
    await saveTreeMessage('user', text);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      let isRefusal = false;
      const lowerText = text.toLowerCase();
      if (/\b(delete|remove|erase|drop|destroy|purge|wipe|kill)\b/.test(lowerText)) {
        isRefusal = true;
      }

      // 1. First attempt to call the full Agentic Family Subsystem on the backend
      let assistantMsg: MessageUI | null = null;
      try {
        const agentRes = await chatWithAgent({
          message: text,
          history: newHistory.slice(-8).map((m) => ({ role: m.role, content: m.content }))
        });

        if (agentRes && agentRes.reply) {
          if (agentRes.reply.includes('cannot delete') || agentRes.reply.includes('Heritage preservation policy')) {
            isRefusal = true;
          }

          if (agentRes.graphUpdated) {
            // Sync with backend & refresh local tree
            try {
              await syncWithCloud();
            } catch {
              // fallback
            }
            await refreshTree();
          }

          if (agentRes.clarificationQuestion) {
            setSuggestions([agentRes.clarificationQuestion]);
          }

          assistantMsg = {
            id: `ast-${Date.now()}`,
            role: 'assistant',
            content: agentRes.reply,
            actionsExecuted: agentRes.actionsExecuted,
            isRefusal
          };
        }
      } catch (agentErr) {
        console.warn('Backend agent chat call failed, falling back to local family-ai:', agentErr);
      }

      // 2. Fallback to local family-ai interview if backend agent was unreachable
      if (!assistantMsg) {
        const currentDbPeople = await listPeople();
        const currentDbRels = await listRelationships();

        const response = await interviewTreeAgent({
          message: text,
          history: newHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          currentPeople: currentDbPeople.map((p) => ({
            id: p.id,
            name: p.name,
            gender: p.gender ?? undefined,
            relationshipToUser: p.relationship ?? undefined
          })),
          currentRelationships: currentDbRels.map((r) => ({
            id: r.id,
            personA: r.personA,
            personB: r.personB,
            relation: r.relation,
            evidence: r.evidence ?? undefined
          }))
        });

        // Upsert any detected people/relationships
        if (response.extractedPeople?.length || response.extractedRelationships?.length) {
          await upsertTreeEntities(
            response.extractedPeople || [],
            (response.extractedRelationships || []).map(r => ({
              personA: r.personA,
              personB: r.personB,
              type: r.relation,
              evidence: r.evidence
            }))
          );
          await refreshTree();
        }

        if (response.suggestedQuestions?.length) {
          setSuggestions(response.suggestedQuestions);
        }

        assistantMsg = {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
          extractedPeople: response.extractedPeople,
          extractedRelationships: response.extractedRelationships?.map(r => ({
            personA: r.personA,
            personB: r.personB,
            type: r.relation,
            evidence: r.evidence
          })),
          conflicts: response.conflicts,
          suggestedQuestions: response.suggestedQuestions,
          isRefusal
        };
      }

      setMessages((prev) => [...prev, assistantMsg!]);
      await saveTreeMessage('assistant', assistantMsg.content, JSON.stringify(assistantMsg));
    } catch (err) {
      console.error('Tree interview error:', err);
      const fallbackMsg: MessageUI = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `I received: "${text}". I have logged this to your family history. (${err instanceof Error ? err.message : 'Backend offline'}). You can tap Settings in the top bar to test connection.`
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      await saveTreeMessage('assistant', fallbackMsg.content);
    } finally {
      setBusy(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // Voice recording toggle with live visual feedback
  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      try {
        await recorder.stop();
        const recordedUri = recorder.uri;
        if (recordedUri) {
          setTranscribing(true);
          try {
            const result = await transcribeAudio(recordedUri);
            if (result.transcript?.trim()) {
              await sendMessage(result.transcript.trim());
            } else {
              Alert.alert(
                'No speech detected',
                'We could not detect clear words. Please try speaking closer to the microphone, or type your message.'
              );
            }
          } catch (e) {
            Alert.alert(
              'Audio transcription error',
              e instanceof Error
                ? `${e.message}\n\nTip: Make sure phone and laptop are on the same Wi-Fi, or update server URL in Settings.`
                : 'Could not transcribe speech. Please try again.'
            );
          } finally {
            setTranscribing(false);
          }
        }
      } catch (err) {
        console.error('Failed to stop recording:', err);
      }
    } else {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Microphone needed', 'Please allow microphone access to talk with your family historian.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (err) {
        Alert.alert('Could not start recording', err instanceof Error ? err.message : 'Try again.');
      }
    }
  };

  // Manual Add Person handler
  const handleManualAdd = async () => {
    const trimmed = manualName.trim();
    if (!trimmed) {
      Alert.alert('Name Required', 'Please enter your relative’s name.');
      return;
    }

    const birthYearNum = manualBirthYear.trim() ? parseInt(manualBirthYear.trim(), 10) : null;
    const relObj: SuggestedPerson = {
      name: trimmed,
      relationshipToNarrator: manualRelation,
      gender: manualGender,
      birthYear: birthYearNum,
      birthPlace: manualBirthPlace.trim() || null
    };

    let relationshipType = 'other';
    if (manualRelation === 'Father' || manualRelation === 'Mother') relationshipType = 'parent';
    else if (manualRelation === 'Brother' || manualRelation === 'Sister') relationshipType = 'sibling';
    else if (manualRelation === 'Spouse') relationshipType = 'spouse';
    else if (manualRelation === 'Son' || manualRelation === 'Daughter') relationshipType = 'child';

    const relLink: SuggestedRelationship = {
      personA: trimmed,
      personB: 'Me',
      type: relationshipType,
      evidence: `Added as ${manualRelation}`
    };

    await upsertTreeEntities([relObj], [relLink]);
    await refreshTree();

    setIsAddModalOpen(false);
    setManualName('');
    setManualBirthYear('');
    setManualBirthPlace('');

    // Inform conversation
    const noteMsg = `I just manually added ${trimmed} (${manualRelation}) to our family tree!`;
    await sendMessage(noteMsg);
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Chat History?',
      'This will clear your interview chat history. All relatives and connections in your family tree will stay safely preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Chat',
          style: 'destructive',
          onPress: async () => {
            await clearTreeMessages();
            loadHistory();
          }
        }
      ]
    );
  };

  const handleDeleteRelative = async (id: string) => {
    await deletePerson(id);
    await refreshTree();
  };

  // Server test connection
  const handleTestServer = async () => {
    setServerTesting(true);
    setServerStatusMessage(null);
    const result = await testServerConnection(serverInputUrl);
    setServerTesting(false);
    setServerStatusMessage(result.message);
  };

  const handleSaveServer = () => {
    setServerUrl(serverInputUrl);
    setIsServerModalOpen(false);
    Alert.alert('Server URL Updated', `Saved: ${serverInputUrl}`);
  };

  const recordingSeconds = Math.floor(recorderState.durationMillis / 1000);
  const recordingTimerFormatted = `${Math.floor(recordingSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        {/* Top Navbar */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Family Historian</Text>
            <Text style={styles.headerTitle}>Oral History Interview</Text>
            <View style={styles.statusBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.headerSubtitle}>{people.length} Relatives Mapped</Text>
              <Text style={styles.headerSubtitle}>{people.length} in Family Tree</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                setServerInputUrl(getServerUrl());
                setServerStatusMessage(null);
                setIsServerModalOpen(true);
              }}
              style={styles.iconBtn}
            >
              <Ionicons name="server-outline" size={19} color={colors.terra} />
              <Ionicons name="settings-outline" size={18} color={colors.muted} />
            </Pressable>

            <Pressable onPress={() => setIsAddModalOpen(true)} style={styles.headerAddBtn}>
              <Ionicons name="person-add-outline" size={18} color={colors.terra} />
            </Pressable>

            <Pressable onPress={handleReset} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* View Mode Toggle */}
        <View style={styles.switcher}>
          <Pressable
            onPress={() => setViewMode('chat')}
            style={[styles.switchOption, viewMode === 'chat' && styles.switchOptionActive]}
          >
            <Ionicons name="chatbubbles" size={15} color={viewMode === 'chat' ? colors.white : colors.ink} />
            <Ionicons name="mic-outline" size={15} color={viewMode === 'chat' ? colors.white : colors.ink} />
            <Text style={[styles.switchText, viewMode === 'chat' && styles.switchTextActive]}>
              Oral Interview
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('tree')}
            style={[styles.switchOption, viewMode === 'tree' && styles.switchOptionActive]}
          >
            <Ionicons name="git-network" size={15} color={viewMode === 'tree' ? colors.white : colors.ink} />
            <Ionicons name="git-network-outline" size={15} color={viewMode === 'tree' ? colors.white : colors.ink} />
            <Text style={[styles.switchText, viewMode === 'tree' && styles.switchTextActive]}>
              Visual Tree ({people.length})
              Living Tree ({people.length})
            </Text>
          </Pressable>
        </View>

        {/* CHAT INTERVIEW MODE */}
        {viewMode === 'chat' ? (
          <View style={styles.chatArea}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesScroll}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            >
              {/* If no messages, show welcoming starter cards */}
              {messages.length === 0 ? (
                <View style={styles.welcomeHero}>
                  <View style={styles.welcomeIconWrap}>
                    <Ionicons name="mic-circle" size={48} color={colors.terra} />
                  </View>
                  <Text style={styles.welcomeTitle}>Speak or Type Your Family Story</Text>
                  <Text style={styles.welcomeTitle}>Preserve Your Family’s Living Voices</Text>
                  <Text style={styles.welcomeBody}>
                    Tell me about your parents, grandparents, siblings, or spouse. You can speak in English or Hindi (or any Indian language). I will extract names and link them into your family tree!
                    Speak naturally in your mother tongue or write memories down. Mention elders, childhood hometowns, migrations, or weddings. We will carefully weave every relative into your living family archive.
                  </Text>

                  <View style={styles.starterCardsContainer}>
                    <Text style={styles.starterLabel}>TAP A STARTER TO TRY:</Text>
                    <Text style={styles.starterLabel}>TRY TELLING A MEMORY:</Text>
                    <Pressable
                      onPress={() => sendMessage('My father is Ramesh Sharma and my mother is Sunita')}
                      onPress={() => sendMessage('My father Ramesh Sharma and my mother Sunita were married in 1974')}
                      style={styles.starterCard}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.terra} />
                      <Text style={styles.starterCardText}>"My father is Ramesh Sharma and my mother is Sunita"</Text>
                      <Text style={styles.starterCardText}>"My father Ramesh Sharma and my mother Sunita were married in 1974"</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => sendMessage('My paternal grandfather is Dina Nath from Jaipur')}
                      onPress={() => sendMessage('My paternal grandfather Dina Nath lived in Varanasi and had three sons')}
                      style={styles.starterCard}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.terra} />
                      <Text style={styles.starterCardText}>"My paternal grandfather is Dina Nath from Jaipur"</Text>
                      <Text style={styles.starterCardText}>"My paternal grandfather Dina Nath lived in Varanasi and had three sons"</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => sendMessage('Who is in my family tree right now?')}
                      onPress={() => sendMessage('Who is currently documented in our family tree?')}
                      style={styles.starterCard}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.green} />
                      <Text style={styles.starterCardText}>"Who is in my family tree right now?"</Text>
                      <Text style={styles.starterCardText}>"Who is currently documented in our family tree?"</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {messages.map((m) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.messageBubbleWrap,
                      isAssistant ? styles.bubbleWrapAssistant : styles.bubbleWrapUser
                    ]}
                  >
                    {isAssistant ? (
                      <View style={styles.assistantAvatar}>
                        <Ionicons name="sparkles" size={14} color={colors.terra} />
                        <Ionicons name="book-outline" size={13} color={colors.terra} />
                      </View>
                    ) : null}

                    <View style={[styles.messageBubble, isAssistant ? styles.bubbleAssistant : styles.bubbleUser]}>
                      <Text style={[styles.messageText, isAssistant ? styles.textAssistant : styles.textUser]}>
                        {m.content}
                      </Text>

                      {/* Conflict Alert Banner */}
                      {m.conflicts && m.conflicts.length > 0 ? (
                        <View style={styles.conflictBox}>
                          <Ionicons name="warning" size={15} color="#A23A2A" />
                          <Ionicons name="alert-circle-outline" size={15} color="#A23A2A" />
                          <Text style={styles.conflictText}>{m.conflicts[0]?.message}</Text>
                        </View>
                      ) : null}

                      {/* Added Relatives Pills */}
                      {m.extractedPeople && m.extractedPeople.length > 0 ? (
                        <View style={styles.extractedBox}>
                          <Text style={styles.extractedLabel}>ADDED TO TREE</Text>
                          <Text style={styles.extractedLabel}>ADDED TO LINEAGE</Text>
                          <View style={styles.chipsRow}>
                            {m.extractedPeople.map((p, idx) => (
                              <View key={idx} style={styles.personChip}>
                                <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                                <Text style={styles.chipText}>
                                  {p.name} {p.relationshipToNarrator ? `(${p.relationshipToNarrator})` : ''}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}

                      {/* Extracted Relationships */}
                      {m.extractedRelationships && m.extractedRelationships.length > 0 ? (
                        <View style={styles.extractedBox}>
                          <View style={styles.chipsRow}>
                            {m.extractedRelationships.map((r, idx) => (
                              <View key={idx} style={styles.relChip}>
                                <Ionicons name="link" size={12} color={colors.terra} />
                                <Ionicons name="git-commit-outline" size={12} color={colors.terra} />
                                <Text style={styles.chipText}>
                                  {r.personA} ➔ {r.type} ➔ {r.personB}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}

                      {/* Agent Action Execution Card */}
                      {m.actionsExecuted && m.actionsExecuted.length > 0 ? (
                        <View style={styles.actionCard}>
                          <View style={styles.actionHeader}>
                            <Ionicons name="flash" size={14} color={colors.terra} />
                            <Text style={styles.actionHeaderTitle}>AGENT ACTIONS EXECUTED</Text>
                            <Ionicons name="bookmark-outline" size={14} color={colors.terra} />
                            <Text style={styles.actionHeaderTitle}>RECORDED IN FAMILY ARCHIVE</Text>
                          </View>
                          {m.actionsExecuted.map((act, aIdx) => (
                            <View key={aIdx} style={styles.actionRow}>
                              <Ionicons name="checkmark-done-circle" size={14} color={colors.green} />
                              <Text style={styles.actionSummaryText}>{act.summary}</Text>
                            </View>
                          ))}
                          <Pressable onPress={() => setViewMode('tree')} style={styles.viewInTreeBtn}>
                            <Ionicons name="git-network-outline" size={13} color={colors.white} />
                            <Text style={styles.viewInTreeText}>View in Family Tree</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {/* Heritage Protection Refusal Banner */}
                      {m.isRefusal ? (
                        <View style={styles.refusalCard}>
                          <View style={styles.refusalHeader}>
                            <Ionicons name="shield-checkmark" size={15} color="#A23A2A" />
                            <Text style={styles.refusalTitle}>Heritage Preservation Guardrail</Text>
                            <Ionicons name="shield-checkmark-outline" size={15} color="#A23A2A" />
                            <Text style={styles.refusalTitle}>Family Archive Protected</Text>
                          </View>
                          <Text style={styles.refusalBody}>
                            The AI Agent cannot delete relatives, memories, or lineage records to prevent accidental loss of heritage. Use the tree screen to manage profiles directly.
                            Family lineage records are protected against accidental removal. You can safely edit names or add notes directly in your family tree.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {busy ? (
                <View style={styles.typingRow}>
                  <ActivityIndicator size="small" color={colors.terra} />
                  <Text style={styles.typingText}>Historian is connecting relatives and memories...</Text>
                  <Text style={styles.typingText}>Carefully documenting your family memories...</Text>
                </View>
              ) : null}
            </ScrollView>

            {/* LIVE RECORDING OVERLAY BANNER */}
            {recorderState.isRecording ? (
              <View style={styles.recordingBanner}>
                <View style={styles.recDot} />
                <Text style={styles.recTimer}>{recordingTimerFormatted}</Text>
                <Text style={styles.recText} numberOfLines={1}>Recording voice... Speak clearly</Text>
                <Text style={styles.recText} numberOfLines={1}>Recording voice memory...</Text>
                <Pressable onPress={toggleRecording} style={styles.stopRecordingBtn}>
                  <Text style={styles.stopRecordingBtnText}>Finish & Send</Text>
                  <Text style={styles.stopRecordingBtnText}>Finish & Save</Text>
                </Pressable>
              </View>
            ) : null}

            {/* TRANSCRIBING SPINNER */}
            {transcribing ? (
              <View style={styles.transcribingBanner}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.transcribingText}>Transcribing speech with Sarvam AI...</Text>
                <Text style={styles.transcribingText}>Listening and transcribing your voice memory...</Text>
              </View>
            ) : null}

            {/* QUICK SUGGESTIONS SCROLL */}
            {!recorderState.isRecording && !transcribing && suggestions.length > 0 ? (
              <View style={styles.suggestionsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
                  {suggestions.map((q, idx) => (
                    <Pressable key={idx} onPress={() => sendMessage(q)} style={styles.suggestionPill}>
                      <Ionicons name="add-circle-outline" size={13} color={colors.terra} />
                      <Text style={styles.suggestionPillText}>{q}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* PINNED COMPOSER BAR AT BOTTOM */}
            <View style={styles.composerWrap}>
              <Pressable
                onPress={toggleRecording}
                style={[
                  styles.voiceButton,
                  recorderState.isRecording && styles.voiceButtonActive
                ]}
              >
                <Ionicons
                  name={recorderState.isRecording ? 'square' : 'mic'}
                  size={20}
                  color={colors.white}
                />
              </Pressable>

              <TextInput
                value={inputMessage}
                onChangeText={setInputMessage}
                placeholder={recorderState.isRecording ? 'Listening to your voice...' : 'Tell me a family member or ask...'}
                placeholder={recorderState.isRecording ? 'Listening to your voice...' : 'Share an elder’s memory, hometown, or family name...'}
                placeholderTextColor={colors.muted}
                style={styles.textInput}
                multiline
                onSubmitEditing={() => sendMessage()}
              />

              <Pressable
                onPress={() => sendMessage()}
                disabled={!inputMessage.trim() || busy}
                style={[styles.sendButton, (!inputMessage.trim() || busy) && styles.sendButtonDisabled]}
              >
                <Ionicons name="arrow-up" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        ) : (
          /* TREE VIEW MODE */
          <View style={styles.treeArea}>
            <View style={styles.treeHeaderBar}>
              <Text style={styles.treeHeaderTitle}>FAMILY HIERARCHY</Text>
              <Pressable onPress={() => setIsAddModalOpen(true)} style={styles.addRelativePill}>
                <Ionicons name="add" size={14} color={colors.white} />
                <Text style={styles.addRelativePillText}>Add Relative</Text>
              </Pressable>
            </View>
            <FamilyTreeVisualizer
              people={people}
              relationships={relationships}
              onDeletePerson={handleDeleteRelative}
              onRefresh={refreshTree}
            />
          </View>
        )}

        {/* MANUAL ADD RELATIVE MODAL */}
        <Modal
          visible={isAddModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsAddModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Ionicons name="person-add" size={20} color={colors.terra} />
                  <Text style={styles.modalTitle}>Add Relative to Tree</Text>
                </View>
                <Pressable onPress={() => setIsAddModalOpen(false)}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                <Text style={styles.inputLabel}>FULL NAME *</Text>
                <TextInput
                  value={manualName}
                  onChangeText={setManualName}
                  placeholder="e.g. Ramesh Sharma"
                  placeholderTextColor={colors.muted}
                  style={styles.modalInput}
                />

                <Text style={styles.inputLabel}>RELATIONSHIP TO YOU *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relOptionsScroll}>
                  {RELATION_OPTIONS.map((rel) => (
                    <Pressable
                      key={rel}
                      onPress={() => setManualRelation(rel)}
                      style={[styles.relOptionPill, manualRelation === rel && styles.relOptionPillActive]}
                    >
                      <Text style={[styles.relOptionText, manualRelation === rel && styles.relOptionTextActive]}>
                        {rel}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>GENDER</Text>
                <View style={styles.genderRow}>
                  {(['male', 'female', 'other'] as const).map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setManualGender(g)}
                      style={[styles.genderPill, manualGender === g && styles.genderPillActive]}
                    >
                      <Text style={[styles.genderText, manualGender === g && styles.genderTextActive]}>
                        {g.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.inputLabel}>BIRTH YEAR (OPTIONAL)</Text>
                <TextInput
                  value={manualBirthYear}
                  onChangeText={setManualBirthYear}
                  placeholder="e.g. 1968"
                  keyboardType="numeric"
                  placeholderTextColor={colors.muted}
                  style={styles.modalInput}
                />

                <Text style={styles.inputLabel}>BIRTH PLACE / HOMETOWN (OPTIONAL)</Text>
                <TextInput
                  value={manualBirthPlace}
                  onChangeText={setManualBirthPlace}
                  placeholder="e.g. Varanasi, India"
                  placeholderTextColor={colors.muted}
                  style={styles.modalInput}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable onPress={() => setIsAddModalOpen(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleManualAdd} style={styles.modalSaveBtn}>
                  <Text style={styles.modalSaveText}>Add to Tree</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* SERVER SETTINGS MODAL */}
        <Modal
          visible={isServerModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsServerModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Ionicons name="server" size={20} color={colors.terra} />
                  <Text style={styles.modalTitle}>API Server Settings</Text>
                </View>
                <Pressable onPress={() => setIsServerModalOpen(false)}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>

              <Text style={styles.settingsExplainer}>
                Your mobile app communicates with the Yesterday API server for Sarvam STT voice transcription, AI interview, and cloud sync.
              </Text>

              <Text style={styles.inputLabel}>SERVER URL (IP & PORT)</Text>
              <TextInput
                value={serverInputUrl}
                onChangeText={setServerInputUrl}
                placeholder="https://...trycloudflare.com or http://192.168.1.87:3333"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.modalInput}
              />

              <Pressable
                onPress={() => setServerInputUrl('https://butler-conjunction-homeland-george.trycloudflare.com')}
                style={styles.quickTunnelPill}
              >
                <Ionicons name="cloud-done" size={14} color={colors.white} />
                <Text style={styles.quickTunnelText}>Use Active Cloudflare Tunnel (HTTPS)</Text>
              </Pressable>

              <Pressable
                onPress={handleTestServer}
                disabled={serverTesting}
                style={styles.testPingBtn}
              >
                {serverTesting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="pulse" size={16} color={colors.white} />
                    <Text style={styles.testPingText}>Test Server Connection</Text>
                  </>
                )}
              </Pressable>

              {serverStatusMessage ? (
                <View style={styles.serverStatusBox}>
                  <Text style={styles.serverStatusText}>{serverStatusMessage}</Text>
                </View>
              ) : null}

              <View style={styles.modalFooter}>
                <Pressable onPress={() => setIsServerModalOpen(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveServer} style={styles.modalSaveBtn}>
                  <Text style={styles.modalSaveText}>Save URL</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: {
    padding: 6
  },
  headerTitleWrap: {
    alignItems: 'center',
    gap: 2
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600'
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  headerAddBtn: {
    padding: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginVertical: 8
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
  switchOptionActive: {
    backgroundColor: colors.terra
  },
  switchText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700'
  },
  switchTextActive: {
    color: colors.white
  },
  chatArea: {
    flex: 1,
    justifyContent: 'space-between'
  },
  treeArea: {
    flex: 1
  },
  treeHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  treeHeaderTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  addRelativePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.terra,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  addRelativePillText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800'
  },
  messagesScroll: {
    flex: 1
  },
  messagesContent: {
    paddingVertical: 8,
    gap: 12,
    flexGrow: 1
  },
  welcomeHero: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    padding: 18,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#EBDCCE'
  },
  welcomeIconWrap: {
    marginBottom: 6
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6
  },
  welcomeBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14
  },
  starterCardsContainer: {
    width: '100%',
    gap: 8
  },
  starterLabel: {
    color: colors.terra,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 2
  },
  starterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  starterCardText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  messageBubbleWrap: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: '88%'
  },
  bubbleWrapAssistant: {
    alignSelf: 'flex-start'
  },
  bubbleWrapUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end'
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3
  },
  messageBubble: {
    padding: 12,
    borderRadius: radius.md,
    gap: 6
  },
  bubbleAssistant: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4
  },
  bubbleUser: {
    backgroundColor: colors.terra,
    borderTopRightRadius: 4
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19
  },
  textAssistant: {
    color: colors.ink
  },
  textUser: {
    color: colors.white
  },
  conflictBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDEAE8',
    padding: 8,
    borderRadius: 8
  },
  conflictText: {
    color: '#A23A2A',
    fontSize: 11,
    fontWeight: '600',
    flex: 1
  },
  extractedBox: {
    gap: 4,
    marginTop: 4
  },
  extractedLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDF5EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  relChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF4ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  chipText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700'
  },
  actionCard: {
    backgroundColor: '#F5EFE6',
    borderWidth: 1,
    borderColor: '#E2D3BE',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    gap: 6
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  actionHeaderTitle: {
    color: colors.terra,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  actionSummaryText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
    flex: 1
  },
  viewInTreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.terra,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 4
  },
  viewInTreeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700'
  },
  refusalCard: {
    backgroundColor: '#FDF2F0',
    borderLeftWidth: 3,
    borderLeftColor: '#C95D4A',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    gap: 4
  },
  refusalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  refusalTitle: {
    color: '#9C3627',
    fontSize: 11,
    fontWeight: '800'
  },
  refusalBody: {
    color: '#662319',
    fontSize: 11,
    lineHeight: 16
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10
  },
  typingText: {
    color: colors.muted,
    fontSize: 11,
    fontStyle: 'italic'
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C95D4A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 8
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF'
  },
  recTimer: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14
  },
  recText: {
    color: colors.white,
    fontSize: 12,
    flex: 1
  },
  stopRecordingBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  stopRecordingBtnText: {
    color: colors.terra,
    fontWeight: '800',
    fontSize: 11
  },
  transcribingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.terra,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8
  },
  transcribingText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12
  },
  suggestionsContainer: {
    paddingVertical: 4
  },
  suggestionsScroll: {
    gap: 8
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999
  },
  suggestionPillText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600'
  },
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 8,
    marginTop: 4,
    marginBottom: 4
  },
  voiceButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center'
  },
  voiceButtonActive: {
    backgroundColor: '#D93829'
  },
  textInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    minHeight: 38,
    maxHeight: 90,
    paddingTop: 8,
    paddingBottom: 8
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#E0D6CE'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 14
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink
  },
  settingsExplainer: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.1,
    marginTop: 6
  },
  modalInput: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border
  },
  relOptionsScroll: {
    gap: 8,
    paddingVertical: 4
  },
  relOptionPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border
  },
  relOptionPillActive: {
    backgroundColor: colors.terra,
    borderColor: colors.terra
  },
  relOptionText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600'
  },
  relOptionTextActive: {
    color: colors.white
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8
  },
  genderPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  genderPillActive: {
    backgroundColor: colors.terra,
    borderColor: colors.terra
  },
  genderText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink
  },
  genderTextActive: {
    color: colors.white
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  modalCancelText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13
  },
  modalSaveBtn: {
    backgroundColor: colors.terra,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md
  },
  modalSaveText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 13
  },
  testPingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginTop: 4
  },
  quickTunnelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F38020',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    marginTop: 4
  },
  quickTunnelText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800'
  },
  testPingText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 13
  },
  serverStatusBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  serverStatusText: {
    fontSize: 12,
    color: colors.ink,
    textAlign: 'center'
  }
});
