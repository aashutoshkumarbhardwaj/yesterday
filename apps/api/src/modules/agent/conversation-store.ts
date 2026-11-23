export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  actionsExecuted?: Array<{ toolName: string; summary: string }>;
}

export interface ConversationSession {
  conversationId: string;
  familyId: string;
  userId: string;
  focusPersonId?: string | undefined;
  focusPersonName?: string | undefined;
  pendingClarification?: string | undefined;
  turns: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

// In-memory session store with persistent map
const sessions = new Map<string, ConversationSession>();

export function getOrCreateSession(
  conversationId: string,
  familyId = "default-family",
  userId = "user_default"
): ConversationSession {
  let session = sessions.get(conversationId);
  if (!session) {
    const now = new Date().toISOString();
    session = {
      conversationId,
      familyId,
      userId,
      turns: [],
      createdAt: now,
      updatedAt: now
    };
    sessions.set(conversationId, session);
  }
  return session;
}

export function getSession(conversationId: string): ConversationSession | undefined {
  return sessions.get(conversationId);
}

export function updateSessionFocus(
  conversationId: string,
  personId: string | undefined,
  personName?: string | undefined
): void {
  const session = sessions.get(conversationId);
  if (session) {
    session.focusPersonId = personId;
    if (personName) session.focusPersonName = personName;
    session.updatedAt = new Date().toISOString();
  }
}

export function addTurnToSession(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  extras?: {
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    actionsExecuted?: Array<{ toolName: string; summary: string }>;
  }
): void {
  const session = getOrCreateSession(conversationId);
  const turn: ConversationTurn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    ...(extras?.toolCalls ? { toolCalls: extras.toolCalls } : {}),
    ...(extras?.actionsExecuted ? { actionsExecuted: extras.actionsExecuted } : {})
  };
  session.turns.push(turn);
  session.updatedAt = new Date().toISOString();
}

/**
 * Resolves third-person pronouns across English, Hindi, and regional dialects like Bhojpuri
 * (English: "he", "she", "they", "him", "her", "his"
 *  Bhojpuri: "ऊ" / "ओह" / "उनकर" / "ओहनकर" / "ई"
 *  Hindi: "वह" / "वे" / "उसने" / "उन्होंने" / "उनका" / "उनकी" / "उसके")
 * to the active focus person if the prompt begins with or heavily relies on a pronoun.
 */
export function resolvePronounsInContext(
  message: string,
  focusPersonName?: string
): { resolvedMessage: string; inferredPersonName?: string } {
  if (!focusPersonName) {
    return { resolvedMessage: message };
  }

  const trimmed = message.trim();
  // Check if message starts with English, Hindi, or Bhojpuri pronouns
  const startsWithPronoun = /^(he|she|they|his|her|him|woh|wo|unka|unki|unhone|usne|unke|unkar|ohankar|ऊ|ओह|उनकर|ओहनकर|ई|वह|वे|उसने|उन्होंने|उनका|उनकी|उसके)\b/i.test(trimmed);
  if (startsWithPronoun) {
    // E.g. "ऊ रेलवे में काम करत रहलन" -> "[Regarding Rajesh Sharma]: ऊ रेलवे में काम करत रहलन"
    return {
      resolvedMessage: `[Regarding ${focusPersonName}]: ${trimmed}`,
      inferredPersonName: focusPersonName
    };
  }

  return { resolvedMessage: message };
}
