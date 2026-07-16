# Agent框架 + 指标开发Agent 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建Agent注册框架和指标开发Agent，让用户通过对话式交互自动开发业务指标

**Architecture:** Agent框架与业务解耦——AgentRegistry + ToolPool管理所有Agent，新增Agent只需注册配置。指标开发Agent拥有4个专用工具（validate_and_test_metric、check_metric_conflict、create_metric_draft、create_dimension_draft），复用5个共享工具，通过统一Chat中心频道化交互。现有智能问数流程零影响——query Agent走原有createHarness路径。

**Tech Stack:** Hono + Node.js ESM, @earendil-works/pi-agent-core (AgentHarness), @sinclair/typebox (参数校验), React 19 + Zustand 5 + TailwindCSS, WebSocket

**Spec:** `docs/superpowers/specs/2026-07-10-metric-dev-agent-design.md`

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `packages/server/src/agent/agent-registry.ts` | Agent注册表核心（AgentRegistry类、AgentDefinition类型、ToolPool） |
| `packages/server/src/agent/tool-registration.ts` | 全局工具注册（共享+专用） |
| `packages/server/src/agent/agent-registration.ts` | Agent业务层注册 + initAgentFramework入口 |
| `packages/server/src/agent/metric-dev-harness.ts` | 指标开发Agent的Harness工厂 |
| `packages/server/src/agent/prompt-builder-metric-dev.ts` | 指标开发Agent专用系统提示词 |
| `packages/server/src/agent/tools/validate-and-test-metric.ts` | 验证+测试指标SQL工具 |
| `packages/server/src/agent/tools/check-metric-conflict.ts` | 检查指标冲突工具 |
| `packages/server/src/agent/tools/create-metric-draft.ts` | 创建指标草稿工具 |
| `packages/server/src/agent/tools/create-dimension-draft.ts` | 创建维度草稿工具 |
| `packages/web/src/agents/registry.ts` | 前端Agent注册表（展示信息镜像） |
| `packages/web/src/agents/types.ts` | 前端Agent类型定义 |
| `packages/web/src/components/Chat/ChannelTabs.tsx` | 频道Tab栏组件 |
| `packages/web/src/components/Chat/AgentWelcome.tsx` | Agent欢迎页组件 |
| `packages/web/src/components/Chat/cards/MetricCard.tsx` | 指标卡片消息组件 |
| `packages/web/src/components/Chat/cards/DimensionCard.tsx` | 维度卡片消息组件 |
| `packages/web/src/components/Chat/cards/ValidationResult.tsx` | 验证结果展示组件 |
| `packages/server/src/routes/__tests__/metric-dev.test.ts` | 指标开发相关单元测试 |

### 修改文件

| 文件 | 改动 | 影响范围 |
|------|------|---------|
| `packages/server/src/store.ts` | 新增4个字段迁移 + 3个新函数 | 数据模型 |
| `packages/server/src/ws/chat-handler.ts` | 增加3行agentType路由 | WebSocket初始化 |
| `packages/server/src/index.ts` | 增加1行initAgentFramework调用 | 启动流程 |
| `packages/server/src/routes/semantic.ts` | 新增1个API路由 | 验证+测试接口 |
| `packages/web/src/stores/app.ts` | 新增2个状态字段 | Zustand store |
| `packages/web/src/components/Chat/ChatWindow.tsx` | 顶部增加ChannelTabs | Chat页面 |
| `packages/web/src/components/Metrics/MetricsPage.tsx` | 增加🤖 AI开发按钮 | 指标管理页 |
| `packages/web/src/hooks/useWebSocket.ts` | init消息增加可选agentType | WebSocket |

### 不改动文件（兼容性保障）

- `packages/server/src/agent/harness-factory.ts` — 保持不变，query Agent继续使用
- `packages/server/src/agent/prompt-builder.ts` — 保持不变
- `packages/web/src/hooks/useAgentStream.ts` — 保持不变

---

## Task 1: 后端 — Agent注册表核心

**Files:**
- Create: `packages/server/src/agent/agent-registry.ts`
- Test: `packages/server/src/routes/__tests__/metric-dev.test.ts`

- [ ] **Step 1: 创建 agent-registry.ts — AgentDefinition类型和AgentRegistry类**

```typescript
// packages/server/src/agent/agent-registry.ts
import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface AgentContext {
  datasourceId: string;
  datasourceName: string;
  existingMetricsCount?: number;
  existingDimensionsCount?: number;
}

export interface EntryPoint {
  view: string;
  label: string;
  initialPrompt?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  version: string;
  capabilities: string[];
  toolSet: string[];
  systemPromptBuilder: (context: AgentContext) => string;
  harnessFactory: (dsId: string, tools: AgentTool[]) => any;
  entryPoints: EntryPoint[];
  welcomeMessage: string;
}

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private toolPool = new Map<string, AgentTool>();

  registerTool(tool: AgentTool): void {
    this.toolPool.set(tool.name, tool);
  }

  registerAgent(def: AgentDefinition): void {
    this.agents.set(def.id, def);
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAgentTools(agentId: string): AgentTool[] {
    const def = this.agents.get(agentId);
    if (!def) return [];
    return def.toolSet
      .map(toolId => this.toolPool.get(toolId))
      .filter(Boolean) as AgentTool[];
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  createHarness(agentId: string, dsId: string): any {
    const def = this.agents.get(agentId);
    if (!def) throw new Error(`Agent not found: ${agentId}`);
    const tools = this.getAgentTools(agentId);
    return def.harnessFactory(dsId, tools);
  }
}

export const agentRegistry = new AgentRegistry();
```

- [ ] **Step 2: 创建工具注册文件 tool-registration.ts**

```typescript
// packages/server/src/agent/tool-registration.ts
import { agentRegistry } from "./agent-registry.js";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { createAiAnnotateSchemaTool } from "./tools/ai-annotate-schema.js";
import { createLookupSemanticLayerTool } from "./tools/lookup-semantic-layer.js";
import { createLookupExamplesTool } from "./tools/lookup-examples.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { createValidateAndTestMetricTool } from "./tools/validate-and-test-metric.js";
import { createCheckMetricConflictTool } from "./tools/check-metric-conflict.js";
import { createCreateMetricDraftTool } from "./tools/create-metric-draft.js";
import { createCreateDimensionDraftTool } from "./tools/create-dimension-draft.js";
import { loadAllSkills } from "./skill-manager.js";

export function registerAllTools(registry: AgentRegistry): void {
  // 共享工具
  registry.registerTool(createDiscoverSchemaTool());
  registry.registerTool(createExecuteSqlTool());
  registry.registerTool(createAiAnnotateSchemaTool());
  registry.registerTool(createLookupSemanticLayerTool());
  registry.registerTool(createLookupExamplesTool());
  const getSkills = () => loadAllSkills();
  registry.registerTool(createReadSkillTool(getSkills));

  // 指标开发专用工具
  registry.registerTool(createValidateAndTestMetricTool());
  registry.registerTool(createCheckMetricConflictTool());
  registry.registerTool(createCreateMetricDraftTool());
  registry.registerTool(createCreateDimensionDraftTool());
}
```

