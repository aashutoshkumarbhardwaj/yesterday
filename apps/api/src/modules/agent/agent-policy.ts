export interface PolicyDecision {
  allowed: boolean;
  requiresConfirmation?: boolean;
  refusalReason?: string;
  clarificationQuestion?: string;
}

export function evaluateAgentPolicy(
  userMessage: string,
  toolName?: string
): PolicyDecision {
  const msgLower = userMessage.toLowerCase().trim();

  // 1. HARD REFUSAL: Agent Deletions
  if (/\b(delete|remove|erase|drop|destroy|purge|wipe|kill)\b/i.test(msgLower)) {
    return {
      allowed: false,
      refusalReason:
        "I cannot delete family records or evidence. For the historical integrity and safety of your family archive, deletions cannot be performed through conversation and must be done manually by an authorized family member in the profile settings."
    };
  }

  // If a tool tries to call an unrecognized delete action
  if (toolName && /delete|remove|erase|drop/i.test(toolName)) {
    return {
      allowed: false,
      refusalReason: "Agent deletion tools are strictly forbidden."
    };
  }

  return { allowed: true };
}
