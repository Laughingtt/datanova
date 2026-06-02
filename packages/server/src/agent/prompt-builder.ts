import { formatSkillsForSystemPrompt } from "@earendil-works/pi-agent-core";
import type { Skill } from "@earendil-works/pi-agent-core";
import { getAnnotations } from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";
import { formatSchemaForPrompt } from "../mysql/discovery.js";

export interface DataNovaSystemPromptOptions {
  datasourceId?: string;
  datasourceName?: string;
  skills?: Skill[];
  customInstructions?: string;
}

export function buildDataNovaSystemPrompt(options: DataNovaSystemPromptOptions): string {
  const parts: string[] = [];

  // Base instructions
  parts.push(`You are DataNova, an expert AI assistant for SQL query generation and database analysis.

Your primary role is to help users:
1. Understand database schemas and relationships
2. Write correct and efficient SQL queries
3. Analyze query results and provide insights
4. Translate natural language questions into SQL

Guidelines:
- Always use the discover_schema tool first to understand the database structure before writing queries
- Only generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or DDL statements
- Explain your reasoning before writing SQL
- Format SQL queries clearly with proper indentation
- When results are returned, provide a clear analysis of what the data shows
- If a query might be slow or return many rows, suggest adding LIMIT clauses
- Use business-friendly language when explaining technical concepts
- Reference table and column annotations when available to understand business context`);

  // Datasource info
  if (options.datasourceId && options.datasourceName) {
    parts.push(`\n## Current Datasource\nYou are connected to datasource "${options.datasourceName}" (ID: ${options.datasourceId}).\nUse this datasource_id when calling tools.`);
  }

  // Skills
  if (options.skills && options.skills.length > 0) {
    parts.push("\n## Available Skills\n");
    parts.push(formatSkillsForSystemPrompt(options.skills));
  }

  // Custom instructions
  if (options.customInstructions) {
    parts.push(`\n## Additional Instructions\n${options.customInstructions}`);
  }

  return parts.join("\n");
}

/**
 * Build a dynamic system prompt that includes schema context.
 * This is used as a callback in AgentHarness options.
 */
export function createSystemPromptCallback(
  baseOptions: DataNovaSystemPromptOptions
): (context: {
  resources: { skills?: Skill[] };
}) => string | Promise<string> {
  return (context) => {
    const skills = context.resources?.skills ?? baseOptions.skills ?? [];
    const mergedOptions: DataNovaSystemPromptOptions = {
      ...baseOptions,
      skills,
    };
    return buildDataNovaSystemPrompt(mergedOptions);
  };
}