注意：此文件引用的工具文件将在Task 3-6中创建。创建此文件时先写好import，后续Task创建工具文件后即可编译通过。

- [ ] **Step 3: 创建Agent注册文件 agent-registration.ts + initAgentFramework**

```typescript
// packages/server/src/agent/agent-registration.ts
import { agentRegistry, type AgentDefinition } from "./agent-registry.js";
import { registerAllTools } from "./tool-registration.js";
import { createHarness as createQueryHarness } from "./harness-factory.js";
import { buildDataNovaSystemPrompt } from "./prompt-builder.js";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import { createMetricDevHarness } from "./metric-dev-harness.js";

function registerAllAgents(): void {
  // 智能问数Agent — 复用现有createHarness，零改动
  agentRegistry.registerAgent({
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "用自然语言查询数据",
    color: "var(--primary)",
    version: "1.0.0",
    capabilities: ["查询数据", "生成图表", "探索Schema"],
    toolSet: [
      "discover_schema", "execute_sql", "lookup_semantic_layer",
      "lookup_examples", "read_skill", "ai_annotate_schema",
    ],
    systemPromptBuilder: (ctx) => buildDataNovaSystemPrompt({
      datasourceId: ctx.datasourceId,
      datasourceName: ctx.datasourceName,
      skills: [],
    }),
    harnessFactory: (dsId, _tools) => createQueryHarness({
      conversationId: `query:${dsId}:${Date.now()}`,
      datasourceId: dsId,
    }),
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  });

  // 指标开发Agent
  agentRegistry.registerAgent({
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    version: "1.0.0",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    toolSet: [
      "discover_schema", "execute_sql", "lookup_semantic_layer",
      "lookup_examples", "read_skill",
      "validate_and_test_metric", "check_metric_conflict",
      "create_metric_draft", "create_dimension_draft",
    ],
    systemPromptBuilder: (ctx) => buildMetricDevSystemPrompt(ctx),
    harnessFactory: (dsId, tools) => createMetricDevHarness(dsId, tools),
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  });
}

export function initAgentFramework(): void {
  registerAllTools(agentRegistry);
  registerAllAgents();
}
```

- [ ] **Step 4: 在 index.ts 中调用 initAgentFramework**

在 `packages/server/src/index.ts` 的Hono app创建前增加：

```typescript
import { initAgentFramework } from "./agent/agent-registration.js";

// 在 app 创建前初始化Agent框架
initAgentFramework();
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/agent-registry.ts packages/server/src/agent/tool-registration.ts packages/server/src/agent/agent-registration.ts packages/server/src/index.ts
git commit -m "feat: add Agent registry framework with decoupled agent/tool management"
```

---

## Task 2: 后端 — chat-handler.ts 最小改动 + 数据模型迁移

**Files:**
- Modify: `packages/server/src/ws/chat-handler.ts:77-95`
- Modify: `packages/server/src/store.ts` (initTables migration + new functions)

- [ ] **Step 1: 修改 chat-handler.ts — 增加agentType路由（3行改动）**

在 `handleInit` 函数中，找到 `const harness = await createHarness(options);` 这一行，替换为：

```typescript
  // Agent路由：query走原有createHarness，其他Agent走注册表
  const agentType = (payload.agentType as string) || "query";
  let harness: AgentHarness;

  if (agentType === "query") {
    // 现有流程，零改动
    harness = await createHarness(options);
  } else {
    // 新Agent走注册表
    harness = agentRegistry.createHarness(agentType, options.datasourceId!);
    // 订阅事件（与原流程相同）
    const streamingState: StreamingAssistantState = { content: "", steps: [] };
    streamingStates.set(options.conversationId, streamingState);
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      accumulateStreamingState(streamingState, event);
      forwardEvent(ws, event);
    });
    // 注册到harnessMap以便后续消息路由
    harnessMap.set(options.conversationId, harness);
    // 追踪datasource
    if (options.datasourceId) {
      conversationDatasourceMap.set(options.conversationId, options.datasourceId);
    }
    // 发送历史（新Agent通常无历史）
    const history = listMessages(options.conversationId);
    if (history.length > 0) {
      sendEvent(ws, {
        type: "message_history",
        messages: history.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          steps: m.steps ? JSON.parse(m.steps) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        })),
      });
    }
    sendEvent(ws, { type: "init_success", conversationId: options.conversationId });
    return;
  }
```

同时在文件顶部增加import：
```typescript
import { agentRegistry } from "../agent/agent-registration.js";
import { harnessMap } from "../agent/harness-factory.js";
```

注意：`harnessMap` 目前未从 harness-factory.ts 导出，需要增加导出。

- [ ] **Step 2: 在 harness-factory.ts 中导出 harnessMap**

在 `packages/server/src/agent/harness-factory.ts` 中，将 `const harnessMap` 改为 `export const harnessMap`。

- [ ] **Step 3: 修改 store.ts — 新增字段迁移**

在 `initTables()` 函数中，找到 semantic_metrics 表创建之后，增加字段迁移：

