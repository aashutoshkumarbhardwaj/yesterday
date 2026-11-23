import { config } from "../config.js";

async function geminiRequest(model: string, method: string, body: unknown) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured on the API server.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}?key=${encodeURIComponent(config.geminiApiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const message = payload.error?.message ?? `Gemini request failed (${response.status}).`;
    throw new Error(String(message));
  }
  return payload;
}

function responseText(payload: Record<string, any>): string {
  return (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("\n").trim();
}

export interface ImageUnderstanding {
  description: string;
  visibleDetails: string[];
  possibleEra: string | null;
  questionsForFamily: string[];
  caution: string;
}

export async function understandImage(input: { bytes: Buffer; mimeType: string; familyContext?: string }) {
  const prompt = `You are helping preserve a family's history. Describe only what is visually supported. Do not identify real people, infer their names or relationships, or invent dates, locations, events, or emotions. Return JSON with description (string), visibleDetails (string array), possibleEra (string or null; only if visual evidence supports a cautious estimate), questionsForFamily (string array), and caution (string). Family-provided context: ${input.familyContext ?? "None supplied"}. Clearly separate observation from uncertainty.`;
  const payload = await geminiRequest(config.geminiModel, "generateContent", {
    contents: [{ parts: [
      { inlineData: { mimeType: input.mimeType, data: input.bytes.toString("base64") } },
      { text: prompt }
    ] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  });
  const text = responseText(payload);
  if (!text) throw new Error("Gemini returned no image description.");
  try {
    return JSON.parse(text) as ImageUnderstanding;
  } catch {
    return { description: text, visibleDetails: [], possibleEra: null, questionsForFamily: [], caution: "The model response was not valid structured JSON. Review it before saving." };
  }
}

export interface StoryDraft {
  title: string;
  narrative: string;
  suggestedTags: string[];
  factsToConfirm: string[];
  sourceSummary: string;
}

export async function generateStory(input: {
  transcript?: string | undefined;
  imageDescriptions?: string[] | undefined;
  familyContext?: string | undefined;
  style?: "warm" | "simple" | "first_person" | undefined;
}) {
  const prompt = `Create a respectful family-memory story draft using only the supplied evidence. Never invent facts, names, dates, places, relationships, dialogue, or events. If a detail is missing, omit it or list it in factsToConfirm. This is an editable draft, not verified history. Style: ${input.style ?? "warm"}.
FAMILY CONTEXT:
${input.familyContext ?? "None"}
TRANSCRIPT:
${input.transcript ?? "None"}
IMAGE DESCRIPTIONS:
${(input.imageDescriptions ?? []).join("\n---\n") || "None"}
Return JSON: title, narrative, suggestedTags (string[]), factsToConfirm (string[]), sourceSummary.`;
  const payload = await geminiRequest(config.geminiModel, "generateContent", {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.35 }
  });
  const text = responseText(payload);
  if (!text) throw new Error("Gemini returned no story draft.");
  try {
    return JSON.parse(text) as StoryDraft;
  } catch {
    return { title: "Untitled family memory", narrative: text, suggestedTags: [], factsToConfirm: ["Review the generated story for unsupported details."], sourceSummary: "Generated from user-provided source material." };
  }
}

export async function embedText(text: string): Promise<{ embedding: number[]; model: string }> {
  const payload = await geminiRequest(config.geminiEmbeddingModel, "embedContent", {
    content: { parts: [{ text }] },
    outputDimensionality: 768
  });
  const values = payload.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) throw new Error("Gemini returned no embedding vector.");
  return { embedding: values as number[], model: config.geminiEmbeddingModel };
}

export async function extractFamilyFacts(source: string) {
  const prompt = `Extract explicit family-history information from the supplied text. Return JSON with: people [{name, relationshipToNarrator (string|null), notes}], relationships [{personA, personB, type, confidence ('low'|'medium'|'high'), evidence}], summary. Only include names and relationships directly stated or strongly supported by the text. Never infer that two people are relatives just because they appear together. Never invent names. If relationship direction is unclear, use null or low confidence. Evidence must be a short exact excerpt from the source. Source:\n${source}`;
  const payload = await geminiRequest(config.geminiModel, 'generateContent', { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const text = responseText(payload);
  if (!text) throw new Error('Gemini returned no family extraction.');
  return JSON.parse(text) as { people: { name: string; relationshipToNarrator?: string | null; notes?: string | null }[]; relationships: { personA: string; personB: string; type: string; confidence: 'low'|'medium'|'high'; evidence: string }[]; summary: string };
}

export async function answerFromArchive(input: { question: string; context: { people: unknown[]; stories: { title: string; narrative: string; transcript?: string | null | undefined; createdAt: string }[] } }) {
  const evidence = input.context.stories.map((s, i) => ({ id: i + 1, title: s.title, narrative: s.narrative, transcript: s.transcript, createdAt: s.createdAt }));
  const prompt = `Answer the user's question using only the supplied family archive. Do not invent or fill gaps. If the archive does not contain the answer, say so clearly. Cite only supplied stories using their title and a short exact excerpt. Return JSON: {answer:string, citations:[{title:string,excerpt:string,createdAt:string}], notFound:boolean}. A citation excerpt must be copied exactly from supplied narrative or transcript.\nQUESTION:\n${input.question}\nPEOPLE:\n${JSON.stringify(input.context.people)}\nSTORIES:\n${JSON.stringify(evidence)}`;
  const payload = await geminiRequest(config.geminiModel, 'generateContent', { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const text = responseText(payload);
  if (!text) throw new Error('Gemini returned no archive answer.');
  return JSON.parse(text) as { answer: string; citations: { title: string; excerpt: string; createdAt: string }[]; notFound: boolean };
}

export async function transcribeAudioWithGemini(input: { bytes: Buffer; mimeType?: string }): Promise<string> {
  const prompt = `Transcribe the following speech accurately word for word. Output ONLY the transcription text. Do not add any preamble, conversational commentary, or notes. 
Support all Indian regional languages, dialects, and mother tongues natively, with first-class fidelity for Bhojpuri (भोजपुरी), Maithili (मैथिली), Awadhi (अवधी), Magahi (मगही), Hindi (हिंदी), and Indian English. 
Preserve code-mixed sentences, regional kinship terms, elder idioms, and colloquial phrasing exactly as spoken, transcribing Indic speech in clear Devanagari script.`;
  let mimeType = input.mimeType || "audio/mp4";
  if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a") mimeType = "audio/mp4";

  const payload = await geminiRequest(config.geminiModel, "generateContent", {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: input.bytes.toString("base64") } },
        { text: prompt }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });
  return responseText(payload);
}

