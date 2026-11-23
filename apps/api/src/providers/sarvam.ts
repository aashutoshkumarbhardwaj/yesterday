import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export interface TranscriptResult {
  provider: "sarvam";
  requestId?: string | undefined;
  transcript: string;
  languageCode?: string | null | undefined;
  diarizationAvailable: false;
  note: string;
}

function authHeaders() {
  if (!config.sarvamApiKey) throw new Error("SARVAM_API_KEY is not configured on the API server.");
  return { "api-subscription-key": config.sarvamApiKey };
}

async function sarvamJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.sarvam.ai${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Sarvam request failed (${response.status}).`);
  return payload;
}

function normalizeSarvamLanguageCode(code?: string): string | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase().trim();
  // Sarvam official API does not accept bho/bho-IN as standalone ISO codes, but its Hindi model
  // natively handles Bhojpuri, Maithili, Magahi, and Awadhi regional dialects and accents.
  if (c === "bho" || c === "bho-in" || c === "bhojpuri" || c === "awa" || c === "mag" || c === "mai") {
    return "hi-IN";
  }
  return code;
}

export async function transcribeShortAudio(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string;
  mode?: "transcribe" | "translate" | "verbatim" | "translit" | "codemix";
}): Promise<TranscriptResult> {
  const form = new FormData();
  let mimeType = input.mimeType || "audio/mp4";
  if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a") mimeType = "audio/mp4";
  form.append("file", new Blob([new Uint8Array(input.bytes)], { type: mimeType }), input.filename.endsWith(".m4a") ? input.filename : `${input.filename}.m4a`);
  form.append("model", "saaras:v4");
  form.append("mode", input.mode ?? "codemix");
  const normalizedLang = normalizeSarvamLanguageCode(input.languageCode);
  if (normalizedLang) form.append("language_code", normalizedLang);
  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST", headers: authHeaders(), body: form
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const errorMsg = payload.error?.message ?? payload.message ?? `Sarvam request failed (${response.status}).`;
    throw new Error(errorMsg);
  }
  const transcriptText = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
  return {
    provider: "sarvam",
    requestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
    transcript: transcriptText,
    languageCode: typeof payload.language_code === "string" ? payload.language_code : null,
    diarizationAvailable: false,
    note: transcriptText ? "Audio transcribed successfully." : "No clear speech was detected in this recording."
  };
}

export async function startBatchTranscription(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string;
  mode?: "transcribe" | "translate" | "verbatim" | "translit" | "codemix";
}) {
  const safeName = `${randomUUID()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
  const normalizedLang = normalizeSarvamLanguageCode(input.languageCode);
  const job = await sarvamJson("/speech-to-text/job/v1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_parameters: {
      model: "saaras:v4",
      mode: input.mode ?? "codemix",
      ...(normalizedLang ? { language_code: normalizedLang } : {}),
      with_diarization: true,
      with_timestamps: true
    } })
  });
  if (typeof job.job_id !== "string") throw new Error("Sarvam did not return a batch job ID.");

  const links = await sarvamJson("/speech-to-text/job/v1/upload-files", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: job.job_id, files: [safeName] })
  });
  const uploadUrl = links.upload_urls?.[safeName]?.file_url;
  if (typeof uploadUrl !== "string") throw new Error("Sarvam did not return an upload URL.");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob", "content-type": input.mimeType },
    body: new Uint8Array(input.bytes)
  });
  if (!uploadResponse.ok) throw new Error(`Audio upload to Sarvam failed (${uploadResponse.status}).`);

  await sarvamJson(`/speech-to-text/job/v1/${encodeURIComponent(job.job_id)}/start`, { method: "POST" });
  return { provider: "sarvam", jobId: job.job_id, status: "Running", diarization: true };
}

export async function getBatchTranscription(jobId: string) {
  const status = await sarvamJson(`/speech-to-text/job/v1/${encodeURIComponent(jobId)}/status`, { method: "GET" });
  const jobState = String(status.job_state ?? "Unknown");
  if (jobState !== "Completed" && jobState !== "PartiallyCompleted") {
    return { provider: "sarvam", jobId, status: jobState, transcript: null, diarizedEntries: [], error: status.error_message ?? null };
  }

  const outputNames: string[] = (status.job_details ?? []).flatMap((detail: any) =>
    (detail.outputs ?? []).map((output: any) => output.file_name).filter((name: unknown): name is string => typeof name === "string")
  );
  if (!outputNames.length) return { provider: "sarvam", jobId, status: jobState, transcript: null, diarizedEntries: [], error: "No successful transcript files were returned." };

  const downloads = await sarvamJson("/speech-to-text/job/v1/download-files", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: jobId, files: outputNames })
  });
  const transcripts: string[] = [];
  const diarizedEntries: Array<{ transcript: string; start_time_seconds: number; end_time_seconds: number; speaker_id: string }> = [];
  for (const name of outputNames) {
    const downloadUrl = downloads.download_urls?.[name]?.file_url;
    if (typeof downloadUrl !== "string") continue;
    const response = await fetch(downloadUrl);
    if (!response.ok) continue;
    const result = await response.json() as Record<string, any>;
    if (typeof result.transcript === "string") transcripts.push(result.transcript);
    const entries = result.diarized_transcript?.entries;
    if (Array.isArray(entries)) {
      for (const entry of entries) diarizedEntries.push({
        transcript: String(entry.transcript ?? ""),
        start_time_seconds: Number(entry.start_time_seconds ?? 0),
        end_time_seconds: Number(entry.end_time_seconds ?? 0),
        speaker_id: String(entry.speaker_id ?? "unknown")
      });
    }
  }
  return { provider: "sarvam", jobId, status: jobState, transcript: transcripts.join("\n"), diarizedEntries };
}
