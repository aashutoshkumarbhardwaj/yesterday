import { sarvamChat, extractJsonFromText } from "./sarvam-llm.js";

export async function extractFamilyGraph(source: string) {
  const prompt = `You are extracting a family's oral history into structured claims. Return JSON only with this exact shape:
{
 "people":[{"mentionId":"p1","mentionText":"Dadi","displayName":"Sushila Devi","aliases":["Dadi"],"relationshipToNarrator":"grandmother or null","notes":"short supported context or null"}],
 "relationships":[{"fromMentionId":"p1","toMentionId":"p2","type":"parent|spouse|partner|sibling|adoptive_parent|step_parent|guardian|other","confidence":"low|medium|high","evidenceText":"exact verbatim substring from source","needsClarification":false}],
 "followUpQuestions":["one useful next question"],"summary":"short factual summary"
}
Rules:
- Extract only people and relationships explicitly stated or clearly entailed by the source. Never invent a name, person, date, place or relationship.
- Each distinct person mention gets a stable mentionId within this response. If a relative is unnamed, displayName must be null and mentionText must preserve the actual reference.
- Do not create separate people for vague plural references unless the source establishes distinct individuals.
- Relationship direction: for type parent/adoptive_parent/step_parent, fromMentionId is the parent and toMentionId is the child.
- evidenceText must be an exact substring copied from the source.
- Preserve cultural terms such as Dadi, Nani, Amma, Chacha and Mausi as aliases or mentionText.`;

  try {
    const raw = await sarvamChat(
      [
        { role: "system", content: prompt },
        { role: "user", content: `SOURCE:\n${source}` }
      ],
      { model: "sarvam-105b-conversations", maxTokens: 900, temperature: 0.1 }
    );
    return extractJsonFromText(raw);
  } catch (err) {
    // Graceful fallback
    return {
      people: [],
      relationships: [],
      followUpQuestions: ["Could you tell me more about their parents or family?"],
      summary: "Processed family narrative"
    };
  }
}
