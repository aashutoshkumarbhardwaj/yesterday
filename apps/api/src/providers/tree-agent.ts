import { config } from "../config.js";
import {
  detectAncestryCycles,
  resolveKinship,
  traceAncestralLine,
  type KinshipPerson,
  type KinshipRelationship
} from "../modules/graph/kinship.js";
import { sarvamChat, extractJsonFromText } from "./sarvam-llm.js";

export interface TreeAgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExtractedTreePerson {
  name: string;
  relationshipToUser?: string | null;
  gender?: "male" | "female" | "other" | null;
  birthYear?: number | null;
  birthPlace?: string | null;
  notes?: string | null;
}

export interface ExtractedTreeRelationship {
  personA: string;
  personB: string;
  relation: "parent" | "child" | "spouse" | "sibling" | "other" | string;
  evidence: string;
}

export interface TreeAgentResponse {
  reply: string;
  extractedPeople: ExtractedTreePerson[];
  extractedRelationships: ExtractedTreeRelationship[];
  conflicts: Array<{ type: string; message: string }>;
  suggestedQuestions: string[];
}

/**
 * Handles conversational interaction with the family tree builder agent using Sarvam AI.
 */
export async function interactWithTreeAgent(input: {
  message: string;
  history: TreeAgentMessage[];
  currentPeople: KinshipPerson[];
  currentRelationships: KinshipRelationship[];
}): Promise<TreeAgentResponse> {
  const trimmed = input.message.trim();
  const lowerMsg = trimmed.toLowerCase();

  // 1. Direct Kinship & Lineage Queries
  if (lowerMsg.includes("maternal line") || lowerMsg.includes("paternal line")) {
    const isMaternal = lowerMsg.includes("maternal line");
    let target = input.currentPeople[0]?.name ?? "me";
    for (const p of input.currentPeople) {
      if (lowerMsg.includes(p.name.toLowerCase())) {
        target = p.name;
        break;
      }
    }
    const lineResult = traceAncestralLine(target, isMaternal ? "maternal" : "paternal", input.currentPeople, input.currentRelationships);
    return {
      reply: lineResult.description,
      extractedPeople: [],
      extractedRelationships: [],
      conflicts: [],
      suggestedQuestions: [
        "Tell me about their hometown",
        "Who were their siblings?",
        "Do you remember any stories from that time?"
      ]
    };
  }

  const relationRegex = /(?:how is|who is|what is the relationship between)\s+([A-Za-z\s]+?)\s+(?:related to|to|and|'s)\s+([A-Za-z\s?]+)/i;
  const match = lowerMsg.match(relationRegex);
  if (match && match[1] && match[2]) {
    const name1 = match[1].trim().replace(/\?$/, "");
    const name2 = match[2].trim().replace(/\?$/, "");
    const kinship = resolveKinship(name1, name2, input.currentPeople, input.currentRelationships);
    return {
      reply: kinship.explanation,
      extractedPeople: [],
      extractedRelationships: [],
      conflicts: [],
      suggestedQuestions: [
        `Where did ${name1} grow up?`,
        `Who were ${name1}'s parents?`,
        "Tell me a story about them"
      ]
    };
  }

  // 2. Oral History Interview & Extraction via Sarvam LLM
  const systemPrompt = `You are Yesterday's Family Historian Agent. You help families build their evidence-backed family tree through warm, conversational oral-history interviews.
Analyze the user's message for relatives, kinship relations, names, locations, and birth years.

CURRENT KNOWN PEOPLE IN TREE:
${JSON.stringify(input.currentPeople.map(p => ({ id: p.id, name: p.name, gender: p.gender, relation: p.relationshipToUser })))}

CURRENT KNOWN RELATIONSHIPS:
${JSON.stringify(input.currentRelationships.map(r => ({ from: r.personA, to: r.personB, rel: r.relation })))}

Respond ONLY with a valid JSON object matching this schema:
{
  "reply": "Warm conversational response acknowledging what was shared and asking ONE gentle follow-up question to discover more family branches",
  "extractedPeople": [
    {
      "name": "Full Name",
      "relationshipToUser": "Father/Mother/Paternal Grandfather/Sister/Spouse/etc",
      "gender": "male" | "female" | "other" | null,
      "birthYear": number | null,
      "birthPlace": string | null
    }
  ],
  "extractedRelationships": [
    {
      "personA": "Name of Person 1",
      "personB": "Name of Person 2",
      "relation": "parent" | "child" | "spouse" | "sibling",
      "evidence": "Direct quote from user message"
    }
  ],
  "conflicts": [],
  "suggestedQuestions": ["Quick suggestion 1", "Quick suggestion 2"]
}`;

  const conversationHistory = input.history.slice(-6).map(h => ({
    role: h.role,
    content: h.content
  }));

  try {
    const raw = await sarvamChat(
      [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: trimmed }
      ],
      { model: "sarvam-105b-conversations", maxTokens: 900, temperature: 0.2 }
    );

    const parsed = extractJsonFromText<TreeAgentResponse>(raw);

    // Validate cycles
    if (parsed.extractedRelationships?.length) {
      const allRels: KinshipRelationship[] = [
        ...input.currentRelationships,
        ...parsed.extractedRelationships.map(r => ({
          personA: r.personA,
          personB: r.personB,
          relation: r.relation
        }))
      ];
      const cycleCheck = detectAncestryCycles(allRels);
      if (cycleCheck.hasCycle) {
        parsed.conflicts = [
          ...(parsed.conflicts || []),
          { type: "cycle", message: `Potential ancestry loop detected involving: ${(cycleCheck.cyclePath ?? []).join(" -> ")}` }
        ];
      }
    }

    return parsed;
  } catch (err) {
    console.warn("Sarvam tree agent call failed, using heuristic extraction:", err);

    // Heuristic NLP fallback so user NEVER gets blocked
    const extractedPeople: ExtractedTreePerson[] = [];
    const extractedRelationships: ExtractedTreeRelationship[] = [];

    const parentMatch = trimmed.match(/(?:my\s+)?(father|mother|dada|dadi|nana|nani|grandfather|grandmother)\s+(?:is|was|named)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (parentMatch && parentMatch[1] && parentMatch[2]) {
      const relation = parentMatch[1];
      const name = parentMatch[2];
      extractedPeople.push({
        name,
        relationshipToUser: relation,
        gender: /father|dada|nana|grandfather/i.test(relation) ? "male" : "female"
      });
      extractedRelationships.push({
        personA: name,
        personB: "Me",
        relation: "parent",
        evidence: parentMatch[0]
      });
    }

    return {
      reply: extractedPeople.length > 0
        ? `I have noted down ${extractedPeople[0]?.name} as your ${extractedPeople[0]?.relationshipToUser} and added them to your family tree! Tell me more about them—where were they born, or who are their brothers and sisters?`
        : `Thank you for sharing that memory. Could you tell me more about their parents or where they lived?`,
      extractedPeople,
      extractedRelationships,
      conflicts: [],
      suggestedQuestions: [
        "Where did they grow up?",
        "Who was their spouse?",
        "Tell me about their children"
      ]
    };
  }
}
