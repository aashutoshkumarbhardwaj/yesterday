import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { detectActiveServerUrl, getServerUrl } from './sync-client';

const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

function headers() {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export interface ImageUnderstanding {
  description: string;
  visibleDetails: string[];
  possibleEra: string | null;
  questionsForFamily: string[];
  caution: string;
}

export interface StoryDraft {
  title: string;
  narrative: string;
  suggestedTags: string[];
  factsToConfirm: string[];
  sourceSummary: string;
}

export async function transcribeAudio(uri: string, filename = "family-recording.m4a") {
  const cleanUri = Platform.OS === 'android' && !uri.startsWith('file://') && !uri.startsWith('content://')
    ? `file://${uri}`
    : uri;
  const server = await detectActiveServerUrl();

  // 1. Preferred rock-solid Base64 JSON upload (bypasses Android OkHttp FormData parsing issues)
  try {
    const base64Audio = await FileSystem.readAsStringAsync(cleanUri, {
      encoding: 'base64' as any
    });
    if (base64Audio) {
      const response = await fetch(`${server}/v1/ai/transcribe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers()
        },
        body: JSON.stringify({
          audioBase64: base64Audio,
          filename,
          mimeType: "audio/mp4",
          mode: "codemix"
        })
      });
      return await parseResponse<{ transcript: string; languageCode?: string | null; note: string }>(response);
    }
  } catch (base64Err) {
    console.warn("Base64 audio upload attempt error, falling back to FormData:", base64Err);
  }

  // 2. FormData fallback
  const form = new FormData();
  form.append("file", { uri: cleanUri, name: filename, type: "audio/mp4" } as unknown as Blob);
  form.append("mode", "codemix");
  const response = await fetch(`${server}/v1/ai/transcribe`, {
    method: "POST",
    headers: headers(),
    body: form
  });
  return parseResponse<{ transcript: string; languageCode?: string | null; note: string }>(response);
}

export async function understandImage(uri: string, familyContext?: string, mimeType = "image/jpeg", filename = "family-photo.jpg") {
  const cleanUri = Platform.OS === 'android' && !uri.startsWith('file://') && !uri.startsWith('content://')
    ? `file://${uri}`
    : uri;
  const server = await detectActiveServerUrl();

  // 1. Try Base64 JSON first (reliable across all Expo versions)
  try {
    const base64Image = await FileSystem.readAsStringAsync(cleanUri, { encoding: 'base64' as any });
    if (base64Image) {
      const response = await fetch(`${server}/v1/ai/understand-image`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers() },
        body: JSON.stringify({ imageBase64: base64Image, mimeType, familyContext, filename })
      });
      return await parseResponse<ImageUnderstanding>(response);
    }
  } catch (base64Err) {
    console.warn("Base64 image upload attempt error, falling back to FormData:", base64Err);
  }

  // 2. FormData fallback
  const form = new FormData();
  form.append("file", { uri: cleanUri, name: filename, type: mimeType } as unknown as Blob);
  if (familyContext) form.append("familyContext", familyContext);
  const response = await fetch(`${server}/v1/ai/understand-image`, {
    method: "POST",
    headers: headers(),
    body: form
  });
  return parseResponse<ImageUnderstanding>(response);
}

export async function createStory(input: { transcript?: string; imageDescriptions?: string[]; familyContext?: string }) {
  const response = await fetch(`${getServerUrl()}/v1/ai/generate-story`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify(input)
  });
  return parseResponse<StoryDraft>(response);
}

export async function startBatchTranscription(uri: string, filename = "family-recording.m4a") {
  const form = new FormData();
  const cleanUri = Platform.OS === 'android' && !uri.startsWith('file://') && !uri.startsWith('content://')
    ? `file://${uri}`
    : uri;

  form.append("file", { uri: cleanUri, name: filename, type: "audio/m4a" } as unknown as Blob);
  const response = await fetch(`${getServerUrl()}/v1/ai/transcribe/batch`, {
    method: "POST",
    headers: headers(),
    body: form
  });
  return parseResponse<{ jobId: string; status: string; diarization: boolean }>(response);
}

export async function getBatchTranscription(jobId: string) {
  const response = await fetch(`${getServerUrl()}/v1/ai/transcribe/batch/${encodeURIComponent(jobId)}`, {
    headers: headers()
  });
  return parseResponse<{
    status: string;
    transcript: string | null;
    diarizedEntries: Array<{ transcript: string; start_time_seconds: number; end_time_seconds: number; speaker_id: string }>;
  }>(response);
}

// Fact Suggestions API
export interface RemoteSuggestion {
  id: string;
  familyId: string;
  factType: string;
  subjectPersonId?: string | null;
  subjectName?: string | null;
  objectPersonId?: string | null;
  objectName?: string | null;
  extractedValue: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'disputed';
  evidenceExcerpt?: string | null;
  createdAt: string;
}

export async function fetchSuggestions(familyId = 'default-family', status = 'pending') {
  const response = await fetch(`${getServerUrl()}/v1/graph/suggestions?familyId=${encodeURIComponent(familyId)}&status=${encodeURIComponent(status)}`, {
    headers: headers()
  });
  return parseResponse<{ suggestions: RemoteSuggestion[] }>(response);
}

export async function reviewSuggestion(id: string, action: 'approved' | 'rejected' | 'disputed', reviewedBy = 'user') {
  const response = await fetch(`${getServerUrl()}/v1/graph/suggestions/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify({ action, reviewedBy })
  });
  return parseResponse<{ success: boolean; status: string }>(response);
}

// Timeline & Evidence API
export interface PersonTimelineEvent {
  id: string;
  personId: string;
  eventType: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  place?: string | null;
  isCirca?: boolean;
}

export async function fetchPersonTimeline(personId: string) {
  const response = await fetch(`${getServerUrl()}/v1/graph/people/${encodeURIComponent(personId)}/timeline`, {
    headers: headers()
  });
  return parseResponse<{ events: PersonTimelineEvent[] }>(response);
}

export interface FactEvidenceItem {
  id: string;
  factType: string;
  extractedValue: Record<string, unknown>;
  sourceExcerpt?: string | null;
  sourceType: string;
  confidence: number;
  createdAt: string;
}

export async function fetchPersonEvidence(personId: string) {
  const response = await fetch(`${getServerUrl()}/v1/graph/people/${encodeURIComponent(personId)}/evidence`, {
    headers: headers()
  });
  return parseResponse<{ evidence: FactEvidenceItem[] }>(response);
}

// Document OCR API
export interface ProcessedDocumentResult {
  extractedText: string;
  documentType: string;
  datesMentioned: string[];
  placesMentioned: string[];
  peopleMentioned: string[];
  relationshipsInferred: Array<{ personA: string; personB: string; relation: string }>;
  suggestedFacts: Array<{ factType: string; details: Record<string, unknown>; confidence: number; excerpt: string }>;
}

export async function processDocumentOCR(uri: string, documentType = 'general', familyId = 'default-family') {
  const form = new FormData();
  const cleanUri = Platform.OS === 'android' && !uri.startsWith('file://') && !uri.startsWith('content://')
    ? `file://${uri}`
    : uri;

  form.append('file', { uri: cleanUri, name: 'document.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('documentType', documentType);
  form.append('familyId', familyId);

  const response = await fetch(`${getServerUrl()}/v1/ai/process-document`, {
    method: 'POST',
    headers: headers(),
    body: form
  });
  return parseResponse<ProcessedDocumentResult>(response);
}

// GEDCOM API
export async function previewGedcom(gedcomText: string, familyId = 'default-family') {
  const response = await fetch(`${getServerUrl()}/v1/genealogy/gedcom/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify({ gedcomText, familyId })
  });
  return parseResponse<{
    preview: {
      totalIndividuals: number;
      totalFamilies: number;
      samplePeople: Array<{ id: string; name: string; birthYear?: number; gender?: string }>;
      duplicateCandidates: Array<{ importedName: string; existingName: string; existingId: string; confidence: number; matchReason: string }>;
    };
  }>(response);
}

export async function importGedcom(gedcomText: string, familyId = 'default-family') {
  const response = await fetch(`${getServerUrl()}/v1/genealogy/gedcom/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify({ gedcomText, familyId })
  });
  return parseResponse<{ success: boolean; importedPeopleCount: number; importedFamiliesCount: number }>(response);
}

export async function exportGedcom(familyId = 'default-family') {
  const response = await fetch(`${getServerUrl()}/v1/genealogy/gedcom/export?familyId=${encodeURIComponent(familyId)}`, {
    headers: headers()
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  return response.text();
}

// Speaker Mapping & Audio Models
export async function mapSpeakerToPerson(input: {
  familyId: string;
  conversationId: string;
  speakerTag: string;
  personId: string;
  mappedBy?: string;
}) {
  const response = await fetch(`${getServerUrl()}/v1/ai/map-speaker`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify(input)
  });
  return parseResponse<{ success: boolean; mapping: unknown }>(response);
}

export async function fetchAudioModels() {
  const response = await fetch(`${getServerUrl()}/v1/ai/audio-models`, {
    headers: headers()
  });
  return parseResponse<{
    recommendedProvider: string;
    onDeviceCapable: boolean;
    models: Array<{ id: string; name: string; sizeMb: number; language: string; accuracyScore: number }>;
  }>(response);
}

// Conversational Agent & Live Tree Control API
export interface AgentChatApiResponse {
  reply: string;
  actionsExecuted: Array<{
    toolName: string;
    summary: string;
    result?: unknown;
  }>;
  graphUpdated: boolean;
  newOrientation?: 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left' | undefined;
  clarificationQuestion?: string | undefined;
}

export async function chatWithAgent(input: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  focusPersonId?: string;
  currentOrientation?: 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left';
  familyId?: string;
}) {
  const server = await detectActiveServerUrl();
  const response = await fetch(`${server}/v1/agent/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify(input)
  });
  return parseResponse<AgentChatApiResponse>(response);
}

export async function fetchRevisions(familyId = 'default-family') {
  const server = await detectActiveServerUrl();
  const response = await fetch(`${server}/v1/agent/revisions?familyId=${encodeURIComponent(familyId)}`, {
    headers: headers()
  });
  return parseResponse<{ revisions: Array<{ id: string; operation: string; targetEntity: string; timestamp: string; status: string; userInstruction?: string }> }>(response);
}

export async function undoAgentAction(revisionId: string, familyId = 'default-family') {
  const server = await detectActiveServerUrl();
  const response = await fetch(`${server}/v1/agent/undo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify({ revisionId, familyId })
  });
  return parseResponse<{ success: boolean; message: string }>(response);
}

export async function fetchKinship(targetPersonId: string, referencePersonId = 'user_default', familyId = 'default-family') {
  const server = await detectActiveServerUrl();
  const response = await fetch(
    `${server}/v1/genealogy/kinship?targetPersonId=${encodeURIComponent(targetPersonId)}&referencePersonId=${encodeURIComponent(referencePersonId)}&familyId=${encodeURIComponent(familyId)}`,
    { headers: headers() }
  );
  return parseResponse<{
    englishLabel: string;
    hindiLabel: string;
    canonicalType: string;
    generationOffset: number;
    lineage: string;
  }>(response);
}

export async function fetchGenealogyTree(familyId = 'default-family', referencePersonId = 'user_default', orientation = 'top_to_bottom') {
  const server = await detectActiveServerUrl();
  const response = await fetch(
    `${server}/v1/genealogy/tree?familyId=${encodeURIComponent(familyId)}&referencePersonId=${encodeURIComponent(referencePersonId)}&orientation=${encodeURIComponent(orientation)}`,
    { headers: headers() }
  );
  return parseResponse<{
    familyId: string;
    orientation: string;
    people: Array<{ id: string; displayName: string; birthYear?: number; kinshipLabel?: string; kinshipHindi?: string }>;
    relationships: Array<{ id: string; fromPersonId: string; toPersonId: string; type: string }>;
  }>(response);
}

export {
  addCommentClient,
  listCommentsClient,
  deleteCommentClient,
  toggleReactionClient,
  listReactionsClient,
  addStoryContributionClient,
  listStoryContributionsClient,
  createShareTokenClient,
  getPrintableTreeUrl,
  createInvitationClient,
  listInvitationsClient,
  revokeInvitationClient,
  resendInvitationClient,
  fetchFamilyActivity,
  listNotificationsClient,
  markNotificationReadClient,
  markAllNotificationsReadClient
} from './sync-client';
