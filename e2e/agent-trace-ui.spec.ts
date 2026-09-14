import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3000';
const TEST_API = `${API_URL}/api/test`;
const BASE_URL = 'http://localhost:5173';

function uid(): string {
  return `t${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a trace with per-tool rationale via the test-helpers route so the
 * Agent 追踪 page has a record to render. Returns the trace id and the
 * unique user-question marker used (so selectors stay unambiguous across
 * retries / prior runs).
 */
async function seedTrace(request: any): Promise<{ id: string; marker: string }> {
  const dsRes = await request.post(`${TEST_API}/datasources`, {
    data: { name: `ui_ds_${uid()}` },
  });
  const ds = await dsRes.json();

  // Unique marker per trace so list selectors don't collide across retries.
  const marker = `Q${uid()}`;
  const userQuestion = `UI测试 ${marker} 查询本月销售额`;

  const toolDetails = JSON.stringify([
    {
      turn: 1,
      thinking: `${marker} 先查语义层。`,
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

  const res = await request.post(`${TEST_API}/agent-traces`, {
    data: {
      conversation_id: `conv_${uid()}`,
      datasource_id: ds.id,
      datasource_name: ds.name,
      user_question: userQuestion,
      agent_type: 'query',
      tool_sequence: JSON.stringify(['lookup_semantic_layer', 'execute_sql']),
      tool_details: toolDetails,
      thinking_summary: `${marker} 先查语义层。`,
      decision_rationale: `用户问题：${userQuestion}\n[步骤1] 调用 lookup_semantic_layer`,
      final_sql: 'SELECT SUM(amount) FROM orders',
      total_tool_calls: 2,
      total_turns: 1,
      used_semantic_layer: 1,
      self_corrected: 0,
      duration_ms: 1200,
    },
  });
  expect(res.status()).toBe(201);
  const trace = await res.json();
  return { id: trace.id, marker };
}

test.describe('Agent Traces page — decision chain UI', () => {
  test('navigates to Agent 追踪, selects a trace, and shows the decision chain timeline', async ({ page, request }) => {
    const { marker } = await seedTrace(request);
    const questionText = `UI测试 ${marker} 查询本月销售额`;

    await page.goto(BASE_URL);
    // The onboarding check gates rendering; wait for the app shell.
    await expect(page.getByRole('heading', { name: 'DataNova' })).toBeVisible({ timeout: 15000 });

    // Click the "Agent 追踪" sidebar nav item.
    await page.getByRole('button', { name: 'Agent 追踪' }).click();

    // Page header appears.
    await expect(page.getByRole('heading', { name: 'Agent 追踪' })).toBeVisible();
    await expect(page.getByText('监控智能问数 Agent 的决策路径')).toBeVisible();

    // The seeded trace shows up in the list (by its unique user question).
    await expect(page.getByText(questionText)).toBeVisible({ timeout: 10000 });

    // Select it — the detail panel renders.
    await page.getByText(questionText).click();

    // Decision analysis tags render (exact match to disambiguate from the
    // stats-bar "语义层命中率" label).
    await expect(page.getByText('语义层命中', { exact: true })).toBeVisible();

    // The "链路综述 · 抉择路径" section shows the synthesized rationale.
    await expect(page.getByText('链路综述 · 抉择路径')).toBeVisible();

    // The decision chain timeline header renders (with the click hint).
    await expect(page.getByText('工具调用链路（点击节点查看抉择理由）')).toBeVisible();

    // The compact tool labels render in the list row.
    await expect(page.getByText('语义层', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('SQL执行').first()).toBeVisible();

    // Expand the first tool node — its per-tool rationale should appear.
    // The nodes are buttons labeled with T{turn}·#{n}.
    await page.getByText('T1·#1').click();
    await expect(page.getByText('抉择理由 · 为什么调用此工具')).toBeVisible();
    await expect(page.getByText(`${marker} 先查语义层。`)).toBeVisible();

    // The "管理员链路审计" section with the audit button is present.
    await expect(page.getByText('管理员链路审计 · 反推决策链')).toBeVisible();
    await expect(page.getByRole('button', { name: /审计链路/ })).toBeVisible();
  });

  test('clicking 审计链路 invokes infer-chain and renders the verdict', async ({ page, request }) => {
    const { marker } = await seedTrace(request);
    const questionText = `UI测试 ${marker} 查询本月销售额`;

    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: 'DataNova' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agent 追踪' }).click();
    await page.getByText(questionText).click();

    // Trigger the audit. The button label toggles between "审计链路" / "重新审计".
    await page.getByRole('button', { name: /审计链路|重新审计/ }).click();

    // Either a real LLM verdict or the graceful fallback renders. Both surface
    // a "链路判定" chip — wait for it. Allow generous time for the LLM call.
    await expect(page.getByText(/^链路判定：/).first()).toBeVisible({ timeout: 30000 });
  });

  test('filtering by 自修复 hides non-self-corrected traces', async ({ page, request }) => {
    // Seed a non-self-corrected trace with a unique marker.
    const { marker } = await seedTrace(request);
    const questionText = `UI测试 ${marker} 查询本月销售额`;

    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: 'DataNova' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agent 追踪' }).click();

    // Before filtering, our seeded question is visible.
    await expect(page.getByText(questionText)).toBeVisible({ timeout: 10000 });

    // Toggle the 自修复 filter.
    await page.getByLabel(/仅看自修复/).check();

    // After filtering, the non-self-corrected trace is gone from the list.
    await expect(page.getByText(questionText)).toHaveCount(0, { timeout: 10000 });
  });
});
