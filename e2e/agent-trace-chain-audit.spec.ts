import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3000';
const TEST_API = `${API_URL}/api/test`;
const TRACE_API = `${API_URL}/api/agent-traces`;

function uid(): string {
  return `t${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestDatasource(request: any): Promise<string> {
  const res = await request.post(`${TEST_API}/datasources`, {
    data: { name: `ds_${uid()}` },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.id;
}

/**
 * Create an agent_trace directly via the test-helpers route. This lets us test
 * the chain-audit endpoint end-to-end without a live LLM/agent run.
 */
async function createTestTrace(
  request: any,
  overrides: Record<string, any> = {}
): Promise<string> {
  const toolDetails = overrides.tool_details ?? JSON.stringify([
    {
      turn: 1,
      thinking: '用户问销售额，先查语义层。',
      tool: 'lookup_semantic_layer',
      args_summary: 'query: "销售额"',
      result_summary: '命中语义层指标',
      is_error: false,
    },
    {
      turn: 1,
      thinking: '语义层命中，直接执行返回的 SQL。',
      tool: 'execute_sql',
      args_summary: 'sql: SELECT SUM(amount) FROM orders',
      result_summary: '返回 1 行',
      is_error: false,
    },
  ]);
  const body = {
    conversation_id: `conv_${uid()}`,
    user_question: '查询本月销售额',
    agent_type: 'query',
    tool_sequence: overrides.tool_sequence ?? JSON.stringify(['lookup_semantic_layer', 'execute_sql']),
    tool_details: toolDetails,
    thinking_summary: overrides.thinking_summary ?? '用户问销售额，先查语义层。',
    decision_rationale: overrides.decision_rationale ?? '用户问题：查询本月销售额',
    final_sql: overrides.final_sql ?? 'SELECT SUM(amount) FROM orders',
    total_tool_calls: overrides.total_tool_calls ?? 2,
    total_turns: overrides.total_turns ?? 1,
    used_semantic_layer: overrides.used_semantic_layer ?? 1,
    self_corrected: overrides.self_corrected ?? 0,
    duration_ms: overrides.duration_ms ?? 1200,
    ...overrides,
  };
  const res = await request.post(`${TEST_API}/agent-traces`, { data: body });
  expect(res.status()).toBe(201);
  const created = await res.json();
  expect(created.id).toBeDefined();
  return created.id;
}

test.describe('Agent trace chain audit', () => {
  test('trace carries tool_details with per-tool thinking + decision_rationale', async ({ request }) => {
    const traceId = await createTestTrace(request);

    const res = await request.get(`${TRACE_API}/${traceId}`);
    expect(res.status()).toBe(200);
    const trace = await res.json();

    // decision_rationale column exists and is populated
    expect(trace.decision_rationale).toBeTruthy();
    expect(trace.decision_rationale).toContain('查询本月销售额');

    // tool_details carries per-tool rationale
    const details = JSON.parse(trace.tool_details);
    expect(details).toHaveLength(2);
    expect(details[0].thinking).toContain('语义层');
    expect(details[1].thinking).toContain('执行');
  });

  test('infer-chain returns trace_not_found for unknown id', async ({ request }) => {
    const res = await request.post(`${TRACE_API}/no-such-trace/infer-chain`, {
      data: {},
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('未找到');
  });

  test('infer-chain reconstructs the decision chain (graceful when no LLM key)', async ({ request }) => {
    const traceId = await createTestTrace(request);

    const res = await request.post(`${TRACE_API}/${traceId}/infer-chain`, {
      data: { focus: '为什么走了语义层' },
    });
    // 200 whether or not an LLM key is configured — the tool degrades gracefully.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reconstructed).toBe(true);
    expect(body.step_count).toBe(2);
    expect(body.trace_id).toBe(traceId);
    // Either a real LLM reconstruction or the deterministic fallback — both are valid.
    expect(body.chain).toBeDefined();
    const chain = body.chain;
    expect(chain.chain_verdict).toBeTruthy();
    expect(Array.isArray(chain.decision_points)).toBe(true);
  });

  test('infer-chain handles a trace with empty tool_details', async ({ request }) => {
    const traceId = await createTestTrace(request, {
      tool_details: JSON.stringify([]),
      total_tool_calls: 0,
      self_corrected: 1,
    });

    const res = await request.post(`${TRACE_API}/${traceId}/infer-chain`, {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Empty tool_details → not fully reconstructed, but returns a fallback chain.
    expect(body.reconstructed).toBe(false);
    expect(body.reason).toBe('no_tool_details');
    expect(body.chain.chain_verdict).toBe('信息不足');
    expect(body.chain.self_correction_analysis).toContain('自修复');
  });

  test('trace lists include the new decision_rationale field', async ({ request }) => {
    const traceId = await createTestTrace(request, {
      decision_rationale: 'unique-rationale-marker-xyz',
    });

    const res = await request.get(`${TRACE_API}?limit=100`);
    expect(res.status()).toBe(200);
    const traces = await res.json();
    const found = traces.find((t: any) => t.id === traceId);
    expect(found).toBeDefined();
    expect(found.decision_rationale).toContain('unique-rationale-marker-xyz');
  });
});

test.describe('Agent trace datasource scoping', () => {
  test('traces can be scoped by datasourceId', async ({ request }) => {
    const dsId = await createTestDatasource(request);
    const traceId = await createTestTrace(request, {
      datasource_id: dsId,
      datasource_name: `ds_${dsId}`,
    });

    const res = await request.get(`${API_URL}/api/datasources/${dsId}/agent-traces`);
    expect(res.status()).toBe(200);
    const traces = await res.json();
    const found = traces.find((t: any) => t.id === traceId);
    expect(found).toBeDefined();
    expect(found.datasource_id).toBe(dsId);
  });
});
