import { formatSkillsForSystemPrompt } from "@earendil-works/pi-agent-core";
import type { Skill } from "@earendil-works/pi-agent-core";
import { getAnnotations } from "../store.js";
import { listDatasources } from "../store.js";
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

  // Datasource info — always list available datasources so the agent knows what's available
  const allDatasources = listDatasources();
  const enabledDatasources = allDatasources.filter(ds => ds.enabled);

  if (enabledDatasources.length > 0) {
    const dsList = enabledDatasources.map(ds =>
      `- "${ds.name}" (ID: ${ds.id}, host: ${ds.host}:${ds.port}/${ds.database})`
    ).join("\n");

    if (options.datasourceId) {
      const selectedDs = enabledDatasources.find(ds => ds.id === options.datasourceId);
      if (selectedDs) {
        parts.push(`\n## Datasources\nThe user is currently connected to datasource "${selectedDs.name}" (ID: ${selectedDs.id}). Always use this datasource_id when calling tools.\n\nAll available datasources:\n${dsList}`);
      } else {
        parts.push(`\n## Datasources\nNo datasource is currently selected. Ask the user which datasource they want to use, or pick the most relevant one from the list below.\n\nAvailable datasources:\n${dsList}`);
      }
    } else {
      parts.push(`\n## Datasources\nNo datasource is currently selected. When the user asks about data, use discover_schema or execute_sql with one of the following datasource IDs. If unsure which one to use, ask the user.\n\nAvailable datasources:\n${dsList}`);
    }
  } else {
    parts.push(`\n## Datasources\nNo datasources are currently configured. If the user asks about data, tell them they need to configure a datasource first in the Datasources page.`);
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
