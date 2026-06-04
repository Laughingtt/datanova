import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema } from "../../mysql/discovery.js";
import { getAnnotations, listDatasources } from "../../store.js";
import { formatSchemaForPrompt } from "../../mysql/discovery.js";

const DiscoverSchemaParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to discover schema for. If you don't know the ID, use any string and the tool will return a list of available datasources." }),
  table_names: Type.Optional(Type.Array(Type.String(), {
    description: "Optional list of specific table names to discover. If omitted, all tables are returned.",
  })),
});

type DiscoverSchemaParams = Static<typeof DiscoverSchemaParams>;

export function createDiscoverSchemaTool(): AgentTool<typeof DiscoverSchemaParams, { tableCount: number }> {
  return {
    name: "discover_schema",
    description: "Discover the database schema (tables, columns, foreign keys) for a datasource. Use this to understand the database structure before writing SQL queries. If the datasource_id is unknown or invalid, the tool will return a list of all available datasources with their IDs.",
    label: "Discover Schema",
    parameters: DiscoverSchemaParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as DiscoverSchemaParams;
      try {
        // Check if the datasource_id is valid — if not, list available datasources
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          if (enabledDatasources.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No datasources are currently configured. Please configure a MySQL datasource first in the Datasources page, then try again." }],
              details: { tableCount: 0 },
            };
          }

          const dsList = enabledDatasources.map(ds =>
            `  - Name: "${ds.name}" | ID: ${ds.id} | Host: ${ds.host}:${ds.port}/${ds.database}`
          ).join("\n");

          return {
            content: [{ type: "text" as const, text: `The datasource_id "${typedParams.datasource_id}" is not valid. Please use one of the following available datasources:\n\n${dsList}\n\nCall discover_schema again with a valid datasource_id from the list above.` }],
            details: { tableCount: 0 },
          };
        }

        const schema = await discoverSchema(
          typedParams.datasource_id,
          typedParams.table_names
        );

        // Get annotations and build map
        const annotations = getAnnotations(typedParams.datasource_id);
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