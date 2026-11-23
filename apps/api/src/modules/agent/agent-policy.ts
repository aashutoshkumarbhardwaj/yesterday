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

  // If a tool tries to call an unrecognized delete action
  if (toolName && /delete|remove|erase|drop|purge|destroy/i.test(toolName)) {
    return {
      allowed: false,
      refusalReason: "Agent deletion tools are strictly forbidden."
    };
  }

  // HARD REFUSAL: Agent Deletions targeting records, people, memories, or relationships
  const isDeleteCommand =
    /^\s*(delete|remove|erase|purge|destroy|wipe|drop)\b/i.test(msgLower) ||
    /\b(delete|remove|erase|purge|destroy|wipe|drop)\s+(this|the|my|all|from|person|relative|member|node|profile|memory|story|relationship|connection|record|tree|data|database|family|branch)\b/i.test(msgLower) ||
    /\b(delete|remove|erase|purge|destroy|wipe)\s+([a-zA-Z0-9_-]+)(\s+from\s+(the\s+)?(tree|archive|database|family))?/i.test(msgLower);

  // Safe exemptions for common narrative phrases like "dropped out"
  const isFalsePositive = /\b(drop(ped)?\s+(out|in|by)|remove\s+(his|her|their)?\s*(shoes|hat|coat)|water\s*drops?)\b/i.test(msgLower);

  if (isDeleteCommand && !isFalsePositive) {
    return {
      allowed: false,
      refusalReason:
        "I cannot delete family records or evidence. For the historical integrity and safety of your family archive, deletions cannot be performed through conversation and must be done manually by an authorized family member in the profile settings."
    };
  }

  return { allowed: true };
}
