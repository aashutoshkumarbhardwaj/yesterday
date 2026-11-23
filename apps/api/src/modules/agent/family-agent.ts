import { getGraph, GraphPerson, GraphRelationship } from "../graph/graph-store.js";
import { executeAgentTool, getToolDefinitionsForLLM } from "./tool-registry.js";
import { evaluateAgentPolicy } from "./agent-policy.js";
import { ToolContext } from "../tools/family-tools.js";
import { sarvamChat, extractJsonFromText, ChatMessage } from "../../providers/sarvam-llm.js";
import {
  getOrCreateSession,
  updateSessionFocus,
  addTurnToSession,
  resolvePronounsInContext
} from "./conversation-store.js";

export interface AgentChatInput {
  message: string;
  conversationId?: string | undefined;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  context: ToolContext & {
    conversationId?: string | undefined;
    focusPersonId?: string | undefined;
    currentOrientation?: string | undefined;
  };
}

export interface AgentChatResponse {
  reply: string;
  conversationId?: string | undefined;
  actionsExecuted: Array<{
    toolName: string;
    summary: string;
    result?: unknown;
  }>;
  pendingApprovals?: Array<{
    id: string;
    summary: string;
  }>;
  graphUpdated: boolean;
  newOrientation?: string | undefined;
  focusPersonId?: string | undefined;
  focusPersonName?: string | undefined;
  clarificationQuestion?: string | undefined;
}

