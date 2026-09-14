import { describe, test, expect } from "vitest";
import { extractTraceAnalytics } from "../chat-handler.js";

/**
 * Tests for the tool-level thinking binding and decision_rationale synthesis.
 *
 * These verify the core of the goal: that each tool call in a trace carries
 * its own "why I chose this tool" rationale (from thinkingBefore), that
 * self-correction is detected, and that decision_rationale is synthesized.
 *
 * PRODUCTION REALITY: accumulateStreamingState pushes a tool_call step on
 * tool_execution_start, then MUTATES that SAME step into a tool_result step
 * when the tool completes (carrying forward toolName/args/thinkingBefore and
 * adding result/isError). So a completed tool is a SINGLE tool_result step —
 * there is no separate tool_call step left. The mutated-toolResult() helper
 * below mirrors this exactly; the tests guard against the regression where
 * extractTraceAnalytics filtered only for type==="tool_call" and saw zero tools.
 */

type Step = Record<string, unknown>;

function thinking(content: string): Step {
  return { type: "thinking", content };
}
function turnStart(): Step {
  return { type: "turn_start" };
}
function turnEnd(): Step {
  return { type: "turn_end" };
}
/**
 * The production mutation: a single step that started life as a tool_call and
 * was rewritten to type tool_result on completion, keeping toolName/args/
 * thinkingBefore AND gaining result/isError. This is what real persisted steps
 * look like — a tool_call step only survives if the tool never completed.
 */
function mutatedToolResult(
  toolName: string,
  args: any,
  result: any,
  isError = false,
  thinkingBefore = "",
): Step {
  return { type: "tool_result", toolName, args, thinkingBefore, result, isError };
}
/** A pure tool_call that never received its result (tool did not complete). */
function toolCall(toolName: string, args: any, thinkingBefore?: string): Step {
  return { type: "tool_call", toolName, args, thinkingBefore: thinkingBefore ?? "" };
}

