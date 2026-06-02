import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema } from "../../mysql/discovery.js";
import { getAnnotations } from "../../store.js";
import { formatSchemaForPrompt } from "../../mysql/discovery.js";

const DiscoverSchemaParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to discover schema for" }),
  table_names: Type.Optional(Type.Array(Type.String(), {
    description: "Optional list of specific table names to discover. If omitted, all tables are returned.",
  })),
});

type DiscoverSchemaParams = Static<typeof DiscoverSchemaParams>;

export function createDiscoverSchemaTool(): AgentTool<typeof DiscoverSchemaParams, { tableCount: number }> {
  return {
    name: "discover_schema",
    description: "Discover the database schema (tables, columns, foreign keys) for a datasource. Use this to understand the database structure before writing SQL queries.",
    label: "Discover Schema",
    parameters: DiscoverSchemaParams,
    execute: async (_toolCallId: string, params: DiscoverSchemaParams) => {
      try {
        const schema = await discoverSchema(
          params.datasource_id,
          params.table_names
        );

        // Get annotations and build map
        const annotations = getAnnotations(params.datasource_id);
        const annotationMap = new Map<string, string>();
        for (const ann of annotations) {
          const key = ann.field_name
            ? `${ann.table_name}.${ann.field_name}`
            : ann.table_name;
          annotationMap.set(key, ann.annotation);
        }

        const formatted = formatSchemaForPrompt(schema, annotationMap);

        return {
          content: [{ type: "text" as const, text: formatted }],
          details: { tableCount: schema.tables.length },
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error discovering schema: ${error.message}` }],
          details: { tableCount: 0 },
          isError: true,
        };
      }
    },
  };
}
