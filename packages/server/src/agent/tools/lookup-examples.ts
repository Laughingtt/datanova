import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listAutoQueryExamples, listDatasources } from "../../store.js";

const LookupExamplesParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  query: Type.String({ description: "The user's question to find similar examples for" }),
});

type LookupExamplesParams = Static<typeof LookupExamplesParams>;

export function createLookupExamplesTool(): AgentTool<typeof LookupExamplesParams, { exampleCount: number }> {
  return {
    name: "lookup_examples",
    description: "Search for similar past queries that were successfully executed. Returns up to 3 question-SQL pairs as Few-Shot examples for SQL generation.",
    label: "Lookup Examples",
    parameters: LookupExamplesParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as LookupExamplesParams;
      try {
        const queryLower = typedParams.query.toLowerCase();
        const keywords = queryLower.split(/\s+|(?=[一-鿿])/).filter(w => w.length > 1);

        const allExamples = listAutoQueryExamples(typedParams.datasource_id);

        // P2-C4: Only return verified or high-success examples
        const qualityExamples = allExamples.filter(ex => ex.is_verified === 1 || ex.success_count >= 3);

        // Score each example by keyword overlap
        const scored = qualityExamples.map(ex => {
          const questionLower = ex.question.toLowerCase();
          let score = 0;
          for (const kw of keywords) {
            if (questionLower.includes(kw)) score += 2;
            try {
              const tablesUsed = JSON.parse(ex.tables_used) as string[];
              for (const t of tablesUsed) {
                if (t.toLowerCase().includes(kw)) score += 1;
              }
            } catch { /* skip */ }
          }
          if (ex.is_verified === 1) score += 3;
          score += Math.min(ex.success_count, 5);
          return { ex, score };
        });

        const top3 = scored
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(s => ({
            question: s.ex.question,
            sql: s.ex.sql,
            is_verified: s.ex.is_verified === 1,
          }));

        if (top3.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No similar query examples found. Generate SQL from scratch using discover_schema context." }],
            details: { exampleCount: 0 },
          };
        }

        const outputText = `Found ${top3.length} similar query examples (Few-Shot reference):\n\n${top3.map((ex, i) => `${i + 1}. Question: "${ex.question}"\n   SQL: ${ex.sql}\n   Verified: ${ex.is_verified ? "Yes" : "No"}`).join("\n\n")}\n\nUse these as reference when generating SQL for the user's question. Adapt the SQL patterns to the current question, don't copy verbatim.`;

        return {
          content: [{ type: "text" as const, text: outputText }],
          details: { exampleCount: top3.length },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error looking up examples: ${(err as Error).message}` }],
          details: { exampleCount: 0 },
          isError: true,
        };
      }
    },
  };
}