```typescript
  // Metric dev agent fields migration
  const metricCols = database.prepare("PRAGMA table_info(semantic_metrics)").all() as Array<{ name: string }>;
  const metricColNames = new Set(metricCols.map(c => c.name));
  if (!metricColNames.has("created_by")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual' CHECK(created_by IN ('manual', 'agent', 'ai_suggest'))`);
  }
  if (!metricColNames.has("agent_session_id")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN agent_session_id TEXT`);
  }
  if (!metricColNames.has("validation_status")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'unvalidated' CHECK(validation_status IN ('unvalidated', 'passed', 'failed'))`);
  }
  if (!metricColNames.has("validation_result")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN validation_result TEXT`);
  }

  const dimCols = database.prepare("PRAGMA table_info(semantic_dimensions)").all() as Array<{ name: string }>;
  const dimColNames = new Set(dimCols.map(c => c.name));
  if (!dimColNames.has("created_by")) {
    database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual' CHECK(created_by IN ('manual', 'agent', 'ai_suggest'))`);
  }
  if (!dimColNames.has("agent_session_id")) {
    database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN agent_session_id TEXT`);
  }
```

- [ ] **Step 4: 修改 store.ts — 新增冲突检查函数**

在 store.ts 中 SemanticMetric 相关函数区域之后，增加：

```typescript
export function checkMetricNameConflict(datasourceId: string, name: string): SemanticMetric | null {
  const row = database.prepare(
    "SELECT * FROM semantic_metrics WHERE datasource_id = ? AND name = ?"
  ).get(datasourceId, name) as SemanticMetric | undefined;
  return row ?? null;
}

export function checkMetricDisplayNameConflict(datasourceId: string, displayName: string): SemanticMetric[] {
  return (database.prepare(
    "SELECT * FROM semantic_metrics WHERE datasource_id = ? AND display_name = ?"
  ).all(datasourceId, displayName) as SemanticMetric[]);
}
```

- [ ] **Step 5: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run --workspace=packages/server build 2>&1 | tail -20`

注意：此时编译会因为工具文件（Task 3-6）不存在而失败，这是预期的。验证语法正确即可。

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws/chat-handler.ts packages/server/src/agent/harness-factory.ts packages/server/src/store.ts
git commit -m "feat: add agentType routing in chat-handler + metric schema migration"
```

---

## Task 3: 后端 — validate_and_test_metric 工具

**Files:**
- Create: `packages/server/src/agent/tools/validate-and-test-metric.ts`
- Modify: `packages/server/src/routes/semantic.ts` (增加验证API路由)

- [ ] **Step 1: 创建 validate-and-test-metric.ts 工具**

```typescript
// packages/server/src/agent/tools/validate-and-test-metric.ts
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { validateSqlViaExplain, executeSql } from "../../mysql/executor.js";

const ValidateAndTestMetricParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  sql: Type.String({ description: "待验证的SQL语句" }),
  metric_type: Type.String({ description: "指标类型: atomic | derived | compound" }),
});

type ValidateAndTestMetricParams = Static<typeof ValidateAndTestMetricParams>;

interface ValidationError {
  step: string;
  message: string;
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  test_result?: {
    row_count: number;
    sample_rows: any[];
    column_types: Record<string, string>;
    null_ratios: Record<string, number>;
    warnings: string[];
  };
}

export function createValidateAndTestMetricTool(): AgentTool<typeof ValidateAndTestMetricParams, ValidationResult> {
  return {
    name: "validate_and_test_metric",
    description: `验证指标SQL的正确性。执行以下检查：
1. 语法验证 — EXPLAIN检查SQL语法
2. 执行测试 — 执行SQL + LIMIT 10获取样本数据
3. 结果分析 — 行数、空值比例、数值范围等合理性检查

返回验证报告，包含错误详情和修复建议。`,
    label: "验证测试指标SQL",
    parameters: ValidateAndTestMetricParams,
    execute: async (_toolCallId: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }>; details: ValidationResult }> => {
      const typedParams = params as ValidateAndTestMetricParams;
      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Step 1: 语法验证
      const explainResult = await validateSqlViaExplain(typedParams.datasource_id, typedParams.sql);
      if (!explainResult.valid) {
        errors.push({
          step: "语法验证",
          message: `SQL语法错误: ${explainResult.error}`,
          suggestion: "请检查SQL语法，确保表名、字段名、函数名正确",
        });
        const result: ValidationResult = { valid: false, errors };
        return {
          content: [{ type: "text", text: `SQL验证失败:\n${JSON.stringify(result, null, 2)}` }],
          details: result,
        };
      }

      // Step 2: 执行测试
      let testRows: any[] = [];
      let columnTypes: Record<string, string> = {};
      let nullRatios: Record<string, number> = {};
      let rowCount = 0;

      try {
        const testSql = typedParams.sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
        const execResult = await executeSql(typedParams.datasource_id, testSql, { timeout: 10000, rowLimit: 10 });
        testRows = execResult.rows || [];
        rowCount = testRows.length;

        if (testRows.length > 0) {
          columnTypes = Object.fromEntries(
            Object.keys(testRows[0]).map(k => [k, typeof testRows[0][k]])
          );
          // 计算空值比例
          for (const col of Object.keys(testRows[0])) {
            const nullCount = testRows.filter(r => r[col] === null || r[col] === undefined || r[col] === '').length;
            nullRatios[col] = Math.round((nullCount / testRows.length) * 100) / 100;
          }
        }
      } catch (err) {
        errors.push({
          step: "执行测试",
          message: `SQL执行错误: ${(err as Error).message}`,
          suggestion: "请检查SQL逻辑，可能是字段名错误或JOIN条件有误",
        });
        const result: ValidationResult = { valid: false, errors };
        return {
          content: [{ type: "text", text: `SQL执行失败:\n${JSON.stringify(result, null, 2)}` }],
          details: result,
        };
      }

      // Step 3: 结果合理性检查
      if (rowCount === 0) {
        warnings.push("查询返回0行数据，可能WHERE条件过于严格或SQL逻辑有误");
      }

      for (const [col, ratio] of Object.entries(nullRatios)) {
        if (ratio > 0.5) {
          warnings.push(`列 "${col}" 空值比例 ${Math.round(ratio * 100)}%，可能JOIN条件遗漏或数据质量问题`);
        }
      }

      // 数值范围检查
      for (const col of Object.keys(columnTypes)) {
        if (columnTypes[col] === "number") {
          const values = testRows.map(r => r[col]).filter(v => v !== null && v !== undefined) as number[];
          if (values.length > 0) {
            const hasNegative = values.some(v => v < 0);
            const maxVal = Math.max(...values);
            if (hasNegative && !typedParams.sql.toLowerCase().includes("difference") && !typedParams.sql.toLowerCase().includes("change")) {
              warnings.push(`列 "${col}" 包含负数值(${Math.min(...values)})，请确认业务逻辑是否允许`);
            }
            if (maxVal > 1e12) {
              warnings.push(`列 "${col}" 包含极大值(${maxVal})，请确认聚合逻辑是否正确`);
            }
          }
        }
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        test_result: {
          row_count: rowCount,
          sample_rows: testRows.slice(0, 3),
          column_types: columnTypes,
          null_ratios: nullRatios,
          warnings,
        },
      };

      const summary = errors.length === 0
        ? `✅ 验证通过！返回${rowCount}行数据${warnings.length > 0 ? `，${warnings.length}个警告` : ""}`
        : `❌ 验证失败，${errors.length}个错误`;

      return {
        content: [{ type: "text", text: `${summary}\n${JSON.stringify(result, null, 2)}` }],
        details: result,
      };
    },
  };
}
```

- [ ] **Step 2: 在 semantic.ts 中增加验证+测试API路由**

在 `packages/server/src/routes/semantic.ts` 的 `createSemanticRoutes()` 函数中，metrics CRUD路由之后增加：

```typescript
  // === Validate and Test Metric SQL ===
  app.post("/api/datasources/:dsId/metrics/validate-and-test", async (c) => {
    const dsId = c.req.param("dsId");
    try {
      const body = await c.req.json();
      const sql: string = body.sql;
      const metricType: string = body.metric_type || "atomic";

      if (!sql) {
        return c.json({ error: "SQL is required" }, 400);
      }

      // Step 1: EXPLAIN validation
      const explainResult = await validateSqlViaExplain(dsId, sql);
      if (!explainResult.valid) {
        return c.json({
          valid: false,
          errors: [{ step: "语法验证", message: explainResult.error }],
        });
      }

      // Step 2: Execute with LIMIT
      let testRows: any[] = [];
      let rowCount = 0;
      try {
        const testSql = sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
        const result = await executeSql(dsId, testSql, { timeout: 10000, rowLimit: 10 });
        testRows = result.rows || [];
        rowCount = testRows.length;
      } catch (err) {
        return c.json({
          valid: false,
          errors: [{ step: "执行测试", message: (err as Error).message }],
        });
      }

      return c.json({
        valid: true,
        test_result: {
          row_count: rowCount,
          sample_rows: testRows.slice(0, 3),
        },
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/agent/tools/validate-and-test-metric.ts packages/server/src/routes/semantic.ts
git commit -m "feat: add validate_and_test_metric tool + API route"
```

---

## Task 4: 后端 — check_metric_conflict 工具

**Files:**
- Create: `packages/server/src/agent/tools/check-metric-conflict.ts`

- [ ] **Step 1: 创建 check-metric-conflict.ts 工具**

```typescript
// packages/server/src/agent/tools/check-metric-conflict.ts
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { checkMetricNameConflict, checkMetricDisplayNameConflict, listMetrics } from "../../store.js";

const CheckMetricConflictParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "拟使用的指标英文名" }),
  sql: Type.Optional(Type.String({ description: "拟使用的SQL语句" })),
  display_name: Type.Optional(Type.String({ description: "拟使用的指标中文名" })),
});

type CheckMetricConflictParams = Static<typeof CheckMetricConflictParams>;

interface ConflictInfo {
  has_conflict: boolean;
  conflicts: Array<{
    type: "name_duplicate" | "display_name_duplicate";
    severity: "error" | "warning";
    existing_metric: { id: string; name: string; display_name: string; status: string };
    suggestion: string;
  }>;
}

export function createCheckMetricConflictTool(): AgentTool<typeof CheckMetricConflictParams, ConflictInfo> {
  return {
    name: "check_metric_conflict",
    description: `检查拟创建的指标与已有指标的冲突。检测：
1. 同名指标（name重复）— 严重冲突
2. 同显示名（display_name重复）— 可能混淆
返回冲突列表和建议。`,
    label: "检查指标冲突",
    parameters: CheckMetricConflictParams,
    execute: async (_toolCallId: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }>; details: ConflictInfo }> => {
      const typedParams = params as CheckMetricConflictParams;
      const conflicts: ConflictInfo["conflicts"] = [];

      // 检查name重复
      const nameConflict = checkMetricNameConflict(typedParams.datasource_id, typedParams.name);
      if (nameConflict) {
        conflicts.push({
          type: "name_duplicate",
          severity: "error",
          existing_metric: {
            id: nameConflict.id,
            name: nameConflict.name,
            display_name: nameConflict.display_name,
            status: nameConflict.status,
          },
          suggestion: nameConflict.status === "deprecated"
            ? `已有弃用指标 "${nameConflict.display_name}"(${nameConflict.name})，建议覆盖或使用新名称`
            : `已有指标 "${nameConflict.display_name}"(${nameConflict.name})，请使用不同的英文名`,
        });
      }

      // 检查display_name重复
      if (typedParams.display_name) {
        const displayNameConflicts = checkMetricDisplayNameConflict(typedParams.datasource_id, typedParams.display_name);
        for (const existing of displayNameConflicts) {
          if (existing.name !== typedParams.name) {  // 避免与name重复的报告重复
            conflicts.push({
              type: "display_name_duplicate",
              severity: "warning",
              existing_metric: {
                id: existing.id,
                name: existing.name,
                display_name: existing.display_name,
                status: existing.status,
              },
              suggestion: `已有指标使用显示名 "${existing.display_name}"(${existing.name})，可能造成混淆`,
            });
          }
        }
      }

      const result: ConflictInfo = {
        has_conflict: conflicts.length > 0,
        conflicts,
      };

      const summary = conflicts.length === 0
        ? "✅ 无冲突，可以使用该名称"
        : `⚠️ 发现${conflicts.length}个冲突`;

      return {
        content: [{ type: "text", text: `${summary}\n${JSON.stringify(result, null, 2)}` }],
        details: result,
      };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/agent/tools/check-metric-conflict.ts
git commit -m "feat: add check_metric_conflict tool"
```

---

## Task 5: 后端 — create_metric_draft + create_dimension_draft 工具

**Files:**
- Create: `packages/server/src/agent/tools/create-metric-draft.ts`
- Create: `packages/server/src/agent/tools/create-dimension-draft.ts`

- [ ] **Step 1: 创建 create-metric-draft.ts 工具**

```typescript
// packages/server/src/agent/tools/create-metric-draft.ts
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createMetric, checkMetricNameConflict } from "../../store.js";
import { validateSqlViaExplain, executeSql } from "../../mysql/executor.js";

const CreateMetricDraftParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "指标英文名(snake_case)" }),
  display_name: Type.String({ description: "指标中文名" }),
  sql: Type.String({ description: "完整的可执行SQL语句" }),
  metric_type: Type.Union([Type.Literal("atomic"), Type.Literal("derived"), Type.Literal("compound")]),
  description: Type.Optional(Type.String({ description: "指标描述(中文)" })),
  business_context: Type.Optional(Type.String({ description: "业务上下文" })),
  calculation_logic: Type.Optional(Type.String({ description: "计算逻辑" })),
  applicable_scenarios: Type.Optional(Type.String({ description: "适用场景" })),
  data_quality_notes: Type.Optional(Type.String({ description: "数据质量备注" })),
  dimensions: Type.Optional(Type.Array(Type.String(), { description: "关联维度名列表" })),
  unit: Type.Optional(Type.String({ description: "单位: yuan, %, ge, ..." })),
  category: Type.Optional(Type.String({ description: "分类" })),
  default_sort: Type.Optional(Type.String({ description: "默认排序" })),
  agent_session_id: Type.Optional(Type.String({ description: "Agent会话ID" })),
});

type CreateMetricDraftParams = Static<typeof CreateMetricDraftParams>;

export function createCreateMetricDraftTool(): AgentTool<typeof CreateMetricDraftParams, any> {
  return {
    name: "create_metric_draft",
    description: `创建指标草稿。自动执行验证后保存为draft状态。
注意：如果同名指标已存在，将返回冲突错误，不会覆盖已有指标。`,
    label: "创建指标草稿",
    parameters: CreateMetricDraftParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as CreateMetricDraftParams;

      // 1. 检查名称冲突
      const conflict = checkMetricNameConflict(p.datasource_id, p.name);
      if (conflict) {
        return {
          content: [{ type: "text" as const, text: `❌ 指标名 "${p.name}" 已存在（${conflict.display_name}, 状态: ${conflict.status}）。请使用不同的名称。` }],
          details: { created: false, conflict: true, existing_id: conflict.id },
          isError: true,
        };
      }

      // 2. EXPLAIN验证
      const explainResult = await validateSqlViaExplain(p.datasource_id, p.sql);
      if (!explainResult.valid) {
        return {
          content: [{ type: "text" as const, text: `❌ SQL验证失败: ${explainResult.error}\n请先修复SQL后再创建。` }],
          details: { created: false, validation_error: explainResult.error },
          isError: true,
        };
      }

      // 3. 创建草稿
      try {
        const metric = createMetric({
          datasource_id: p.datasource_id,
          name: p.name,
          display_name: p.display_name,
          description: p.description || "",
          sql: p.sql,
          dimensions: JSON.stringify(p.dimensions || []),
          default_granularity: null,
          unit: p.unit || null,
          category: p.category || null,
          aliases: "[]",
          metric_type: p.metric_type,
          business_context: p.business_context || "",
          calculation_logic: p.calculation_logic || "",
          applicable_scenarios: p.applicable_scenarios || "",
          data_quality_notes: p.data_quality_notes || "",
          default_sort: p.default_sort || null,
          status: "draft",
          version: 1,
          created_by: "agent",
          agent_session_id: p.agent_session_id || null,
          validation_status: "passed",
          validation_result: JSON.stringify({ validated_at: new Date().toISOString() }),
        });

        return {
          content: [{ type: "text" as const, text: `✅ 指标草稿已创建: ${metric.display_name} (${metric.name})\n类型: ${metric.metric_type} | 状态: 草稿 | 验证: 通过\nSQL: ${metric.sql.substring(0, 100)}${metric.sql.length > 100 ? "..." : ""}\n\n请前往指标管理页面审核并发布。` }],
          details: { created: true, metric_id: metric.id, metric_name: metric.name },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ 创建指标失败: ${(err as Error).message}` }],
          details: { created: false, error: (err as Error).message },
          isError: true,
        };
      }
    },
  };
}
```

- [ ] **Step 2: 创建 create-dimension-draft.ts 工具**

```typescript
// packages/server/src/agent/tools/create-dimension-draft.ts
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createDimension } from "../../store.js";

const CreateDimensionDraftParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "维度英文名(snake_case)" }),
  display_name: Type.String({ description: "维度中文名" }),
  sql_expression: Type.String({ description: "SQL表达式(字段名或表达式)" }),
  data_type: Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("date")]),
  description: Type.Optional(Type.String({ description: "维度描述(中文)" })),
  grain: Type.Optional(Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("quarter"), Type.Literal("year")])),
  date_column: Type.Optional(Type.String({ description: "源日期列" })),
  agent_session_id: Type.Optional(Type.String({ description: "Agent会话ID" })),
});

type CreateDimensionDraftParams = Static<typeof CreateDimensionDraftParams>;

export function createCreateDimensionDraftTool(): AgentTool<typeof CreateDimensionDraftParams, any> {
  return {
    name: "create_dimension_draft",
    description: `创建维度草稿。保存为draft状态，需用户审核后发布。`,
    label: "创建维度草稿",
    parameters: CreateDimensionDraftParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as CreateDimensionDraftParams;

      try {
        const dim = createDimension({
          datasource_id: p.datasource_id,
          name: p.name,
          display_name: p.display_name,
          sql_expression: p.sql_expression,
          data_type: p.data_type,
          hierarchy: null,
          values: null,
          description: p.description || "",
          grain: p.grain || null,
          date_column: p.date_column || null,
          status: "draft",
          is_enum_dict: false,
          created_by: "agent",
          agent_session_id: p.agent_session_id || null,
        });

        return {
          content: [{ type: "text" as const, text: `✅ 维度草稿已创建: ${dim.display_name} (${dim.name})\n类型: ${dim.data_type}${dim.grain ? ` | 粒度: ${dim.grain}` : ""}\n表达式: ${dim.sql_expression}` }],
          details: { created: true, dimension_id: dim.id, dimension_name: dim.name },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ 创建维度失败: ${(err as Error).message}` }],
          details: { created: false, error: (err as Error).message },
          isError: true,
        };
      }
    },
  };
}
```

- [ ] **Step 3: 更新 store.ts 中 createMetric 和 createDimension 函数签名**

确保 `createMetric` 和 `createDimension` 函数接受新增的 `created_by`、`agent_session_id`、`validation_status`、`validation_result` 字段。在对应的 INSERT 语句中增加这些字段。

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/agent/tools/create-metric-draft.ts packages/server/src/agent/tools/create-dimension-draft.ts packages/server/src/store.ts
git commit -m "feat: add create_metric_draft and create_dimension_draft tools"
```

---

## Task 6: 后端 — 指标开发Agent Harness + 提示词

**Files:**
- Create: `packages/server/src/agent/metric-dev-harness.ts`
- Create: `packages/server/src/agent/prompt-builder-metric-dev.ts`

- [ ] **Step 1: 创建 prompt-builder-metric-dev.ts — 指标开发专用提示词**

```typescript
// packages/server/src/agent/prompt-builder-metric-dev.ts
import type { AgentContext } from "./agent-registry.js";
import { listMetrics, listDimensions, listModels } from "../store.js";

export function buildMetricDevSystemPrompt(context: AgentContext): string {
  // 获取当前数据源的指标/维度/模型数量，注入上下文
  let existingContext = "";
  try {
    const metrics = listMetrics(context.datasourceId);
    const dimensions = listDimensions(context.datasourceId);
    const models = listModels(context.datasourceId);
    const publishedMetrics = metrics.filter(m => m.status === "published");
    const draftMetrics = metrics.filter(m => m.status === "draft");

    existingContext = `
## 当前数据源已有定义
- 已发布指标: ${publishedMetrics.length}个${publishedMetrics.length > 0 ? ` (${publishedMetrics.map(m => m.display_name).join("、")})` : ""}
- 草稿指标: ${draftMetrics.length}个
- 已发布维度: ${dimensions.filter(d => d.status === "published").length}个
- 模型: ${models.length}个
`;
  } catch {
    existingContext = "\n## 当前数据源已有定义\n（无法获取）\n";
  }

  return `你是一个专业的指标开发助手，隶属DataNova智能数据平台。你的任务是帮助用户开发准确、可靠的业务指标和维度定义。

## 核心身份
- 你是指标开发专家，擅长从数据库Schema中发现业务含义，并将其转化为标准化的指标定义
- 你只负责创建指标和维度的草稿，不负责发布——发布需要用户在指标管理页面手动操作
- 当前数据源: ${context.datasourceName || context.datasourceId}

${existingContext}

## 工作原则
1. **先查后建** — 开发指标前，必须先调用 check_metric_conflict 和 lookup_semantic_layer，确认没有重复定义
2. **验证闭环** — 每个生成的SQL必须调用 validate_and_test_metric 进行验证和测试
3. **自动修复** — 验证失败时，分析错误原因并自动修复SQL，最多重试3次
4. **业务语义** — 充分利用 read_skill 和 lookup_examples 理解业务含义
5. **草稿安全** — 所有新创建的指标默认为草稿状态，validation_status 根据验证结果设置

## 工作流程
1. 理解用户需求 → 明确指标的业务含义和计算逻辑
2. 检查冲突 → 调用 check_metric_conflict
3. 探索数据源 → 调用 discover_schema 找到相关表和字段
4. 查看已有定义 → 调用 lookup_semantic_layer 检查已有指标和维度
5. 了解业务知识 → 调用 read_skill 和 lookup_examples
6. 生成SQL → 编写完整的可执行SQL
7. 验证测试 → 调用 validate_and_test_metric
8. 修复迭代 → 如有问题自动修复，最多重试3次
9. 创建草稿 → 调用 create_metric_draft / create_dimension_draft
10. 通知用户 → 展示指标卡片和验证结果

## SQL质量标准
- 必须包含有意义的列别名（AS子句）
- 聚合查询必须包含 GROUP BY
- 时间维度字段建议使用 DATE_FORMAT 格式化
- 衍生指标（比率类）需处理分母为0的情况（NULLIF）
- WHERE条件应过滤无效数据（如已删除记录）
- 避免全表扫描，大表必须有时间范围限制

## 指标元数据标准
- name: snake_case英文标识，简洁有意义
- display_name: 中文显示名，简洁明了
- metric_type: atomic(单聚合) | derived(比率/差值) | compound(窗口/CTE)
- business_context: 一句话说明业务含义
- calculation_logic: 描述计算公式（如 SUM(orders.amount)）
- applicable_scenarios: 何时使用此指标
- data_quality_notes: 数据质量注意事项

## 输出格式
- 生成指标后，用简洁的方式展示结果
- 包含：指标名、显示名、SQL摘要、验证状态、测试数据行数
- 如有关联维度一起创建，也一并展示

## 禁止行为
- 不要直接发布指标，只创建草稿
- 不要修改已发布的指标
- 不要执行非SELECT语句
- 不要猜测字段名，必须通过 discover_schema 确认

## 重要：使用中文回复
所有面向用户的回复必须使用简体中文。`;
}
```

- [ ] **Step 2: 创建 metric-dev-harness.ts — 指标开发Agent的Harness工厂**

```typescript
// packages/server/src/agent/metric-dev-harness.ts
import { AgentHarness, InMemorySessionRepo, type AgentTool, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { getModel, getEnvApiKey } from "@earendil-works/pi-ai";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import type { AgentContext } from "./agent-registry.js";
import { listDatasources } from "../store.js";

const metricDevSessionRepo = new InMemorySessionRepo();

export function createMetricDevHarness(datasourceId: string, tools: AgentTool[]): AgentHarness {
  const ds = listDatasources().find(d => d.id === datasourceId);
  const context: AgentContext = {
    datasourceId,
    datasourceName: ds?.name || datasourceId,
  };

  const systemPrompt = buildMetricDevSystemPrompt(context);

  const provider = process.env.DATANOVA_PROVIDER || "anthropic";
  const modelId = process.env.DATANOVA_MODEL || "claude-sonnet-4-20250514";
  const model = getModel(provider as "anthropic", modelId as any);

  const session = metricDevSessionRepo.createSync({ id: `metric-dev:${datasourceId}:${Date.now()}` });

  return new AgentHarness({
    env: createMinimalEnv(),
    session,
    tools,
    resources: {},
    systemPrompt,
    model,
    getApiKeyAndHeaders: async (model) => {
      const apiKey = getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(`No API key found for provider "${model.provider}".`);
      }
      return { apiKey, headers: {} };
    },
  });
}

function createMinimalEnv(): ExecutionEnv {
  return {
    cwd: process.cwd(),
    absolutePath: async (p: string) => ({ ok: true as const, value: p }),
    joinPath: async (parts: string[]) => ({ ok: true as const, value: parts.join("/") }),
    readTextFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    readTextLines: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    readBinaryFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    writeFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    appendFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    fileInfo: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    listDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    canonicalPath: async (p: string) => ({ ok: true as const, value: p }),
    exists: async () => ({ ok: true as const, value: false }),
    createDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    remove: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    createTempDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    createTempFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    cleanup: async () => {},
    exec: async () => ({
      ok: false as const,
      error: new Error("Shell not available in DataNova") as any,
    }),
  } as ExecutionEnv;
}
```

注意：`InMemorySessionRepo.createSync` 可能不存在，需要确认pi-agent-core的API。如果只有异步的 `create`，则 `metric-dev-harness.ts` 的 harnessFactory 签名需要改为 async，并相应调整 agent-registry.ts 中 `createHarness` 为异步方法。

- [ ] **Step 3: 验证编译**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run --workspace=packages/server build 2>&1 | tail -30`

修复任何编译错误，确保所有import正确。

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/agent/metric-dev-harness.ts packages/server/src/agent/prompt-builder-metric-dev.ts
git commit -m "feat: add metric-dev agent harness and system prompt"
```

---

## Task 7: 前端 — Agent注册表 + 频道Tab

**Files:**
- Create: `packages/web/src/agents/registry.ts`
- Create: `packages/web/src/agents/types.ts`
- Create: `packages/web/src/components/Chat/ChannelTabs.tsx`
- Create: `packages/web/src/components/Chat/AgentWelcome.tsx`
- Modify: `packages/web/src/stores/app.ts`
- Modify: `packages/web/src/components/Chat/ChatWindow.tsx`

- [ ] **Step 1: 创建前端Agent类型和注册表**

```typescript
// packages/web/src/agents/types.ts
export interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  capabilities: string[];
  entryPoints: EntryPoint[];
  welcomeMessage: string;
}

export interface EntryPoint {
  view: string;
  label: string;
  initialPrompt?: string;
}
```

```typescript
// packages/web/src/agents/registry.ts
import type { AgentInfo, EntryPoint } from "./types";

export const AGENT_REGISTRY: AgentInfo[] = [
  {
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "用自然语言查询数据",
    color: "var(--primary)",
    capabilities: ["查询数据", "生成图表", "探索Schema"],
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  },
  {
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  },
];

export function getAgentById(id: string): AgentInfo | undefined {
  return AGENT_REGISTRY.find(a => a.id === id);
}

export function getAgentEntryPoint(view: string): { agentId: string; label: string; initialPrompt?: string } | undefined {
  for (const agent of AGENT_REGISTRY) {
    const entry = agent.entryPoints.find(e => e.view === view);
    if (entry) return { agentId: agent.id, label: entry.label, initialPrompt: entry.initialPrompt };
  }
  return undefined;
}
```

- [ ] **Step 2: 扩展Zustand store**

在 `packages/web/src/stores/app.ts` 中增加：

```typescript
// 新增状态
activeChannel: string;                    // 当前活跃频道ID，默认 "query"
channelSessions: Record<string, string>;  // 频道→会话ID映射

// 新增actions
setActiveChannel: (channel: string) => void;
setChannelSession: (channel: string, sessionId: string) => void;
```

默认值：
```typescript
activeChannel: "query",
channelSessions: {},
```

- [ ] **Step 3: 创建 ChannelTabs 组件**

```tsx
// packages/web/src/components/Chat/ChannelTabs.tsx
import { AGENT_REGISTRY } from "../../agents/registry";

interface ChannelTabsProps {
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

export default function ChannelTabs({ activeChannel, onChannelChange }: ChannelTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-6">
      {AGENT_REGISTRY.map(agent => (
        <button
          key={agent.id}
          onClick={() => onChannelChange(agent.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeChannel === agent.id
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
          }`}
        >
          <span className="mr-1.5">{agent.icon}</span>
          {agent.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 创建 AgentWelcome 组件**

```tsx
// packages/web/src/components/Chat/AgentWelcome.tsx
import type { AgentInfo } from "../../agents/types";

interface AgentWelcomeProps {
  agent: AgentInfo;
  onQuickAction?: (prompt: string) => void;
}

export default function AgentWelcome({ agent, onQuickAction }: AgentWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="text-4xl mb-4">{agent.icon}</div>
      <h3 className="font-display text-heading-3 text-[var(--ink)] mb-2">{agent.name}</h3>
      <p className="text-body-sm text-[var(--slate)] mb-6 text-center max-w-md whitespace-pre-line">
        {agent.welcomeMessage}
      </p>
      {agent.id === "metric_dev" && (
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => onQuickAction?.("帮我开发一个月度营收指标")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            开发月度营收指标
          </button>
          <button
            onClick={() => onQuickAction?.("帮我分析数据源，推荐一批常用指标")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            推荐常用指标
          </button>
          <button
            onClick={() => onQuickAction?.("检查现有指标是否有冲突或重复")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            检查指标冲突
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 修改 ChatWindow.tsx — 集成ChannelTabs + AgentWelcome**

在 `ChatWindow.tsx` 中：
1. 顶部增加 `<ChannelTabs>` 组件
2. 频道切换时发送新的 `init` WebSocket消息，携带 `agentType`
3. 无消息历史时显示 `<AgentWelcome>` 组件
4. init消息payload中增加 `agentType` 字段

关键改动点：
- 从 `useAppStore` 读取 `activeChannel`、`setActiveChannel`
- 在 `handleInit` 函数中，payload增加 `agentType: activeChannel`
- 频道切换时调用 `handleInit` 重新初始化

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/agents/ packages/web/src/stores/app.ts packages/web/src/components/Chat/ChannelTabs.tsx packages/web/src/components/Chat/AgentWelcome.tsx packages/web/src/components/Chat/ChatWindow.tsx
git commit -m "feat: add agent channel tabs and welcome component to ChatWindow"
```

---

## Task 8: 前端 — 指标卡片消息组件 + MetricsPage联动

**Files:**
- Create: `packages/web/src/components/Chat/cards/MetricCard.tsx`
- Create: `packages/web/src/components/Chat/cards/DimensionCard.tsx`
- Create: `packages/web/src/components/Chat/cards/ValidationResult.tsx`
- Modify: `packages/web/src/components/Metrics/MetricsPage.tsx`

- [ ] **Step 1: 创建 MetricCard 组件**

```tsx
// packages/web/src/components/Chat/cards/MetricCard.tsx
interface MetricCardProps {
  name: string;
  display_name: string;
  sql: string;
  metric_type: string;
  status: string;
  validation_status?: string;
  business_context?: string;
  test_row_count?: number;
  onViewDetails?: () => void;
}

export default function MetricCard({
  name, display_name, sql, metric_type, status, validation_status, business_context, test_row_count, onViewDetails,
}: MetricCardProps) {
  const typeLabel = metric_type === "atomic" ? "原子" : metric_type === "derived" ? "衍生" : "复合";
  const typeCls = metric_type === "atomic" ? "bg-blue-100 text-blue-700" : metric_type === "derived" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700";

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 my-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--ink)]">{display_name}</span>
          <span className="text-xs font-mono text-[var(--steel)]">({name})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeCls}`}>{typeLabel}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning-soft)] text-[var(--warning)]">草稿</span>
          {validation_status === "passed" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-soft)] text-[var(--success)]">✓ 验证通过</span>
          )}
        </div>
      </div>
      <pre className="text-xs font-mono text-[var(--charcoal)] bg-[var(--canvas)] rounded px-3 py-2 overflow-x-auto mb-2">
        {sql.length > 120 ? sql.substring(0, 120) + "..." : sql}
      </pre>
      {business_context && (
        <p className="text-xs text-[var(--steel)] mb-2">{business_context}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--steel)]">
        {test_row_count !== undefined && <span>测试: {test_row_count}行数据</span>}
      </div>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="mt-2 text-xs text-[var(--primary)] hover:underline"
        >
          在指标管理中查看
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 DimensionCard 组件**

```tsx
// packages/web/src/components/Chat/cards/DimensionCard.tsx
interface DimensionCardProps {
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: string;
  grain?: string | null;
}

export default function DimensionCard({ name, display_name, sql_expression, data_type, grain }: DimensionCardProps) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3 my-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-[var(--ink)]">{display_name}</span>
        <span className="text-xs font-mono text-[var(--steel)]">({name})</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]">{data_type}</span>
        {grain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">粒度:{grain}</span>}
      </div>
      <p className="text-xs font-mono text-[var(--charcoal)]">{sql_expression}</p>
    </div>
  );
}
```

- [ ] **Step 3: 创建 ValidationResult 组件**

```tsx
// packages/web/src/components/Chat/cards/ValidationResult.tsx
interface ValidationResultProps {
  valid: boolean;
  errors?: Array<{ step: string; message: string; suggestion?: string }>;
  warnings?: string[];
  test_row_count?: number;
}

export default function ValidationResult({ valid, errors, warnings, test_row_count }: ValidationResultProps) {
  return (
    <div className={`rounded-lg p-3 my-1.5 text-xs ${
      valid ? "bg-[var(--success-soft)] border border-[var(--success)]/20" : "bg-[var(--error-soft)] border border-[var(--error)]/20"
    }`}>
      <div className="flex items-center gap-2 font-medium mb-1">
        <span>{valid ? "✅ 验证通过" : "❌ 验证失败"}</span>
        {test_row_count !== undefined && <span className="text-[var(--steel)]">({test_row_count}行)</span>}
      </div>
      {errors && errors.length > 0 && (
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-medium">[{e.step}]</span> {e.message}
              {e.suggestion && <span className="text-[var(--steel)]"> — {e.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mt-1 text-[var(--warning)]">
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 修改 MetricsPage — 增加🤖 AI开发按钮**

在 `packages/web/src/components/Metrics/MetricsPage.tsx` 的header按钮区域，增加：

```tsx
import { useAppStore } from "../../stores/app";
import { getAgentEntryPoint } from "../../agents/registry";

// 在组件内部
const { setView, setActiveChannel, selectedDatasourceId } = useAppStore();

const metricDevEntry = getAgentEntryPoint("metrics");

// 在按钮区域增加
{metricDevEntry && (
  <button
    onClick={() => {
      setActiveChannel("metric_dev");
      setView("chat");
    }}
    className="btn-primary inline-flex items-center gap-1.5"
  >
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
    {metricDevEntry.label}
  </button>
)}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Chat/cards/ packages/web/src/components/Metrics/MetricsPage.tsx
git commit -m "feat: add metric/dimension card components and MetricsPage AI dev button"
```

---

## Task 9: 集成测试 + 回归验证

**Files:**
- Create: `packages/server/src/routes/__tests__/metric-dev.test.ts`
- Modify: E2E tests as needed

- [ ] **Step 1: 编写单元测试 — validate_and_test_metric**

创建 `packages/server/src/routes/__tests__/metric-dev.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentRegistry } from "../../agent/agent-registry.js";
import { initAgentFramework } from "../../agent/agent-registration.js";

describe("Agent Registry", () => {
  beforeAll(() => {
    initAgentFramework();
  });

  it("should have query and metric_dev agents registered", () => {
    const agents = agentRegistry.listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.find(a => a.id === "query")).toBeDefined();
    expect(agents.find(a => a.id === "metric_dev")).toBeDefined();
  });

  it("metric_dev agent should have 9 tools", () => {
    const tools = agentRegistry.getAgentTools("metric_dev");
    expect(tools.length).toBe(9);
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain("discover_schema");
    expect(toolNames).toContain("execute_sql");
    expect(toolNames).toContain("validate_and_test_metric");
    expect(toolNames).toContain("check_metric_conflict");
    expect(toolNames).toContain("create_metric_draft");
    expect(toolNames).toContain("create_dimension_draft");
  });

  it("query agent should have 6 tools", () => {
    const tools = agentRegistry.getAgentTools("query");
    expect(tools.length).toBe(6);
  });

  it("should throw for unknown agent", () => {
    expect(() => agentRegistry.createHarness("unknown", "ds-123")).toThrow("Agent not found");
  });
});
```

- [ ] **Step 2: 运行单元测试**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run --workspace=packages/server test -- packages/server/src/routes/__tests__/metric-dev.test.ts`

Expected: All tests pass

- [ ] **Step 3: 回归测试 — 验证智能问数流程不受影响**

手动测试步骤：
1. 启动 `npm run dev:server` 和 `npm run dev:web`
2. 打开浏览器访问 Chat 页面
3. 默认频道为"智能问数"
4. 发送消息"查询订单数量"，验证正常响应
5. 频道Tab应显示"💬 智能问数"和"📊 指标开发"
6. 切换到"指标开发"频道，验证欢迎页面显示
7. 切回"智能问数"，验证对话历史保留

- [ ] **Step 4: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run build 2>&1 | tail -30`

Expected: Build succeeds with no errors

- [ ] **Step 5: Final Commit**

```bash
git add packages/server/src/routes/__tests__/metric-dev.test.ts
git commit -m "feat: add agent registry unit tests"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: Task 1-6 covers Agent框架、4个专用工具、提示词、Harness工厂。Task 7-8 covers前端频道Tab、卡片组件、MetricsPage联动。Task 9 covers测试验证。
- [x] **Placeholder scan**: No TBD/TODO/fill-in-later found. All code blocks contain actual implementation.
- [x] **Type consistency**: AgentDefinition type defined in Task 1 matches usage in Task 6 (metric-dev-harness). Store function signatures (createMetric, createDimension) are updated in Task 5 to accept new fields.
- [x] **Compatibility**: Task 2 explicitly preserves existing query flow via `if (agentType === "query")` branch. harness-factory.ts is not modified (only exports harnessMap).