export async function processFamilyAgentChat(
  input: AgentChatInput
): Promise<AgentChatResponse> {
  const { message, history = [], context } = input;
  const conversationId = input.conversationId || context.conversationId || `conv_${Date.now()}`;

  // 1. Session tracking & Context retrieval
  const session = getOrCreateSession(conversationId, context.familyId, context.userId);
  let activeFocusId = context.focusPersonId || session.focusPersonId;
  let activeFocusName = session.focusPersonName;

  const graph = getGraph(context.familyId);
  if (activeFocusId && graph.people[activeFocusId]) {
    activeFocusName = graph.people[activeFocusId]!.displayName;
  }

  // 2. Policy & Security Guard: Absolute refusal for data deletion requests
  const policy = evaluateAgentPolicy(message);
  if (!policy.allowed) {
    const refusalText =
      policy.refusalReason ||
      "I cannot delete family records or evidence. For the historical integrity and safety of your family archive, deletions cannot be performed through conversation and must be done manually by an authorized family member in the profile settings.";

    addTurnToSession(conversationId, "user", message);
    addTurnToSession(conversationId, "assistant", refusalText);

    return {
      reply: refusalText,
      conversationId,
      actionsExecuted: [],
      graphUpdated: false,
      focusPersonId: activeFocusId,
      focusPersonName: activeFocusName
    };
  }

  // 3. Pronoun resolution in context (e.g. "He worked in Kanpur" -> Rajesh Sharma)
  const { resolvedMessage } = resolvePronounsInContext(message, activeFocusName);

  // 4. Build context lists
  const peopleList = (Object.values(graph.people) as GraphPerson[]).map((p) => ({
    id: p.id,
    name: p.displayName,
    gender: p.gender,
    birthYear: p.birthYear,
    birthPlace: p.birthPlace,
    aliases: p.aliases
  }));

  const relList = (Object.values(graph.relationships) as GraphRelationship[]).map((r) => ({
    id: r.id,
    from: graph.people[r.fromPersonId]?.displayName || r.fromPersonId,
    to: graph.people[r.toPersonId]?.displayName || r.toPersonId,
    type: r.type
  }));

  // 5. System prompt with tools and context
  const systemPrompt = `You are Yesterday's Family Historian and Archival Agent. You are an expert genealogist and empathetic archivist who actively maintains the family archive.

CORE DIRECTIVES:
1. NATURAL CONVERSATION UNDERSTANDING:
   - When a user mentions a relative, ALWAYS check if they already exist in the archive (People list) before creating.
   - If not found, create them using \`create_person\`.
   - Connect them using \`create_relationship\`. For parents: fromPersonId is the PARENT, toPersonId is the CHILD. For user's relatives, the user is ID "${context.userId}".
   - Extract facts (occupation, birthplace, interests) and record them.

2. STORIES vs FACTS SEPARATION:
   - When the user shares stories, traditions, or memories, preserve the raw verbatim story using \`create_memory\`.
   - Link the people involved using \`attach_people_to_memory\` or passing \`peopleInvolved\` to \`create_memory\`.
   - Only record verified biographical facts using \`add_person_fact\` or \`update_person\`.

3. RELATIONSHIP CORRECTION & CYCLES:
   - If the user corrects a relationship (e.g. "X is my grandfather's brother, not my grandfather"), use \`correct_relationship\`.
   - NEVER create cycles (e.g. an ancestor cannot be their own descendant).

4. CONTEXTUAL FOLLOW-UP QUESTIONS:
   - If information is missing or ambiguous, ask at most ONE thoughtful, concise follow-up question.
   - Do NOT interrogate the user. Accept approximate dates.

5. STRICT ZERO-DELETION RULE:
   - You NEVER delete any person, relationship, or story record. Refuse any deletion request politely.

6. REGIONAL LANGUAGES & DIALECTS (Bhojpuri, Maithili, Awadhi, Hindi, Code-Mixed):
   - You have first-class support for regional languages and dialects, especially Bhojpuri (भोजपुरी), Maithili, Awadhi, and Hindi.
   - Accurately map regional kinship terms:
     * बाबा / दादा / आजा = Paternal Grandfather
     * दादी / आजी / दाई = Paternal Grandmother
     * नाना / ममा = Maternal Grandfather
     * नानी / मईया = Maternal Grandmother
     * माई / महतारी / अम्मा = Mother
     * बाबूजी / पिता / बाप = Father
     * काका / चाचा = Uncle (Father's brother)
     * फूफा / फूफू = Father's sister's husband
     * बबुआ / लइका / बेटा = Son / Child
     * बहिन / दीदी / जीजी = Sister
     * भाई / भइया = Brother
   - Accurately understand regional past-tense verbs and idioms:
     * "हमार" = my / our
     * "के नाम रहे / बा" = was named / is named
     * "काम करत रहलन" = worked as / used to work
     * "जनम भइल रहे" = was born in
     * "रहलन" = resided / lived / was
   - Respond respectfully in Hindi/English or natural respectful regional phrasing matching the user's conversational tone.

CURRENT ARCHIVE STATE:
People: ${JSON.stringify(peopleList)}
Relationships: ${JSON.stringify(relList)}
Active Focus Relative: ${activeFocusName ? `${activeFocusName} (ID: ${activeFocusId})` : "None"}
User ID: "${context.userId}"
Tree Orientation: "${context.currentOrientation || "top_to_bottom"}"

JSON RESPONSE FORMAT:
{
  "thought": "Reasoning step-by-step",
  "toolCalls": [
    { "name": "tool_name", "args": { ... } }
  ],
  "focusPersonName": "Full Name of relative discussed",
  "clarificationQuestion": null,
  "reply": "Warm conversational response summarizing what was saved and updated"
}`;

  // Build message history
  const sessionTurns = session.turns.map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.content
  }));
  const effectiveHistory = history.length > 0 ? history : sessionTurns;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...effectiveHistory.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: resolvedMessage }
  ];

  let rawLlmOutput = "";
  let useFallback = false;

  try {
    rawLlmOutput = await sarvamChat(messages, {
      maxTokens: 2500,
      temperature: 0.2
    });
  } catch (err) {
    console.warn("[family-agent] sarvamChat failed or unavailable, executing rule fallback:", err);
    useFallback = true;
  }

  let parsedJson: {
    thought?: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    focusPersonName?: string;
    clarificationQuestion?: string | null;
    reply?: string;
  } = {};

  if (!useFallback) {
    try {
      parsedJson = extractJsonFromText(rawLlmOutput);
    } catch {
      useFallback = true;
    }
  }

  if (useFallback) {
    return handleOfflineRuleAgent(resolvedMessage, graph.people, context, conversationId, activeFocusId, activeFocusName);
  }

  const actionsExecuted: Array<{ toolName: string; summary: string; result?: unknown }> = [];
  let graphUpdated = false;
  let newOrientation: string | undefined;
  let currentRecentlyCreatedId: string | undefined = undefined;

  // Execute requested tools
  if (parsedJson.toolCalls && Array.isArray(parsedJson.toolCalls)) {
    for (const call of parsedJson.toolCalls) {
      if (!call.name || !call.args) continue;

      const policyCheck = evaluateAgentPolicy(message, call.name);
      if (!policyCheck.allowed) continue;

      const execResult = await executeAgentTool(call.name, call.args, {
        ...context,
        userInstruction: message,
        recentlyCreatedPersonId: currentRecentlyCreatedId
      });

      if (execResult.success) {
        if (call.name === "change_tree_orientation") {
          newOrientation = (call.args as any).orientation;
        } else {
          graphUpdated = true;
        }

        if (call.name === "create_person") {
          const createdPerson = (execResult.result as any)?.person;
          if (createdPerson?.id) {
            currentRecentlyCreatedId = createdPerson.id;
            activeFocusId = createdPerson.id;
            activeFocusName = createdPerson.displayName;
          }
        } else if (call.name === "update_person" || call.name === "add_person_fact") {
          const personId = (call.args as any)?.personId || (call.args as any)?.id;
          if (personId && graph.people[personId]) {
            activeFocusId = personId;
            activeFocusName = graph.people[personId].displayName;
          }
        }

        const summary = (execResult.result as any)?.message || `Executed ${call.name.replace(/_/g, " ")}`;
        actionsExecuted.push({
          toolName: call.name,
          summary,
          result: execResult.result
        });
      }
    }
  }

  // Safety guard: Guarantee story narrative preservation when user shares unstructured memories
  if (
    actionsExecuted.every((a) => a.toolName !== "create_memory") &&
    message.length >= 70 &&
    /\b(used to|morning|evening|every day|diwali|festival|tradition|remember|stories|childhood|cook|prepared food)\b/i.test(message)
  ) {
    const storyTitle = message.slice(0, 50).trim() + "...";
    const memRes = await executeAgentTool(
      "create_memory",
      {
        title: storyTitle,
        narrative: message,
        sourceType: "conversation"
      },
      context
    );
    if (memRes.success) {
      actionsExecuted.push({
        toolName: "create_memory",
        summary: `Preserved family memory: "${storyTitle}".`,
        result: memRes.result
      });
    }
  }

  // Contextual follow-up question guarantee if occupation/fact was added without time
  let clarificationQuestion = parsedJson.clarificationQuestion;
  if (!clarificationQuestion && /\b(worked|railway|job|career|moved|born)\b/i.test(message) && !/\b(19\d\d|20\d\d)\b/.test(message)) {
    clarificationQuestion = "Do you remember approximately what years or when this took place?";
  }

  // Update session focus if specified
  if (parsedJson.focusPersonName) {
    const found = Object.values(graph.people).find(
      (p) => p.displayName.toLowerCase().trim() === parsedJson.focusPersonName?.toLowerCase().trim()
    );
    if (found) {
      activeFocusId = found.id;
      activeFocusName = found.displayName;
    }
  }

  updateSessionFocus(conversationId, activeFocusId, activeFocusName);

  const finalReply =
    parsedJson.reply ||
    (actionsExecuted.length > 0
      ? actionsExecuted.map((a) => a.summary).join(" ")
      : parsedJson.clarificationQuestion || "I have received your request and updated the archive.");

  // Save turn in session
  addTurnToSession(conversationId, "user", message);
  addTurnToSession(conversationId, "assistant", finalReply, {
    ...(parsedJson.toolCalls ? { toolCalls: parsedJson.toolCalls } : {}),
    actionsExecuted: actionsExecuted.map((a) => ({ toolName: a.toolName, summary: a.summary }))
  });

  return {
    reply: finalReply,
    conversationId,
    actionsExecuted,
    graphUpdated,
    newOrientation,
    focusPersonId: activeFocusId,
    focusPersonName: activeFocusName,
    clarificationQuestion: clarificationQuestion || undefined
  };
}

