import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listAutoQueryExamples, listDatasources, syncQueryExamplesFromHistory, getQueryExecutionStats, getFeedbackStatsBySQL } from "../../store.js";
import { tokenize } from "./tokenizer.js";

const LookupExamplesParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  query: Type.String({ description: "The user's question to find similar examples for" }),
});

type LookupExamplesParams = Static<typeof LookupExamplesParams>;

export function createLookupExamplesTool(): AgentTool<typeof LookupExamplesParams, { exampleCount: number }> {
  return {
    name: "lookup_examples",
    description: "Search for similar past queries that were successfully executed. Returns up to 3 question-SQL pairs as Few-Shot examples for SQL generation. Results are ranked by keyword relevance, verified status, and real execution success rate from sql_query_history.",
    label: "Lookup Examples",
    parameters: LookupExamplesParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as LookupExamplesParams;
      try {
        // Sync query examples from execution history to keep examples fresh
        try { syncQueryExamplesFromHistory(typedParams.datasource_id); } catch { /* non-critical */ }

        const keywords = tokenize(typedParams.query);

        const allExamples = listAutoQueryExamples(typedParams.datasource_id);
        const execStats = getQueryExecutionStats(typedParams.datasource_id);
        const feedbackStats = getFeedbackStatsBySQL(typedParams.datasource_id);

        // Only return verified or high-success examples
        const qualityExamples = allExamples.filter(ex => ex.is_verified === 1 || ex.success_count >= 3);

        // Exclude examples with heavy negative feedback (≥3 negative, 0 positive)
        const feedbackFiltered = qualityExamples.filter(ex => {
          const fbStats = feedbackStats.get(ex.sql);
          if (!fbStats) return true;
          return !(fbStats.negativeCount >= 3 && fbStats.positiveCount === 0);
        });

        // Score each example by keyword overlap + execution history reliability
        const scored = feedbackFiltered.map(ex => {
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
          // Boost by execution history stats: more real successes = more reliable example
          const stats = execStats.get(ex.sql);
          if (stats) {
            score += Math.min(stats.successCount, 5);
            if (stats.errorCount > stats.successCount) score -= 3; // penalize error-prone SQL
          }
          // Feedback-based scoring: negative feedback penalizes, positive boosts
          const fbStats = feedbackStats.get(ex.sql);
          if (fbStats) {
            score += Math.min(fbStats.positiveCount, 3);  // +1 per positive, max +3
            score -= Math.min(fbStats.negativeCount * 2, 10);  // -2 per negative, max -10
          }
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
            execution_count: (() => { const st = execStats.get(s.ex.sql); return st ? st.successCount : s.ex.success_count; })(),
          }));

        if (top3.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No similar query examples found. Generate SQL from scratch using discover_schema context." }],
            details: { exampleCount: 0 },
          };
        }

        const outputText = `Found ${top3.length} similar query examples (Few-Shot reference):\n\n${top3.map((ex, i) => `${i + 1}. Question: "${ex.question}"\n   SQL: ${ex.sql}\n   Verified: ${ex.is_verified ? "Yes" : "No"}\n   Executed successfully: ${ex.execution_count} times`).join("\n\n")}\n\nUse these as reference when generating SQL for the user's question. Adapt the SQL patterns to the current question, don't copy verbatim.`;

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
