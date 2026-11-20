export type SttProviderType = "sarvam" | "whisper" | "sherpa_onnx";

export interface AudioInput {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string | undefined;
  mode?: "transcribe" | "translate" | "codemix" | undefined;
  enableDiarization?: boolean | undefined;
}

export interface SpeakerSegment {
  speakerId: string;
  mappedPersonId?: string | null | undefined;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | undefined;
}

export interface UnifiedTranscriptionResult {
  provider: SttProviderType;
  transcript: string;
  languageCode?: string | null | undefined;
  segments: SpeakerSegment[];
  durationSeconds?: number | undefined;
  note: string;
}

export interface OnDeviceModelManifest {
  modelId: string;
  name: string;
  language: string;
  provider: "sherpa-onnx" | "whisper.cpp";
  sizeMb: number;
  minRamGb: number;
  recommendedHardware: string;
  license: string;
  downloadUrl: string;
}

export const SUPPORTED_OFFLINE_MODELS: OnDeviceModelManifest[] = [
  {
    modelId: "sherpa-onnx-indic-hindi-v1",
    name: "IndicConformer Hindi (Sherpa-ONNX)",
    language: "hi-IN",
    provider: "sherpa-onnx",
    sizeMb: 85,
    minRamGb: 2,
    recommendedHardware: "Budget Android (2GB+ RAM)",
    license: "Apache-2.0",
    downloadUrl: "https://huggingface.co/parismitaglobalsolutions/indicconformer-sherpa-onnx"
  },
  {
    modelId: "whisper-tiny-multilingual",
    name: "Whisper Tiny Quantized (Q5_0)",
    language: "multilingual (en, hi, etc.)",
    provider: "whisper.cpp",
    sizeMb: 39,
    minRamGb: 2,
    recommendedHardware: "Any device with 2GB+ RAM",
    license: "MIT",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp"
  },
  {
    modelId: "whisper-base-multilingual",
    name: "Whisper Base Quantized (Q5_1)",
    language: "multilingual",
    provider: "whisper.cpp",
    sizeMb: 78,
    minRamGb: 3,
    recommendedHardware: "Devices with 3GB+ RAM",
    license: "MIT",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp"
  }
];

export interface SpeakerMapping {
  conversationId: string;
  speakerId: string;
  personId: string;
  personName: string;
  confirmedBy: string;
  confirmedAt: string;
}

const speakerMappings = new Map<string, SpeakerMapping[]>();

export function saveSpeakerMapping(mapping: SpeakerMapping): void {
  const current = speakerMappings.get(mapping.conversationId) || [];
  const existingIdx = current.findIndex((m) => m.speakerId === mapping.speakerId);
  if (existingIdx >= 0) {
    current[existingIdx] = mapping;
  } else {
    current.push(mapping);
  }
  speakerMappings.set(mapping.conversationId, current);
}

export function getSpeakerMappings(conversationId: string): SpeakerMapping[] {
  return speakerMappings.get(conversationId) || [];
}

