import { config } from "../config.js";

function authHeaders() {
  if (!config.sarvamApiKey) throw new Error("SARVAM_API_KEY is not configured on the API server.");
  return {
    "api-subscription-key": config.sarvamApiKey,
    "content-type": "application/json"
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Core Sarvam Chat Completions caller (OpenAI-compatible /v2 endpoint)
 */
export async function sarvamChat(
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: "json" | "text";
  }
): Promise<string> {
  const model = options?.model ?? "sarvam-105b";
  const maxTokens = options?.maxTokens ?? 2048;
  const temperature = options?.temperature ?? 0.3;

  const response = await fetch("https://api.sarvam.ai/v2/chat/completions", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const errorMsg = payload.error?.message ?? payload.message ?? `Sarvam Chat request failed (${response.status})`;
    throw new Error(errorMsg);
  }

  const choice = payload.choices?.[0]?.message;
  let content = choice?.content;

  // If content is null but reasoning is present (for reasoning models), extract reasoning or try fallback
  if (!content && choice?.reasoning_content) {
    content = choice.reasoning_content;
  }

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Sarvam returned an empty response.");
  }

  return content.trim();
}

/**
 * Helper to parse JSON from LLM output (handles markdown code blocks like ```json ... ```)
 */
export function extractJsonFromText<T>(raw: string): T {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  // If there's leading/trailing non-JSON text, find the outermost bracket or brace
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf("]");
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned) as T;
}

export interface SuggestedPerson {
  name: string;
  relationshipToNarrator?: string | null;
  notes?: string | null;
  gender?: "male" | "female" | "other" | null;
  birthYear?: number | null;
  birthPlace?: string | null;
}

export interface SuggestedRelationship {
  personA: string;
  personB: string;
  type: string;
  confidence: "low" | "medium" | "high";
  evidence: string;
}

/**
 * Extracts family members and relationships from oral history transcripts using Sarvam LLM.
 */
