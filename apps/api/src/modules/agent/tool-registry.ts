import {
  AgentToolDefinition,
  addPersonAliasTool,
  changeTreeOrientationTool,
  createLifeEventTool,
  createPersonTool,
  createRelationshipTool,
  getAncestorsTool,
  getDescendantsTool,
  getPersonDetailsTool,
  getRelationshipPathTool,
  retrievePersonTimelineTool,
  searchPeopleTool,
  updatePersonTool,
  inviteRelativeTool,
  getFamilyActivityTool,
  shareMemoryTool,
  listContributorMemoriesTool,
  ToolContext
} from "../tools/family-tools.js";

const ALL_TOOLS: AgentToolDefinition[] = [
  searchPeopleTool,
  getPersonDetailsTool,
  createPersonTool,
  updatePersonTool,
  addPersonAliasTool,
  createRelationshipTool,
  getRelationshipPathTool,
  getAncestorsTool,
  getDescendantsTool,
  changeTreeOrientationTool,
  createLifeEventTool,
  retrievePersonTimelineTool,
  inviteRelativeTool,
  getFamilyActivityTool,
  shareMemoryTool,
  listContributorMemoriesTool
];

export function getToolRegistry(): Map<string, AgentToolDefinition> {
  const map = new Map<string, AgentToolDefinition>();
  for (const t of ALL_TOOLS) {
    // SECURITY GUARD: Ensure no delete tools can ever be registered
    if (/delete|remove|erase|drop|destroy/i.test(t.name)) {
      throw new Error(`CRITICAL SECURITY VIOLATION: Tool "${t.name}" violates agent deletion policy.`);
    }
    map.set(t.name, t);
  }
  return map;
}

export function getToolDefinitionsForLLM() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    riskLevel: t.riskLevel
  }));
}

export async function executeAgentTool(
  toolName: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const registry = getToolRegistry();
  const tool = registry.get(toolName);

  if (!tool) {
    return {
      success: false,
      error: `Tool "${toolName}" is not permitted or does not exist.`
    };
  }

  // Security role check: viewer cannot modify data
  if (ctx.userRole === "viewer" && tool.riskLevel !== "low") {
    return {
      success: false,
      error: `Access denied: Role "${ctx.userRole}" does not have permission to execute "${toolName}".`
    };
  }

  // Validate args with Zod schema
  const parseResult = tool.schema.safeParse(rawArgs);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Invalid parameters for tool "${toolName}": ${JSON.stringify(parseResult.error.flatten())}`
    };
  }

  try {
    const result = await tool.execute(parseResult.data, ctx);
    return {
      success: true,
      result
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || `Error executing ${toolName}`
    };
  }
}

