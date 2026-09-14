import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Tests for inferAgentChain — the administrator tool that reconstructs an
 * agent's decision chain from a recorded trace.
 *
 * We mock the store (getAgentTrace) and the LLM fetch so the test is
 * deterministic and does not require real API keys.
 */

// Mock the store before importing the module under test.
// The tool imports "../../store.js" relative to tools/, i.e. src/store.js.
// From this test file (tools/__tests__/), that same store is "../../../store.js".
vi.mock("../../../store.js", () => ({
  getAgentTrace: vi.fn(),
}));

// Mock global fetch so callLlmForChain does not hit the network.
const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { inferAgentChain } from "../infer-agent-chain.js";
import { getAgentTrace } from "../../../store.js";

const mockedGetAgentTrace = vi.mocked(getAgentTrace);

function makeTrace(overrides: Record<string, any> = {}) {
  return {
    id: "trace-1",
    conversation_id: "conv-1",
    message_id: null,
    datasource_id: "ds-1",
    datasource_name: "销售库",
    user_question: "查询本月销售额",
    agent_type: "query",
    tool_sequence: JSON.stringify(["lookup_semantic_layer", "execute_sql"]),
    tool_details: JSON.stringify([
      {
        turn: 1,
        thinking: "用户问销售额，先查语义层。",
        tool: "lookup_semantic_layer",
        args_summary: 'query: "销售额"',
        result_summary: "命中语义层指标",
        is_error: false,
      },
      {
        turn: 1,
        thinking: "语义层命中，直接执行 SQL。",
        tool: "execute_sql",
        args_summary: "sql: SELECT SUM(amount) FROM orders",
        result_summary: "返回 1 行",
        is_error: false,
      },
    ]),
    thinking_summary: "用户问销售额，先查语义层。",
    decision_rationale: "用户问题：查询本月销售额\n[步骤1] 调用 lookup_semantic_layer",
    final_sql: "SELECT SUM(amount) FROM orders",
    total_tool_calls: 2,
    total_turns: 1,
    used_semantic_layer: 1,
    used_discover_schema: 0,
    used_examples: 0,
    used_skill: 0,
    self_corrected: 0,
    duration_ms: 1200,
    created_at: "2026-07-24T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  mockedGetAgentTrace.mockReset();
  // Provide an Anthropic key so the Anthropic branch is taken.
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.DEEPSEEK_API_KEY;
});

describe("inferAgentChain", () => {
  test("returns trace_not_found when the trace does not exist", async () => {
    mockedGetAgentTrace.mockReturnValue(undefined as any);

    const result = await inferAgentChain("no-such-trace");

    expect(result.reconstructed).toBe(false);
    expect(result.reason).toBe("trace_not_found");
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns no_tool_details fallback when tool_details is empty", async () => {
    mockedGetAgentTrace.mockReturnValue(makeTrace({ tool_details: "[]", self_corrected: 1 }) as any);

    const result = await inferAgentChain("trace-1");

    expect(result.reconstructed).toBe(false);
    expect(result.reason).toBe("no_tool_details");
    expect(result.chain).toBeDefined();
    const chain = result.chain as any;
    expect(chain.chain_verdict).toBe("信息不足");
    expect(chain.self_correction_analysis).toContain("自修复");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("calls the LLM and returns parsed chain reconstruction", async () => {
    mockedGetAgentTrace.mockReturnValue(makeTrace() as any);

    const llmPayload = {
      chain_summary: "Agent 先查语义层命中，再执行 SQL 返回结果。",
      decision_points: [
        { step: 1, tool: "lookup_semantic_layer", rationale: "用户问销售额，语义层最可能命中", expected: "命中已定义指标", actual: "命中", drove_next: "直接执行返回的 SQL" },
        { step: 2, tool: "execute_sql", rationale: "语义层已给 SQL", expected: "返回销售额", actual: "返回 1 行", drove_next: "" },
      ],
      self_correction_analysis: "未发生自修复。",
      chain_verdict: "合理",
      verdict_reason: "优先走语义层，链路最短。",
      improvement_suggestions: [],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(llmPayload) }] }),
    } as any);

    const result = await inferAgentChain("trace-1", "为什么没走 schema 发现");

    expect(result.reconstructed).toBe(true);
    expect(result.step_count).toBe(2);
    expect(result.chain).toEqual(llmPayload);
    // The focus is forwarded into the prompt body.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("为什么没走 schema 发现");
  });

  test("strips markdown code fences from LLM output before parsing", async () => {
    mockedGetAgentTrace.mockReturnValue(makeTrace() as any);

    const llmPayload = { chain_summary: "x", decision_points: [], self_correction_analysis: "n", chain_verdict: "合理", verdict_reason: "y", improvement_suggestions: [] };
    const fenced = "```json\n" + JSON.stringify(llmPayload) + "\n```";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: fenced }] }),
    } as any);

    const result = await inferAgentChain("trace-1");

    expect(result.reconstructed).toBe(true);
    expect(result.chain).toEqual(llmPayload);
  });

  test("degrades gracefully when no LLM API key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    mockedGetAgentTrace.mockReturnValue(makeTrace() as any);

    const result = await inferAgentChain("trace-1");

    // Without a key, the tool does not throw — it returns a deterministic fallback.
    expect(result.reconstructed).toBe(true);
    expect(result.llm_model).toBe("none");
    const chain = result.chain as any;
    expect(chain.chain_verdict).toBe("信息受限");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("passes the focus question through to the prompt", async () => {
    mockedGetAgentTrace.mockReturnValue(makeTrace() as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ chain_summary: "x", decision_points: [], self_correction_analysis: "n", chain_verdict: "合理", verdict_reason: "y", improvement_suggestions: [] }) }] }),
    } as any);

    await inferAgentChain("trace-1", "focus-on-self-correction");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("focus-on-self-correction");
  });
});