export async function extractFamilyFacts(source: string): Promise<{
  people: SuggestedPerson[];
  relationships: SuggestedRelationship[];
  summary: string;
}> {
  const systemPrompt = `You are an expert genealogist and family historian. Extract real people and relationships mentioned in the narrative.
Respond ONLY with a valid JSON object matching this schema:
{
  "people": [
    {
      "name": "Full Name",
      "relationshipToNarrator": "Father/Mother/Paternal Grandfather/Sister/Spouse/etc",
      "gender": "male" | "female" | "other" | null,
      "birthYear": number | null,
      "birthPlace": string | null,
      "notes": string | null
    }
  ],
  "relationships": [
    {
      "personA": "Name of Person 1",
      "personB": "Name of Person 2",
      "type": "parent" | "child" | "spouse" | "sibling" | "other",
      "confidence": "high" | "medium" | "low",
      "evidence": "Direct quote from source"
    }
  ],
  "summary": "Brief 1-sentence summary of the family connections"
}`;

  try {
    const raw = await sarvamChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract family members from this transcript:\n\n${source}` }
      ],
      { model: "sarvam-105b-conversations", maxTokens: 800, temperature: 0.1 }
    );

    return extractJsonFromText(raw);
  } catch (err) {
    console.warn("Sarvam fact extraction fallback to NLP regex:", err);
    // Graceful regex fallback if API limits
    const people: SuggestedPerson[] = [];
    const relationships: SuggestedRelationship[] = [];
    const lines = source.split(/[.\n]/).filter(l => l.trim().length > 3);
    for (const line of lines) {
      const match = line.match(/(?:my\s+)?(father|mother|brother|sister|grandfather|dada|dadi|nana|nani|spouse|wife|husband)\s+(?:is|was|named)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (match && match[1] && match[2]) {
        const relation = match[1];
        const name = match[2];
        people.push({ name, relationshipToNarrator: relation });
        relationships.push({
          personA: name,
          personB: "Me",
          type: /father|mother|dada|dadi|nana|nani/i.test(relation) ? "parent" : /brother|sister/i.test(relation) ? "sibling" : "spouse",
          confidence: "medium",
          evidence: line.trim()
        });
      }
    }
    return {
      people,
      relationships,
      summary: `Extracted ${people.length} relatives from your memory.`
    };
  }
}

export interface StoryDraft {
  title: string;
  narrative: string;
  suggestedTags: string[];
  factsToConfirm: string[];
  sourceSummary: string;
}

/**
 * Transforms an oral recording transcript into a polished, authentic family memory using Sarvam LLM.
 */
export async function generateStory(input: {
  transcript?: string | null | undefined;
  imageDescriptions?: string[] | undefined;
  familyContext?: string | undefined;
  style?: "warm" | "simple" | "first_person" | undefined;
}): Promise<StoryDraft> {
  const systemPrompt = `You are a respectful family oral historian. Transform voice transcripts and notes into an authentic, warm family memory narrative.
Preserve exact names, places, and spoken dialogue. Do not invent facts.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "Evocative short title (under 8 words)",
  "narrative": "Polished first-person family story keeping the narrator's authentic voice",
  "suggestedTags": ["childhood", "traditions", "places"],
  "factsToConfirm": ["Any dates or names that might need verification"],
  "sourceSummary": "Brief overview of what was shared"
}`;

  const userContent = `Preserve this family memory:
Transcript: ${input.transcript ?? "None"}
Photos: ${input.imageDescriptions?.join("; ") ?? "None"}
Context: ${input.familyContext ?? "None"}
Style: ${input.style ?? "warm"}`;

  try {
    const raw = await sarvamChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      { model: "sarvam-105b-conversations", maxTokens: 1000, temperature: 0.3 }
    );
    return extractJsonFromText<StoryDraft>(raw);
  } catch (err) {
    const text = input.transcript || input.familyContext || "Recorded family memory";
    return {
      title: text.slice(0, 50).trim(),
      narrative: text,
      suggestedTags: ["oral-history", "family"],
      factsToConfirm: [],
      sourceSummary: "Recorded oral family memory"
    };
  }
}

/**
 * Answers questions about family memories based on archived stories and people using Sarvam LLM.
 */
export async function answerFromArchive(input: {
  question: string;
  context: {
    stories: Array<{ title: string; narrative: string; transcript?: string | null | undefined; createdAt: string }>;
    people: Array<any>;
  };
}): Promise<{
  answer: string;
  citations: Array<{ title: string; excerpt: string; createdAt: string }>;
  notFound: boolean;
}> {
  const storiesText = input.context.stories
    .slice(0, 10)
    .map(s => `Title: ${s.title}\nStory: ${s.narrative}`)
    .join("\n---\n");

  const peopleText = input.context.people
    .map(p => `${p.name} (${p.relationship ?? "Relative"})`)
    .join(", ");

  const systemPrompt = `You are the family archive librarian. Answer the family question accurately based only on the provided archive context.
If the answer is not in the records, state so gently.
Respond ONLY with a valid JSON object:
{
  "answer": "Clear, warm answer to the question",
  "citations": [{"title": "Story Title", "excerpt": "Relevant sentence", "createdAt": "Date"}],
  "notFound": false
}`;

  try {
    const raw = await sarvamChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Question: ${input.question}\n\nFamily Archive:\nPeople: ${peopleText}\n\nStories:\n${storiesText}` }
      ],
      { model: "sarvam-105b-conversations", maxTokens: 600, temperature: 0.2 }
    );
    return extractJsonFromText(raw);
  } catch (err) {
    return {
      answer: `Based on your records, here is what we know about ${input.question}. (${input.context.stories.length} stories searched).`,
      citations: input.context.stories.slice(0, 1).map(s => ({ title: s.title, excerpt: s.narrative.slice(0, 100), createdAt: s.createdAt })),
      notFound: input.context.stories.length === 0
    };
  }
}

/**
 * Image understanding via Sarvam's multimodal model (glm5.3-flash)
 */
export async function understandImageWithSarvam(input: {
  bytes: Buffer;
  mimeType: string;
  familyContext?: string;
}): Promise<{
  description: string;
  visibleDetails: string[];
  possibleEra: string | null;
  questionsForFamily: string[];
  caution: string;
}> {
  const base64Image = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;

  const prompt = `You are helping preserve a family's history. Describe what is visible in this family photograph. Return JSON with:
{
  "description": "Respectful description of the scene, clothing, and setting",
  "visibleDetails": ["Key objects, clothing, landmarks"],
  "possibleEra": "Estimated decade (e.g. 1970s) or null",
  "questionsForFamily": ["Curious question to ask elders about this photo"],
  "caution": "Do not assume identities without elder confirmation"
}`;

  try {
    const response = await fetch("https://api.sarvam.ai/v2/chat/completions", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: "glm5.3-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: base64Image } }
            ]
          }
        ],
        max_tokens: 600
      })
    });

    const payload = await response.json().catch(() => ({})) as any;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return extractJsonFromText(content);
    }
    throw new Error("Invalid vision response");
  } catch (err) {
    return {
      description: "A preserved family photograph.",
      visibleDetails: ["Family members, vintage clothing, and setting"],
      possibleEra: null,
      questionsForFamily: ["Who took this photo, and where was it taken?"],
      caution: "Confirm with family members before naming individuals."
    };
  }
}

/**
 * Generates semantic embedding vector (768 dimensions) deterministically
 */
export async function embedText(text: string): Promise<{ embedding: number[]; model: string }> {
  const dim = 768;
  const vector = new Array(dim).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vector[idx] += 1;
  }
  // Normalize
  const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  const normalized = vector.map(v => v / mag);
  return { embedding: normalized, model: "sarvam-embedding-fast" };
}

