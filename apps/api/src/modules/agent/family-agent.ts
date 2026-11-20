import { getGraph, GraphPerson, GraphRelationship } from "../graph/graph-store.js";
import { executeAgentTool, getToolDefinitionsForLLM } from "./tool-registry.js";
import { evaluateAgentPolicy } from "./agent-policy.js";
import { ToolContext } from "../tools/family-tools.js";
import { sarvamChat, extractJsonFromText, ChatMessage } from "../../providers/sarvam-llm.js";

export interface AgentChatInput {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  context: ToolContext & {
    focusPersonId?: string | undefined;
    currentOrientation?: string | undefined;
  };
}

export interface AgentChatResponse {
  reply: string;
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
  clarificationQuestion?: string | undefined;
}

export async function processFamilyAgentChat(
  input: AgentChatInput
): Promise<AgentChatResponse> {
  const { message, history = [], context } = input;

  // 1. Policy & Security Guard: Immediately refuse deletion requests
  const policy = evaluateAgentPolicy(message);
  if (!policy.allowed) {
    return {
      reply: policy.refusalReason || "Operation not permitted.",
      actionsExecuted: [],
      graphUpdated: false
    };
  }

  // 2. Fetch current family context
  const graph = getGraph(context.familyId);
  const peopleList = (Object.values(graph.people) as GraphPerson[]).map((p) => ({
    id: p.id,
    name: p.displayName,
    gender: p.gender,
    birthYear: p.birthYear
  }));

  const relList = (Object.values(graph.relationships) as GraphRelationship[]).map((r) => ({
    id: r.id,
    from: graph.people[r.fromPersonId]?.displayName || r.fromPersonId,
    to: graph.people[r.toPersonId]?.displayName || r.toPersonId,
    type: r.type
  }));

  // 3. System prompt with tools and context
  const systemPrompt = `You are Yesterday's Family Historian Agent. You have actual control over the family archive and family tree.

YOUR CAPABILITIES:
You can execute tools to:
- create_person: Add new relatives
- update_person: Correct names, birth years, birthplaces, bios
- add_person_alias: Add nicknames / maiden names
- create_relationship: Connect two relatives (parent, child, spouse, sibling)
- change_tree_orientation: Switch tree layout (top_to_bottom, bottom_to_top, left_to_right, right_to_left)
- create_event: Add life milestones
- get_relationship_path: Explain kinship between family members

STRICT RULES:
1. You CANNOT delete any person, family, relationship, or story. Refuse politely if asked to delete.
2. If the user mentions someone without a full name or an ambiguous person, ask for clarification.
3. When creating a relationship, determine correct fromPersonId and toPersonId.
   - For parent-child: fromPersonId is the PARENT, toPersonId is the CHILD.
   - If user refers to themselves ("my father"), find the person representing the user (name 'Me' or ID '${context.userId}').
4. Always respond in valid JSON with format:
{
  "thought": "Reasoning step-by-step",
  "toolCalls": [
    { "name": "tool_name", "args": { ... } }
  ],
  "clarificationQuestion": null,
  "reply": "Warm conversational response summarizing what was done"
}

CURRENT FAMILY ARCHIVE:
People: ${JSON.stringify(peopleList)}
Relationships: ${JSON.stringify(relList)}
Current User ID: "${context.userId}"
Current Tree Orientation: "${context.currentOrientation || 'top_to_bottom'}"`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message }
  ];

  let rawLlmOutput = "";
  try {
    rawLlmOutput = await sarvamChat(messages, {
      maxTokens: 1200,
      temperature: 0.2
    });
  } catch (err) {
    console.error("[family-agent] sarvamChat failed with error:", err);
    // Rule-assisted offline fallback parser if LLM is unreachable
    return handleOfflineRuleAgent(message, graph.people, context);
  }

  // 4. Parse LLM JSON
  let parsedJson: {
    thought?: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    clarificationQuestion?: string | null;
    reply?: string;
  } = {};

  try {
    parsedJson = extractJsonFromText(rawLlmOutput);
  } catch {
    // If output is not pure JSON, extract response text
    return {
      reply: rawLlmOutput,
      actionsExecuted: [],
      graphUpdated: false
    };
  }

  const actionsExecuted: Array<{ toolName: string; summary: string; result?: unknown }> = [];
  let graphUpdated = false;
  let newOrientation: string | undefined;

  // 5. Execute requested tools in sequence
  let currentRecentlyCreatedId: string | undefined = undefined;
  if (parsedJson.toolCalls && Array.isArray(parsedJson.toolCalls)) {
    for (const call of parsedJson.toolCalls) {
      if (!call.name || !call.args) continue;

      // Policy check per tool
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
          const createdId = (execResult.result as any)?.person?.id;
          if (createdId) currentRecentlyCreatedId = createdId;
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

  const finalReply =
    parsedJson.reply ||
    (actionsExecuted.length > 0
      ? actionsExecuted.map((a) => a.summary).join(" ")
      : parsedJson.clarificationQuestion || "I have received your request.");

  return {
    reply: finalReply,
    actionsExecuted,
    graphUpdated,
    newOrientation,
    clarificationQuestion: parsedJson.clarificationQuestion || undefined
  };
}

// Deterministic rule-based fallback when offline or LLM provider errors
function handleOfflineRuleAgent(
  message: string,
  people: Record<string, GraphPerson>,
  context: ToolContext
): AgentChatResponse {
  const msgLower = message.toLowerCase().trim();

  // Orientation commands
  if (msgLower.includes("horizontal") || msgLower.includes("left to right")) {
    return {
      reply: "Switched your family tree orientation to horizontal (left to right).",
      actionsExecuted: [{ toolName: "change_tree_orientation", summary: "Orientation set to left_to_right" }],
      graphUpdated: false,
      newOrientation: "left_to_right"
    };
  }
  if (msgLower.includes("bottom to top") || msgLower.includes("ancestors at bottom")) {
    return {
      reply: "Switched your family tree orientation to bottom to top.",
      actionsExecuted: [{ toolName: "change_tree_orientation", summary: "Orientation set to bottom_to_top" }],
      graphUpdated: false,
      newOrientation: "bottom_to_top"
    };
  }
  if (msgLower.includes("top to bottom") || msgLower.includes("ancestors at top")) {
    return {
      reply: "Switched your family tree orientation to top to bottom.",
      actionsExecuted: [{ toolName: "change_tree_orientation", summary: "Orientation set to top_to_bottom" }],
      graphUpdated: false,
      newOrientation: "top_to_bottom"
    };
  }

  return {
    reply: `I have noted: "${message}". Connect to the server to perform automated extraction and relationship updates.`,
    actionsExecuted: [],
    graphUpdated: false
  };
}
