import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema, discoverValueDomains, formatSchemaForPrompt } from "../../mysql/discovery.js";
import { getAnnotations, listQueryExamples, listDatasources, upsertDomainAnnotation } from "../../store.js";
import { setSchemaCache } from "../../mysql/validator.js";

const DiscoverSchemaParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to discover schema for. If you don't know the ID, use any string and the tool will return a list of available datasources." }),
  table_names: Type.Optional(Type.Array(Type.String(), {
    description: "Optional list of specific table names to discover. If omitted, all tables are returned.",
  })),
  discover_domains: Type.Optional(Type.Boolean({
    description: "If true, also discover value domains for columns (enum values, numeric ranges). Default: false. Set to true when setting up a new datasource for the first time.",
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

        // Populate schema cache for SQL validation
        const columnsByTable = new Map<string, string[]>();
        for (const tableSchema of schema.tables) {
          columnsByTable.set(tableSchema.table.name, tableSchema.columns.map(c => c.name));
        }
        setSchemaCache(typedParams.datasource_id, schema.tables.map(t => t.table.name), columnsByTable);

        // Discover value domains if requested (P1-C5: opt-in)
        if (typedParams.discover_domains) {
          for (const tableSchema of schema.tables) {
            const domains = await discoverValueDomains(typedParams.datasource_id, tableSchema);
            for (const domain of domains) {
              upsertDomainAnnotation({
                datasource_id: typedParams.datasource_id,
                table_name: domain.tableName,
                field_name: domain.columnName,
                annotation: domain.annotation,
                status: "confirmed",
                domain_type: domain.domainType,
                domain_values: domain.domainValues,
              });
            }
          }
        }

        // Get annotations and query examples
        const annotations = getAnnotations(typedParams.datasource_id);
        const queryExamples = listQueryExamples(typedParams.datasource_id);

        const formatted = formatSchemaForPrompt(schema, annotations, queryExamples);

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
