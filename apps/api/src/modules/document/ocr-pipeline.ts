import { config } from "../../config.js";

export type DocumentType =
  | "birth_certificate"
  | "marriage_certificate"
  | "letter"
  | "recipe"
  | "newspaper_clipping"
  | "school_record"
  | "land_deed"
  | "memorial"
  | "other";

export interface DocumentAnalysisResult {
  documentType: DocumentType;
  title: string;
  transcribedText: string;
  extractedNames: string[];
  extractedDates: string[];
  extractedPlaces: string[];
  suggestedFacts: Array<{
    factType: "person_identity" | "date" | "place" | "event" | "recipe" | "relationship";
    subjectName?: string | undefined;
    value: string;
    confidence: number;
    evidenceText: string;
  }>;
  needsReview: boolean;
  notes: string;
}

/**
 * Processes a photograph of a historical document, certificate, letter, or recipe.
 */
export async function analyzeDocumentImage(input: {
  bytes: Buffer;
  mimeType: string;
  familyContext?: string | undefined;
}): Promise<DocumentAnalysisResult> {
  const base64 = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;

  const prompt = `You are an expert archivist analyzing an old family document (e.g. birth/marriage certificate, handwritten letter, recipe, newspaper clipping, deed).
Extract all visible text as accurately as possible.
Identify names, dates, places, and events mentioned.
Extract facts carefully and mark uncertain or hard-to-read text.
Respond ONLY with a valid JSON object matching this schema:
{
  "documentType": "birth_certificate" | "marriage_certificate" | "letter" | "recipe" | "newspaper_clipping" | "school_record" | "land_deed" | "memorial" | "other",
  "title": "Short descriptive title of the document",
  "transcribedText": "Full text transcribed verbatim from the image",
  "extractedNames": ["Names of people mentioned"],
  "extractedDates": ["Dates or years mentioned"],
  "extractedPlaces": ["Towns, cities, villages, addresses"],
  "suggestedFacts": [
    {
      "factType": "person_identity" | "date" | "place" | "event" | "recipe" | "relationship",
      "subjectName": "Name of person this fact belongs to",
      "value": "Fact claim (e.g. Born in Varanasi in 1945)",
      "confidence": 0.9,
      "evidenceText": "Verbatim excerpt from document"
    }
  ],
  "needsReview": true,
  "notes": "Archival preservation notes"
}`;

  try {
    if (!config.sarvamApiKey) throw new Error("SARVAM_API_KEY is not configured.");

    const response = await fetch("https://api.sarvam.ai/v2/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-subscription-key": config.sarvamApiKey
      },
      body: JSON.stringify({
        model: "glm5.3-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${prompt}\n\nFamily Context: ${input.familyContext || "None provided"}` },
              { type: "image_url", image_url: { url: base64 } }
            ]
          }
        ],
        max_tokens: 1500
      })
    });

    const payload = (await response.json().catch(() => ({}))) as any;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        return JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as DocumentAnalysisResult;
      }
    }
    throw new Error("Invalid vision response");
  } catch (err) {
    console.warn("Document OCR vision fallback:", err);
    return {
      documentType: "other",
      title: "Family Document Archive",
      transcribedText: "Preserved historical family document image. Please review and transcribe details manually.",
      extractedNames: [],
      extractedDates: [],
      extractedPlaces: [],
      suggestedFacts: [],
      needsReview: true,
      notes: "Auto-transcription unavailable. Image stored safely."
    };
  }
}