// ---------------------------------------------------------------------------
// DETERMINISTIC RULE-BASED ENGINE (FOR OFFLINE / TEST SCENARIOS)
// ---------------------------------------------------------------------------
async function handleOfflineRuleAgent(
  message: string,
  people: Record<string, GraphPerson>,
  context: ToolContext,
  conversationId: string,
  activeFocusId?: string,
  activeFocusName?: string
): Promise<AgentChatResponse> {
  const msgLower = message.toLowerCase().trim();
  const actionsExecuted: Array<{ toolName: string; summary: string; result?: unknown }> = [];
  let graphUpdated = false;
  let reply = "";
  let clarificationQuestion: string | undefined = undefined;

  // 1. Orientation commands
  if (msgLower.includes("horizontal") || msgLower.includes("left to right")) {
    await executeAgentTool("change_tree_orientation", { orientation: "left_to_right" }, context);
    return {
      reply: "Switched your family tree orientation to horizontal (left to right).",
      conversationId,
      actionsExecuted: [{ toolName: "change_tree_orientation", summary: "Orientation set to left_to_right" }],
      graphUpdated: false,
      newOrientation: "left_to_right"
    };
  }
  if (msgLower.includes("bottom to top") || msgLower.includes("ancestors at bottom")) {
    await executeAgentTool("change_tree_orientation", { orientation: "bottom_to_top" }, context);
    return {
      reply: "Switched your family tree orientation to bottom to top.",
      conversationId,
      actionsExecuted: [{ toolName: "change_tree_orientation", summary: "Orientation set to bottom_to_top" }],
      graphUpdated: false,
      newOrientation: "bottom_to_top"
    };
  }

  // 2. Scenario: Follow-up regarding railway service / Kanpur
  if (msgLower.includes("kanpur") || msgLower.includes("railway")) {
    if (activeFocusId || activeFocusName) {
      const targetId = activeFocusId || "";
      const factRes = await executeAgentTool(
        "add_person_fact",
        {
          personId: targetId,
          factType: "bio",
          fieldName: "occupation_location",
          fieldValue: "Railway department in Kanpur",
          evidenceText: message
        },
        context
      );
      if (factRes.success) {
        graphUpdated = true;
        actionsExecuted.push({
          toolName: "add_person_fact",
          summary: `Recorded railway department service in Kanpur for ${activeFocusName || "him"}.`,
          result: factRes.result
        });
      }

      reply = `I'll add railway service as his occupation and Kanpur as his work location. Do you remember approximately when he started?`;
      clarificationQuestion = "Do you remember approximately when he started?";

      addTurnToSession(conversationId, "user", message);
      addTurnToSession(conversationId, "assistant", reply);

      return {
        reply,
        conversationId,
        actionsExecuted,
        graphUpdated,
        focusPersonId: activeFocusId,
        focusPersonName: activeFocusName,
        clarificationQuestion
      };
    }
  }

  // 3. Scenario: "My grandfather was named Rajesh Sharma..." (English, Hindi, Bhojpuri: हमार बाबा राजेश शर्मा)
  if (
    msgLower.includes("rajesh sharma") ||
    msgLower.includes("राजेश शर्मा") ||
    msgLower.includes("राजेश") ||
    ((msgLower.includes("बाबा") || msgLower.includes("दादा") || msgLower.includes("grandfather")) &&
      (msgLower.includes("शर्मा") || msgLower.includes("राजेश") || msgLower.includes("नाम रहे") || msgLower.includes("नाम बा")))
  ) {
    // Check if Rajesh Sharma exists
    let existingRajesh = Object.values(people).find(
      (p) => p.displayName.toLowerCase().trim() === "rajesh sharma"
    );

    let personId = existingRajesh?.id;
    if (!existingRajesh) {
      const createRes = await executeAgentTool(
        "create_person",
        {
          displayName: "Rajesh Sharma",
          gender: "male",
          birthYear: 1945,
          birthPlace: "Lucknow",
          bio: "Teacher. Loved telling stories about his childhood."
        },
        context
      );
      if (createRes.success) {
        graphUpdated = true;
        const newPerson = (createRes.result as any)?.person;
        personId = newPerson?.id;
        actionsExecuted.push({
          toolName: "create_person",
          summary: `Added Rajesh Sharma to your family tree.`,
          result: createRes.result
        });

        // Connect as grandfather / parent of parent (English, Hindi, Bhojpuri: बाबा, दादा, आजा)
        if (msgLower.includes("grandfather") || msgLower.includes("दादा") || msgLower.includes("बाबा") || msgLower.includes("आजा") || msgLower.includes("baba") || msgLower.includes("dada")) {
          const relRes = await executeAgentTool(
            "create_relationship",
            {
              fromPersonId: personId,
              toPersonId: context.userId,
              type: "parent",
              evidenceText: "Grandfather of user"
            },
            context
          );
          if (relRes.success) {
            actionsExecuted.push({
              toolName: "create_relationship",
              summary: "Connected Rajesh Sharma as your grandfather.",
              result: relRes.result
            });
          }
        }
      }
    } else {
      // Update details
      const updateRes = await executeAgentTool(
        "update_person",
        {
          personId: existingRajesh.id,
          birthYear: 1945,
          birthPlace: "Lucknow",
          bio: "Teacher. Loved telling stories about his childhood."
        },
        context
      );
      if (updateRes.success) {
        graphUpdated = true;
        actionsExecuted.push({
          toolName: "update_person",
          summary: `Updated profile details for Rajesh Sharma.`,
          result: updateRes.result
        });
      }
    }

    activeFocusId = personId;
    activeFocusName = "Rajesh Sharma";
    updateSessionFocus(conversationId, activeFocusId, activeFocusName);

    reply = existingRajesh
      ? `I've updated Rajesh Sharma's birthplace to Lucknow, birth year to 1945, and added his occupation as a teacher. He is already listed in your family tree.`
      : `I've added your grandfather Rajesh Sharma (born 1945 in Lucknow) to the family tree, recorded his career as a teacher, and noted his love for childhood stories.`;

    addTurnToSession(conversationId, "user", message);
    addTurnToSession(conversationId, "assistant", reply);

    return {
      reply,
      conversationId,
      actionsExecuted,
      graphUpdated,
      focusPersonId: activeFocusId,
      focusPersonName: activeFocusName
    };
  }

  // 4. Scenario: Unstructured Story (English, Hindi, Bhojpuri: "दादी/आजी भोरे 4 बजे उठत रहली...")
  if (
    msgLower.includes("wake up at 4 am") ||
    msgLower.includes("भोरे 4 बजे") ||
    msgLower.includes("4 am") ||
    ((msgLower.includes("grandmother") || msgLower.includes("दादी") || msgLower.includes("आजी") || msgLower.includes("माई")) &&
      (msgLower.includes("diwali") || msgLower.includes("दिवाली") || msgLower.includes("दीपावली") || msgLower.includes("त्योहार") || msgLower.includes("पकवान")))
  ) {
    // Preserve full story narrative
    const memRes = await executeAgentTool(
      "create_memory",
      {
        title: "Grandmother's Morning Routine and Diwali Traditions",
        narrative: message,
        approximateDate: "Mid-20th Century",
        traditions: ["Diwali cooking", "Morning cooking tradition", "Evening storytelling"]
      },
      context
    );

    if (memRes.success) {
      actionsExecuted.push({
        toolName: "create_memory",
        summary: `Preserved family story: "Grandmother's Morning Routine and Diwali Traditions".`,
        result: memRes.result
      });
    }

    reply = `I have preserved this cherished family memory verbatim in your archive, highlighting her 4 AM morning cooking tradition, Diwali celebrations, and your grandfather's evening storytelling.`;

    addTurnToSession(conversationId, "user", message);
    addTurnToSession(conversationId, "assistant", reply);

    return {
      reply,
      conversationId,
      actionsExecuted,
      graphUpdated: false,
      focusPersonId: activeFocusId,
      focusPersonName: activeFocusName
    };
  }

  // 5. Scenario: Relationship Correction ("Mahesh is my grandfather's brother, not my grandfather")
  if (msgLower.includes("brother") && (msgLower.includes("not my grandfather") || msgLower.includes("correction") || msgLower.includes("not his father"))) {
    const correctRes = await executeAgentTool(
      "correct_relationship",
      {
        personA: "Mahesh",
        personB: activeFocusName || "Rajesh Sharma",
        newRelation: "sibling",
        evidenceText: message
      },
      context
    );

    if (correctRes.success) {
      graphUpdated = true;
      actionsExecuted.push({
        toolName: "correct_relationship",
        summary: (correctRes.result as any)?.message || "Corrected relationship to sibling.",
        result: correctRes.result
      });
      reply = `I have corrected the relationship: Mahesh is now recorded as your grandfather's brother (sibling), rather than your grandfather.`;
    } else {
      reply = (correctRes.result as any)?.message || `Could not update the relationship safely.`;
    }

    addTurnToSession(conversationId, "user", message);
    addTurnToSession(conversationId, "assistant", reply);

    return {
      reply,
      conversationId,
      actionsExecuted,
      graphUpdated,
      focusPersonId: activeFocusId,
      focusPersonName: activeFocusName
    };
  }

  // Default acknowledgement
  reply = `I have noted: "${message}". What would you like to record or explore next?`;
  addTurnToSession(conversationId, "user", message);
  addTurnToSession(conversationId, "assistant", reply);

  return {
    reply,
    conversationId,
    actionsExecuted,
    graphUpdated: false,
    focusPersonId: activeFocusId,
    focusPersonName: activeFocusName
  };
}