describe("extractTraceAnalytics — tool-level rationale binding", () => {
  test("each tool call carries its own thinkingBefore rationale, not the shared turn thinking", () => {
    const steps: Step[] = [
      turnStart(),
      thinking("用户问销售额，先查语义层。"),
      mutatedToolResult(
        "lookup_semantic_layer",
        { query: "销售额" },
        { details: { matched: true } },
        false,
        "用户问销售额，先查语义层。",
      ),
      turnEnd(),
      turnStart(),
      thinking("语义层命中，直接执行返回的 SQL。"),
      mutatedToolResult(
        "execute_sql",
        { sql: "SELECT SUM(amount) FROM orders" },
        { details: { rowCount: 5, sql: "SELECT SUM(amount) FROM orders" } },
        false,
        "语义层命中，直接执行返回的 SQL。",
      ),
      turnEnd(),
    ];

    const trace = extractTraceAnalytics(steps, "查询销售额", "conv-1", undefined, "query", 1200);

    const details = JSON.parse(trace.tool_details);
    expect(details).toHaveLength(2);
    // Tool 1 rationale is the lookup thinking, not a shared turn fragment.
    expect(details[0].tool).toBe("lookup_semantic_layer");
    expect(details[0].thinking).toContain("先查语义层");
    // Tool 2 rationale is the execute thinking.
    expect(details[1].tool).toBe("execute_sql");
    expect(details[1].thinking).toContain("语义层命中");
    expect(details[1].thinking).not.toContain("先查语义层");
  });

  test("REGRESSION: mutated tool_result steps are counted as tool calls (not zero)", () => {
    // This is the exact production failure: every completed tool is a single
    // tool_result step (tool_call was mutated away). The trace must still show
    // total_tool_calls, tool_sequence, and tool_details matching what ran.
    const steps: Step[] = [
      turnStart(),
      thinking("先发现 Schema。"),
      mutatedToolResult("discover_schema", { datasource_id: "unknown" }, { details: { tableCount: 0 } }, false, "先发现 Schema。"),
      turnEnd(),
      turnStart(),
      thinking("再查语义层。"),
      mutatedToolResult("lookup_semantic_layer", { query: "客户及公司收入" }, { details: { matched: false } }, false, "再查语义层。"),
      turnEnd(),
      turnStart(),
      thinking("做标注。"),
      mutatedToolResult("ai_annotate_schema", {}, { details: {} }, false, "做标注。"),
      turnEnd(),
    ];

    const trace = extractTraceAnalytics(steps, "客户及公司收入相关的表有哪些", "conv-1", "mysql", "query", 12931);

    // The bug returned 0 here because no step had type==="tool_call".
    expect(trace.total_tool_calls).toBe(3);
    expect(JSON.parse(trace.tool_sequence)).toEqual([
      "discover_schema",
      "lookup_semantic_layer",
      "ai_annotate_schema",
    ]);
    const details = JSON.parse(trace.tool_details);
    expect(details).toHaveLength(3);
    expect(details[0].tool).toBe("discover_schema");
    expect(details[1].tool).toBe("lookup_semantic_layer");
    expect(details[2].tool).toBe("ai_annotate_schema");
    // Each tool carries its own thinkingBefore rationale.
    expect(details[0].thinking).toContain("先发现 Schema");
    expect(details[2].thinking).toContain("做标注");
    // Derived analytics reflect the real tool usage.
    expect(trace.used_discover_schema).toBe(1);
    expect(trace.used_semantic_layer).toBe(1);
    expect(trace.total_turns).toBe(3);
  });

  test("falls back to turn thinking when tool_call has no thinkingBefore (legacy steps)", () => {
    const steps: Step[] = [
      turnStart(),
      thinking("这是该 turn 的整体思考。"),
      // Legacy: no thinkingBefore field on the (mutated) tool step.
      mutatedToolResult("discover_schema", { table_names: ["orders"] }, { details: {} }, false, ""),
      turnEnd(),
    ];

    const trace = extractTraceAnalytics(steps, "探索表结构", "conv-1", undefined, "query", 500);
    const details = JSON.parse(trace.tool_details);
    expect(details[0].thinking).toContain("整体思考");
  });

  test("decision_rationale synthesizes per-step why + outcome", () => {
    const steps: Step[] = [
      turnStart(),
      thinking("先查语义层。"),
      mutatedToolResult("lookup_semantic_layer", { query: "GMV" }, { details: { matched: false } }, false, "先查语义层。"),
      turnEnd(),
      turnStart(),
      thinking("未命中，回退到 Schema 发现。"),
      mutatedToolResult("discover_schema", {}, { details: {} }, false, "未命中，回退到 Schema 发现。"),
      turnEnd(),
    ];

    const trace = extractTraceAnalytics(steps, "查询 GMV", "conv-1", undefined, "query", 2000);
    expect(trace.decision_rationale).toContain("用户问题：查询 GMV");
    expect(trace.decision_rationale).toContain("lookup_semantic_layer");
    expect(trace.decision_rationale).toContain("抉择理由");
    expect(trace.decision_rationale).toContain("discover_schema");
  });

  test("self_corrected is detected when execute_sql fails then retries", () => {
    // Both execute_sql invocations are mutated tool_result steps: the first
    // errored, the second succeeded. Self-correction must be detected from
    // this in-order walk (no separate tool_call step exists to key off of).
    const steps: Step[] = [
      turnStart(),
      mutatedToolResult("execute_sql", { sql: "SELECT * FROM orders GROUP BY typo" }, { details: {} }, true, "尝试第一次查询。"),
      turnEnd(),
      turnStart(),
      thinking("SQL 报错，修正列名后重试。"),
      mutatedToolResult("execute_sql", { sql: "SELECT * FROM orders" }, { details: { rowCount: 3, sql: "SELECT * FROM orders" } }, false, "SQL 报错，修正列名后重试。"),
      turnEnd(),
    ];

    const trace = extractTraceAnalytics(steps, "查询订单", "conv-1", undefined, "query", 3000);
    expect(trace.self_corrected).toBe(1);
    expect(trace.decision_rationale).toContain("自修复");
    // final_sql extracted from the last successful execute_sql
    expect(trace.final_sql).toBe("SELECT * FROM orders");
  });

  test("self_corrected stays 0 when no SQL error-then-retry occurs", () => {
    const steps: Step[] = [
      turnStart(),
      mutatedToolResult("lookup_semantic_layer", { query: "x" }, { details: { matched: true } }, false, "查语义层。"),
      turnEnd(),
    ];
    const trace = extractTraceAnalytics(steps, "查询 x", "conv-1", undefined, "query", 400);
    expect(trace.self_corrected).toBe(0);
  });

  test("agentType is recorded on the trace", () => {
    const steps: Step[] = [
      turnStart(),
      mutatedToolResult("check_metric_conflict", { name: "gmv" }, { details: { has_conflict: false } }, false, "检查冲突。"),
      turnEnd(),
    ];
    const trace = extractTraceAnalytics(steps, "新建 GMV 指标", "conv-1", undefined, "metric_dev", 800);
    expect(trace.agent_type).toBe("metric_dev");
  });

  test("thinking_summary is expanded (no longer capped at 500 chars)", () => {
    const longThinking = "推理".repeat(400); // 800 chars
    const steps: Step[] = [
      turnStart(),
      thinking(longThinking),
      mutatedToolResult("lookup_semantic_layer", { query: "x" }, { details: { matched: true } }, false, longThinking),
      turnEnd(),
    ];
    const trace = extractTraceAnalytics(steps, "查询 x", "conv-1", undefined, "query", 500);
    // Expanded cap is 2000 — the full 800-char thinking survives.
    expect(trace.thinking_summary.length).toBe(800);
  });

  test("derived analytics flags reflect the tool sequence", () => {
    const steps: Step[] = [
      turnStart(),
      mutatedToolResult("lookup_semantic_layer", { query: "x" }, { details: { matched: true } }, false, "查语义层。"),
      turnEnd(),
      turnStart(),
      mutatedToolResult("read_skill", { skill_name: "qs-1" }, { details: {} }, false, "读技能。"),
      turnEnd(),
    ];
    const trace = extractTraceAnalytics(steps, "查询 x", "conv-1", undefined, "query", 600);
    expect(trace.used_semantic_layer).toBe(1);
    expect(trace.used_skill).toBe(1);
    expect(trace.used_discover_schema).toBe(0);
    expect(trace.used_examples).toBe(0);
  });

  test("an incomplete tool_call (tool never completed) is still recorded", () => {
    // If a tool_call step survived (no tool_result ever arrived), it must still
    // appear as an invocation with a "等待结果" outcome and no error.
    const steps: Step[] = [
      turnStart(),
      thinking("发起发现。"),
      toolCall("discover_schema", { datasource_id: "mysql" }, "发起发现。"),
      turnEnd(),
    ];
    const trace = extractTraceAnalytics(steps, "查询", "conv-1", undefined, "query", 100);
    expect(trace.total_tool_calls).toBe(1);
    const details = JSON.parse(trace.tool_details);
    expect(details[0].tool).toBe("discover_schema");
    expect(details[0].result_summary).toBe("等待结果");
    expect(details[0].is_error).toBe(false);
  });
});
