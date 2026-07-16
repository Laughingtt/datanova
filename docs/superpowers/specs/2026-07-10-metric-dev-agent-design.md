# DataNova Agent框架 + 指标开发Agent — 需求设计规格说明

> 日期：2026-07-10 | 版本：1.2 | 状态：待用户评审

## 一、概述

### 1.1 背景

DataNova的智能问数准确率高度依赖指标和业务场景的建立。当前指标管理依赖用户手动创建或AI一次性批量推荐，存在以下痛点：

1. **AI推荐不可迭代** — 单次生成，无法根据验证结果自动修复
2. **缺少验证闭环** — 仅EXPLAIN语法验证，不验证执行结果合理性
3. **不感知已有指标** — AI推荐可能产生重复或冲突定义
4. **无法利用业务知识** — 推荐时未参考Query Skills、业务注释等

### 1.2 目标

构建一个**对话式指标开发Agent**，让用户通过自然语言描述需求，Agent自主探索数据源、生成SQL、自动验证修复、创建指标草稿，最终交付可靠准确的指标定义。

### 1.3 核心设计决策

| 决策维度 | 选择 | 理由 |
|---------|------|------|
| 交互模式 | 对话式Agent | 用户用自然语言描述需求，Agent自主完成全流程 |
| Agent架构 | 独立Agent + 统一管理 | 专用提示词和工具集，通过统一Agent框架管理 |
| 对话组织 | 统一Chat中心 + 频道 | 所有Agent对话统一入口，频道切换，功能页面联动 |
| 验证闭环 | 自动验证 + 自动修复 | Agent生成SQL后自动测试，发现问题自动修复重试 |
| 生命周期 | 草稿→审核→发布 | Agent创建草稿，用户审核后手动发布 |
| 开发范围 | 指标 + 维度 | 指标和维度常需配套创建，模型仍手动管理 |

## 二、Agent框架架构（核心）

### 2.1 设计理念：Agent与业务解耦

**核心原则：Agent是独立的基础设施，与具体业务解耦。**

DataNova的Agent框架遵循以下架构原则：

1. **Agent独立管理** — 每个Agent是独立单元，拥有自己的身份、工具集、提示词、生命周期
2. **业务可扩展** — 新业务场景（指标治理、数据质量、数据报告、数据血缘等）只需注册新Agent，无需修改框架代码
3. **统一入口** — 所有Agent通过统一的Chat对话中心接入，用户选择Agent频道交互
4. **工具共享** — 基础工具（discover_schema、execute_sql等）可被多个Agent复用，专用工具按需注册
5. **上下文隔离** — 每个Agent有独立的会话上下文，互不干扰

```
┌─────────────────────────────────────────────────────────┐
│                  Agent Framework (基础设施)               │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Agent    │  │ Agent    │  │ Agent    │  │ Agent  │  │
│  │ Registry │  │ Session  │  │ Channel  │  │ Tool   │  │
│  │ (注册表) │  │ Manager  │  │ Router   │  │ Pool   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                         │
│  共享基础设施: WebSocket / Store / MySQL Pool / LLM     │
└─────────────────────────────────────────────────────────┘
          │ 注册          │ 注册          │ 注册
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 智能问数Agent │ │ 指标开发Agent │ │ 指标治理Agent │  ← 业务层
│ (query)      │ │ (metric_dev) │ │ (metric_gov) │     (可扩展)
│ 工具: 5个    │ │ 工具: 9个    │ │ 工具: TBD    │
│ 提示词: 问数 │ │ 提示词: 开发 │ │ 提示词: 治理 │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 2.2 Agent定义模型

每个Agent通过标准化的 `AgentDefinition` 注册，框架不感知具体业务逻辑：

```typescript
interface AgentDefinition {
  // === 身份（框架层） ===
  id: string;                    // 唯一标识: "query" | "metric_dev" | "metric_govern" | ...
  name: string;                  // 显示名称: "智能问数" | "指标开发" | ...
  icon: string;                  // 图标: "💬" | "📊" | "🛡️" | ...
  description: string;           // 频道描述
  color: string;                 // 主题色（用于Tab高亮和消息标识）
  version: string;               // Agent版本号

  // === 能力（业务层） ===
  capabilities: string[];        // 能力描述（展示给用户）
  toolSet: string[];             // 使用的工具ID列表
  systemPromptBuilder: (context: AgentContext) => string;  // 提示词构建器
  harnessFactory: (dsId: string, tools: AgentTool[]) => AgentHarness;  // Harness工厂

  // === 入口（集成层） ===
  entryPoints: EntryPoint[];     // 功能页面入口配置
  welcomeMessage: string;        // 欢迎消息
  messageComponents?: Record<string, React.ComponentType>;  // 自定义消息渲染组件
}

interface AgentContext {
  datasourceId: string;
  datasourceName: string;
  existingMetricsCount: number;
  existingDimensionsCount: number;
  // Agent可按需扩展上下文字段
}

interface EntryPoint {
  view: string;                  // 来源页面: "metrics" | "chat" | ...
  label: string;                 // 按钮文字: "🤖 AI开发指标"
  initialPrompt?: string;        // 预填提示词
}
```

### 2.3 Agent注册表

Agent注册表是框架的核心，管理所有Agent的生命周期：

```typescript
// packages/server/src/agent/agent-registry.ts

class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private toolPool = new Map<string, AgentTool>();  // 全局工具池

  /** 注册工具到全局池 */
  registerTool(tool: AgentTool): void {
    this.toolPool.set(tool.name, tool);
  }

  /** 注册Agent */
  registerAgent(def: AgentDefinition): void {
    this.agents.set(def.id, def);
  }

  /** 获取Agent定义 */
  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  /** 获取Agent的工具集（从全局池中按ID查找） */
  getAgentTools(agentId: string): AgentTool[] {
    const def = this.agents.get(agentId);
    if (!def) return [];
    return def.toolSet
      .map(toolId => this.toolPool.get(toolId))
      .filter(Boolean) as AgentTool[];
  }

  /** 获取所有已注册Agent（用于前端频道Tab） */
  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /** 创建Agent的Harness实例 */
  createHarness(agentId: string, dsId: string): AgentHarness {
    const def = this.agents.get(agentId);
    if (!def) throw new Error(`Agent not found: ${agentId}`);
    const tools = this.getAgentTools(agentId);
    return def.harnessFactory(dsId, tools);
  }
}

// 全局单例
export const agentRegistry = new AgentRegistry();
```

### 2.4 工具注册（共享+专用）

工具分为两类：**共享工具**（多个Agent复用）和**专用工具**（特定Agent独占）。

```typescript
// packages/server/src/agent/tool-registration.ts

export function registerAllTools(registry: AgentRegistry) {
  // === 共享工具（多个Agent复用） ===
  registry.registerTool(createDiscoverSchemaTool());      // discover_schema
  registry.registerTool(createExecuteSqlTool());           // execute_sql
  registry.registerTool(createLookupSemanticLayerTool());  // lookup_semantic_layer
  registry.registerTool(createLookupExamplesTool());       // lookup_examples
  registry.registerTool(createReadSkillTool());            // read_skill
  registry.registerTool(createAiAnnotateSchemaTool());     // ai_annotate_schema

  // === 指标开发专用工具 ===
  registry.registerTool(createValidateAndTestMetricTool());  // validate_and_test_metric
  registry.registerTool(createCheckMetricConflictTool());    // check_metric_conflict
  registry.registerTool(createCreateMetricDraftTool());      // create_metric_draft
  registry.registerTool(createCreateDimensionDraftTool());   // create_dimension_draft

  // 未来：指标治理专用工具
  // registry.registerTool(createAuditMetricTool());
  // registry.registerTool(createDeprecateMetricTool());
}
```

### 2.5 Agent注册（业务层）

```typescript
// packages/server/src/agent/agent-registration.ts

export function registerAllAgents(registry: AgentRegistry) {
  // === 智能问数Agent ===
  registry.registerAgent({
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
    systemPromptBuilder: buildQuerySystemPrompt,
    harnessFactory: createQueryHarness,
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  });

  // === 指标开发Agent ===
  registry.registerAgent({
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    version: "1.0.0",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    toolSet: [
      // 共享工具
      "discover_schema", "execute_sql", "lookup_semantic_layer",
      "lookup_examples", "read_skill",
      // 专用工具
      "validate_and_test_metric", "check_metric_conflict",
      "create_metric_draft", "create_dimension_draft",
    ],
    systemPromptBuilder: buildMetricDevSystemPrompt,
    harnessFactory: createMetricDevHarness,
    entryPoints: [
      { view: "metrics", label: "🤖 AI开发指标" },
    ],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  });

  // === 未来：指标治理Agent ===
  // registry.registerAgent({
  //   id: "metric_govern",
  //   name: "指标治理",
  //   icon: "🛡️",
  //   description: "指标审核、版本管理和弃用流程",
  //   ...
  // });

  // === 未来：数据质量Agent ===
  // registry.registerAgent({
  //   id: "data_quality",
  //   name: "数据质量",
  //   icon: "✅",
  //   description: "监控指标数据质量，异常告警",
  //   ...
  // });

  // === 未来：数据报告Agent ===
  // registry.registerAgent({
  //   id: "data_report",
  //   name: "数据报告",
  //   icon: "📝",
  //   description: "自动生成指标分析报告",
  //   ...
  // });

  // === 未来：数据血缘Agent ===
  // registry.registerAgent({
  //   id: "data_lineage",
  //   name: "数据血缘",
  //   icon: "🔗",
  //   description: "追踪指标和数据血缘关系",
  //   ...
  // });
}
```

**新增Agent的步骤**（零框架改动）：
1. 实现专用工具（如有） → `registerTool()`
2. 定义Agent配置 → `registerAgent()`
3. 实现系统提示词构建器
4. 前端自动从注册表渲染频道Tab（无需改Chat页面代码）

### 2.6 Chat页面频道UI

```
┌────────────────────────────────────────────────────┐
│  💬 智能问数  |  📊 指标开发  |  🛡️ 指标治理  |  +  │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  📊 指标开发                                        │
│                                                     │
│  欢迎使用指标开发助手！我可以帮你：                    │
│  • 开发新的业务指标                                  │
│  • 创建维度定义                                     │
│  • 检查指标冲突                                     │
│                                                     │
│  用户: 帮我开发一个月度营收指标                       │
│                                                     │
│  Agent: 我来分析数据源...                            │
│    → 发现 orders 表有 total_amount 字段              │
│    → 检查已有指标: 无冲突                            │
│    → 生成SQL ✓                                      │
│    → 验证通过 ✓ | 测试返回12行数据                    │
│                                                     │
│  ┌─ 指标卡片 ─────────────────────────────┐         │
│  │ 月度营收 (monthly_revenue)             │         │
│  │ 类型: atomic | 状态: 草稿              │         │
│  │ SQL: SELECT DATE_FORMAT(...) ...       │         │
│  │ [查看详情] [发布] [继续优化]            │         │
│  └────────────────────────────────────────┘         │
│                                                     │
│  ┌──────────────────────────────────────────┐       │
│  │ 描述你需要的指标或维度...                 │       │
│  └──────────────────────────────────────────┘       │
└────────────────────────────────────────────────────┘
```

**频道切换规则**：
- 点击频道Tab切换Agent类型
- 切换时保存当前频道对话历史
- 新频道如果无对话历史，显示欢迎消息和能力列表
- 频道Tab右侧有 `+` 按钮（预留，未来可展示Agent市场）

**对话历史持久化策略**：
- 每个Agent频道使用独立的 `conversationId`，格式为 `{agentType}:{datasourceId}:{uuid}`
- 频道切换时：当前频道的harness保持存活（InMemorySessionRepo保留上下文），新频道创建或恢复harness
- 对话消息通过 `saveMessage()` 持久化到SQLite，页面刷新后可恢复
- 同一数据源下同一Agent类型只保留最近一个活跃会话

**功能页面联动**：
- 指标管理页 `🤖 AI开发` 按钮 → `setView("chat")` + `setActiveChannel("metric_dev")`
- 可携带上下文参数（如当前选中的表名）
- Chat页面记住上次活跃的频道

## 三、指标开发Agent详细设计

### 3.1 专用工具集

| 工具名 | 功能 | 参数 | 类型 |
|--------|------|------|------|
| `discover_schema` | 探索数据源Schema | datasource_id, table_names? | 复用现有 |
| `execute_sql` | 执行SQL查询 | datasource_id, sql, question? | 复用现有 |
| `lookup_semantic_layer` | 查看已有指标/维度 | datasource_id, query | 复用现有 |
| `lookup_examples` | 查看历史成功查询 | datasource_id, query | 复用现有 |
| `read_skill` | 读取Query Skills | skill_id | 复用现有 |
| `create_metric_draft` | 创建指标草稿 | name, display_name, sql, metric_type, ... | **新建** |
| `create_dimension_draft` | 创建维度草稿 | name, display_name, sql_expression, data_type, ... | **新建** |
| `validate_and_test_metric` | 验证+测试指标SQL | datasource_id, sql, metric_type | **新建** |
| `check_metric_conflict` | 检查指标冲突 | datasource_id, name, sql | **新建** |

### 3.2 新建工具详细规格

#### 3.2.1 `create_metric_draft`

创建指标草稿，自动执行验证后保存。

```typescript
const CreateMetricDraftParams = Type.Object({
  datasource_id: Type.String(),
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
  category: Type.Optional(Type.String({ description: "分类: yingshou, yonghu, ..." })),
  default_sort: Type.Optional(Type.String({ description: "默认排序: revenue DESC" })),
  related_dimension_names: Type.Optional(Type.Array(Type.String(), { description: "需同时创建的维度名" })),
});
```

**执行流程**：
1. 检查名称冲突（同名指标已存在 → 返回冲突信息）
2. EXPLAIN验证SQL语法
3. 执行SQL + LIMIT 10 测试
4. 合理性检查（行数、空值比例、数值范围）
5. 全部通过 → 创建为 `draft` 状态，`created_by: "agent"`
6. 任一失败 → 返回错误详情，不创建

#### 3.2.2 `validate_and_test_metric`

验证指标SQL的正确性，返回详细的验证报告。

```typescript
const ValidateAndTestMetricParams = Type.Object({
  datasource_id: Type.String(),
  sql: Type.String({ description: "待验证的SQL" }),
  metric_type: Type.String({ description: "指标类型，影响验证策略" }),
  expected_rows_range: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
});
```

**验证步骤**：
1. **语法验证** — EXPLAIN SQL，检查语法错误
2. **执行测试** — 执行 SQL + LIMIT 10，获取样本数据
3. **结果分析**：
   - 行数检查：0行 → 可能SQL有误
   - 空值检查：关键列空值比例 > 50% → 可能JOIN错误
   - 类型检查：聚合结果是否为数值类型
   - 范围检查：数值是否在合理范围（负数营收？极大值？）
4. **衍生指标特殊检查** — 分子分母是否同步
5. **复合指标特殊检查** — 窗口函数的PARTITION BY和ORDER BY是否正确

**返回结果**：
```typescript
{
  valid: boolean;
  errors: Array<{ step: string; message: string; suggestion?: string }>;
  test_result?: {
    row_count: number;
    sample_rows: any[];
    column_types: Record<string, string>;
    null_ratios: Record<string, number>;
    warnings: string[];
  };
}
```

#### 3.2.3 `check_metric_conflict`

检查新指标定义与已有指标的冲突。

```typescript
const CheckMetricConflictParams = Type.Object({
  datasource_id: Type.String(),
  name: Type.String({ description: "拟使用的指标名" }),
  sql: Type.Optional(Type.String({ description: "拟使用的SQL" })),
  display_name: Type.Optional(Type.String({ description: "拟使用的显示名" })),
});
```

**冲突检测**：
1. 同名指标（name重复）— 严重冲突
2. 同显示名（display_name重复）— 可能混淆
3. SQL语义等价（不同写法但逻辑相同）— 提示复用
4. 包含关系（新SQL是已有指标SQL的子集/超集）— 建议参考

### 3.3 Agent工作流程

#### 3.3.1 标准流程

```
用户描述需求
    │
    ▼
Step 1: 理解需求
    │ Agent解析用户描述，明确指标业务含义
    │
    ▼
Step 2: check_metric_conflict
    │ 检查是否已有同名/类似指标
    │ → 有冲突: 建议复用或修改名称
    │
    ▼
Step 3: discover_schema + lookup_semantic_layer
    │ 探索数据源结构，查看已有指标和维度
    │ → 找到相关表和字段
    │
    ▼
Step 4: read_skill + lookup_examples
    │ 查看Query Skills和历史查询，理解业务语义
    │
    ▼
Step 5: 生成SQL
    │ 编写完整的可执行SQL
    │
    ▼
Step 6: validate_and_test_metric
    │ 自动验证语法 + 执行测试 + 合理性检查
    │
    ├─ 验证通过 → 继续
    │
    └─ 验证失败 → 分析错误
         │
         ▼
    自动修复（最多3次重试）
         │ 修复SQL → 回到Step 6
         │ 超过重试次数 → 返回错误详情，请用户协助
         │
         ▼
Step 7: create_metric_draft
    │ 创建指标草稿（status: "draft", created_by: "agent"）
    │ 如有关联维度需同时创建: create_dimension_draft
    │
    ▼
Step 8: 通知用户
    │ 展示指标卡片 + 验证结果 + 测试数据
    │ 建议用户到指标管理页面审核发布
```

#### 3.3.2 自动修复策略

| 错误类型 | 修复策略 |
|---------|---------|
| 语法错误 | Agent分析错误信息，修正SQL语法 |
| 字段不存在 | Agent重新discover_schema，找到正确字段名 |
| 表名错误 | Agent重新discover_schema，找到正确表名 |
| 结果为空 | Agent分析WHERE条件，可能过于严格 |
| 空值过多 | Agent检查JOIN条件，可能遗漏关联 |
| 数值异常 | Agent检查聚合逻辑，可能SUM了错误字段 |
| 衍生指标分母为0 | Agent添加 NULLIF 或 CASE WHEN 保护 |

### 3.4 系统提示词

```
你是一个专业的指标开发助手，隶属DataNova智能数据平台。你的任务是帮助用户开发准确、可靠的业务指标和维度定义。

## 核心身份
- 你是指标开发专家，擅长从数据库Schema中发现业务含义，并将其转化为标准化的指标定义
- 你只负责创建指标和维度的草稿，不负责发布——发布需要用户在指标管理页面手动操作

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
```

## 四、前端实现

### 4.1 Chat页面频道化改造

**新增组件**：
- `ChannelTabs.tsx` — 频道Tab栏组件
- `AgentWelcome.tsx` — Agent欢迎页面（展示能力和快捷操作）
- `MetricCard.tsx` — 指标卡片消息组件
- `DimensionCard.tsx` — 维度卡片消息组件
- `ValidationResult.tsx` — 验证结果展示组件

**状态管理扩展**（Zustand store）：
```typescript
interface AppState {
  // 新增字段
  activeChannel: string;                    // 当前活跃频道ID
  channelSessions: Record<string, string>;  // 频道→会话ID映射
}
```

**ChatWindow改造要点**：
1. 顶部渲染 `ChannelTabs`，从 `AGENT_REGISTRY` 动态生成
2. 频道切换时：
   - 保存当前频道的对话状态
   - 加载目标频道的对话历史（如果有）
   - 发送新的 `init` WebSocket消息，携带 `agentType`
3. 消息渲染根据当前频道的Agent类型选择不同的消息组件
4. 新对话时显示 `AgentWelcome` 组件

### 4.2 指标管理页面联动

**MetricsPage改造**：
- 在header的按钮区域增加 `🤖 AI开发` 按钮
- 点击后调用 `setView("chat")` + `setActiveChannel("metric_dev")`
- 可选：携带当前选中的表名作为 `initialPrompt` 的一部分

**新指标实时刷新**：
- 当指标开发Agent创建草稿后，如果用户切换回指标管理页面，自动刷新指标列表
- 新创建的指标在列表中高亮显示（如带 `new` 标记）

### 4.3 消息类型扩展

指标开发频道的消息类型扩展：

| 消息类型 | 用途 | 渲染方式 |
|---------|------|---------|
| `text` | Agent思考过程和解释 | 普通文本（现有） |
| `code` | SQL代码块 | 语法高亮 + 复制按钮（现有） |
| `table` | SQL执行结果 | 数据表格（现有） |
| `metric_card` | 创建的指标摘要 | **新增** — 指标卡片组件 |
| `dimension_card` | 创建的维度摘要 | **新增** — 维度卡片组件 |
| `validation_result` | 验证结果 | **新增** — 验证状态组件 |
| `step_progress` | Agent工作步骤进度 | **新增** — 步骤指示器 |

### 4.4 指标卡片组件设计

```
┌─ 指标卡片 ──────────────────────────────────┐
│ 📊 月度营收 (monthly_revenue)                │
│ 类型: 原子指标 | 状态: 草稿 | 验证: ✓ 通过    │
│                                              │
│ SQL: SELECT DATE_FORMAT(created_at,'%Y-%m')  │
│      AS month, SUM(total_amount) AS revenue  │
│      FROM orders GROUP BY month              │
│                                              │
│ 业务描述: 按月统计已完成订单的总金额           │
│ 测试结果: 12行数据 | 范围 ¥85,200~¥142,800    │
│                                              │
│ [查看详情] [在指标管理中打开]                   │
└──────────────────────────────────────────────┘
```

## 五、后端实现

### 5.1 WebSocket通道扩展

**init消息扩展**：
```typescript
// 客户端 → 服务器
{
  type: "init",
  payload: {
    conversationId: "metric-dev-xxx",
    datasourceId: "ds-123",
    agentType: "metric_dev",   // 新增字段，默认 "query"
  }
}
```

**chat-handler.ts改造**（使用Agent注册表，零switch-case）：
```typescript
// 使用注册表创建Harness，无需switch-case
const harness = agentRegistry.createHarness(payload.agentType || "query", payload.datasourceId);
```

### 5.2 新增文件清单

```
packages/server/src/
├── agent/
│   ├── agent-registry.ts              # Agent注册表（框架核心）
│   ├── tool-registration.ts           # 工具注册（共享+专用）
│   ├── agent-registration.ts          # Agent注册（业务层配置）
│   ├── metric-dev-harness.ts          # 指标开发Agent harness工厂
│   ├── prompt-builder-metric-dev.ts   # 指标开发专用提示词
│   └── tools/
│       ├── create-metric-draft.ts     # 创建指标草稿
│       ├── create-dimension-draft.ts  # 创建维度草稿
│       ├── validate-and-test-metric.ts # 验证+测试指标
│       └── check-metric-conflict.ts   # 冲突检查
├── routes/
│   └── semantic.ts                    # 扩展：新增验证+测试路由

packages/web/src/
├── agents/
│   ├── registry.ts                    # 前端Agent注册表（镜像后端）
│   └── types.ts                       # Agent类型定义
├── components/
│   └── Chat/
│       ├── ChannelTabs.tsx            # 频道Tab栏（从registry动态生成）
│       ├── AgentWelcome.tsx           # Agent欢迎页
│       └── cards/
│           ├── MetricCard.tsx         # 指标卡片消息
│           ├── DimensionCard.tsx      # 维度卡片消息
│           ├── ValidationResult.tsx   # 验证结果展示
│           └── StepProgress.tsx       # 步骤进度指示
```

### 5.3 新增API路由

```
POST /api/datasources/:dsId/metrics/validate-and-test
  Body: { sql: string, metric_type: string }
  Response: {
    valid: boolean,
    errors: Array<{ step: string, message: string, suggestion?: string }>,
    test_result?: {
      row_count: number,
      sample_rows: any[],
      column_types: Record<string, string>,
      null_ratios: Record<string, number>,
      warnings: string[]
    }
  }
```

### 5.4 数据模型变更

**semantic_metrics表新增字段**：
```sql
ALTER TABLE semantic_metrics ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual'
  CHECK(created_by IN ('manual', 'agent', 'ai_suggest'));
ALTER TABLE semantic_metrics ADD COLUMN agent_session_id TEXT;
ALTER TABLE semantic_metrics ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'unvalidated'
  CHECK(validation_status IN ('unvalidated', 'passed', 'failed'));
ALTER TABLE semantic_metrics ADD COLUMN validation_result TEXT;
```

**semantic_dimensions表新增字段**：
```sql
ALTER TABLE semantic_dimensions ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual'
  CHECK(created_by IN ('manual', 'agent', 'ai_suggest'));
ALTER TABLE semantic_dimensions ADD COLUMN agent_session_id TEXT;
```

**initTables()迁移**：
- 使用 `PRAGMA table_info()` 检查新列是否存在
- 不存在则 `ALTER TABLE ADD COLUMN`

### 5.5 Store函数扩展

```typescript
// 新增函数
function checkMetricNameConflict(datasourceId: string, name: string): SemanticMetric | null;
function checkMetricDisplayNameConflict(datasourceId: string, displayName: string): SemanticMetric[];
function findSimilarMetrics(datasourceId: string, sql: string): SemanticMetric[];
```

## 六、Agent框架实现（前后端）

### 6.1 后端：Agent注册表 + 工具池

**核心文件**：`packages/server/src/agent/agent-registry.ts`

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core";

// === Agent定义类型 ===
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
  harnessFactory: (dsId: string, tools: AgentTool[]) => any;  // AgentHarness
  entryPoints: EntryPoint[];
  welcomeMessage: string;
}

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

// === Agent注册表 ===
class AgentRegistry {
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

**工具注册**：`packages/server/src/agent/tool-registration.ts`

```typescript
export function registerAllTools(registry: AgentRegistry) {
  // 共享工具
  registry.registerTool(createDiscoverSchemaTool());
  registry.registerTool(createExecuteSqlTool());
  registry.registerTool(createLookupSemanticLayerTool());
  registry.registerTool(createLookupExamplesTool());
  registry.registerTool(createReadSkillTool());
  registry.registerTool(createAiAnnotateSchemaTool());

  // 指标开发专用工具
  registry.registerTool(createValidateAndTestMetricTool());
  registry.registerTool(createCheckMetricConflictTool());
  registry.registerTool(createCreateMetricDraftTool());
  registry.registerTool(createCreateDimensionDraftTool());
}
```

**Agent注册**：`packages/server/src/agent/agent-registration.ts`

```typescript
export function registerAllAgents(registry: AgentRegistry) {
  // 智能问数Agent
  registry.registerAgent({
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
    systemPromptBuilder: buildQuerySystemPrompt,
    harnessFactory: createQueryHarness,
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  });

  // 指标开发Agent
  registry.registerAgent({
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
    systemPromptBuilder: buildMetricDevSystemPrompt,
    harnessFactory: createMetricDevHarness,
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  });

  // 未来：直接在此文件追加新Agent注册即可，零框架改动
}

// 初始化入口
export function initAgentFramework() {
  registerAllTools(agentRegistry);
  registerAllAgents(agentRegistry);
}
```

**服务启动时初始化**：`packages/server/src/index.ts`

```typescript
import { initAgentFramework, agentRegistry } from "./agent/agent-registration.js";

// 在Hono app创建前初始化Agent框架
initAgentFramework();
```

### 6.2 前端：Agent注册表镜像

**核心文件**：`packages/web/src/agents/registry.ts`

```typescript
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

// 前端只保留展示所需信息，不包含harnessFactory等后端细节
export const AGENT_REGISTRY: AgentInfo[] = [
  {
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "用自然语言查询数据",
    color: "var(--primary)",
    capabilities: ["查询数据", "生成图表", "探索Schema"],
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手...",
  },
  {
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手...",
  },
];

// 辅助函数
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

**ChannelTabs组件**：从registry动态渲染，新增Agent无需改此组件

```tsx
// packages/web/src/components/Chat/ChannelTabs.tsx
import { AGENT_REGISTRY } from "../../agents/registry";

export default function ChannelTabs({ activeChannel, onChannelChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--hairline)]">
      {AGENT_REGISTRY.map(agent => (
        <button
          key={agent.id}
          onClick={() => onChannelChange(agent.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeChannel === agent.id
              ? `border-[${agent.color}] text-[${agent.color}]`
              : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
          }`}
        >
          {agent.icon} {agent.name}
        </button>
      ))}
    </div>
  );
}
```

## 七、兼容性保障：对现有智能问数流程零影响

### 7.1 核心原则

**Agent框架的引入必须是渐进式的，不能破坏现有智能问数流程。**

现有流程路径：
```
ChatWindow → WebSocket init(conversationId, datasourceId)
  → chat-handler.ts → createHarness(options)
    → harness-factory.ts → 硬编码工具列表 + buildDataNovaSystemPrompt
      → AgentHarness → LLM对话
```

**改造策略：包裹式重构，非替换式重构**。

### 7.2 兼容方案

**方案：保留现有 `createHarness` 函数，Agent注册表作为上层路由**

```typescript
// harness-factory.ts 保持不变，继续作为"query" Agent的工厂

// agent-registry.ts 中的 query Agent 直接复用现有工厂
registry.registerAgent({
  id: "query",
  name: "智能问数",
  ...
  harnessFactory: (dsId: string, tools: AgentTool[]) => {
    // 直接调用现有的 createHarness，不受注册表影响
    return createHarness({
      conversationId: generateId(),
      datasourceId: dsId,
    });
  },
});
```

**关键：`createHarness` 函数签名和行为完全不变**，注册表只是在更上层做路由。

### 7.3 chat-handler.ts 最小改动

```typescript
// 改造前
const harness = await createHarness(options);

// 改造后 — 仅增加 agentType 路由，无 agentType 时行为完全不变
const agentType = (payload.agentType as string) || "query";
let harness: AgentHarness;

if (agentType === "query") {
  // 现有流程，零改动
  harness = await createHarness(options);
} else {
  // 新Agent走注册表
  harness = agentRegistry.createHarness(agentType, options.datasourceId!);
  // 订阅事件等后续逻辑完全相同
}
```

### 7.4 前端兼容性

**ChatWindow 改造**：
- 默认频道为 "query"，行为与现在完全一致
- 频道Tab是新增UI，不影响现有对话功能
- `init` 消息增加可选的 `agentType` 字段，不传时默认 "query"
- 现有的 `useWebSocket` 和 `useAgentStream` 逻辑不变

**具体来说**：
1. `useWebSocket.ts` — 无需改动，init消息payload中增加可选字段即可
2. `useAgentStream.ts` — 无需改动，Agent事件格式不变
3. `ChatWindow.tsx` — 顶部增加ChannelTabs，消息区域逻辑不变

### 7.5 改造影响矩阵

| 组件 | 改动类型 | 影响范围 |
|------|---------|---------|
| `harness-factory.ts` | 不改动 | 无影响 |
| `prompt-builder.ts` | 不改动 | 无影响 |
| `chat-handler.ts` | 增加3行路由代码 | 仅新Agent走新路径，query不变 |
| `ChatWindow.tsx` | 增加ChannelTabs | 现有消息渲染不变 |
| `useWebSocket.ts` | 无改动 | 无影响 |
| `useAgentStream.ts` | 无改动 | 无影响 |
| WebSocket init消息 | 增加可选字段 | 向后兼容 |

### 7.6 测试验证

改造完成后必须验证：
1. **回归测试** — 现有智能问数流程完全正常（init不带agentType → 默认query → 走原有createHarness）
2. **新Agent测试** — 指标开发频道init带agentType="metric_dev" → 走注册表创建
3. **频道切换测试** — query → metric_dev → query 切换不丢失上下文

## 八、实施计划概览

### Phase 1: 基础架构 + 兼容性保障（1-2天）
- [ ] Agent注册框架（前端registry + 后端factory registry）
- [ ] chat-handler.ts 最小改动（3行路由代码，query走原路径）
- [ ] Chat频道Tab组件（默认query，行为不变）
- [ ] Zustand store扩展（activeChannel, channelSessions）
- [ ] WebSocket init消息扩展（可选agentType字段）
- [ ] **回归测试**：验证智能问数流程完全不受影响

### Phase 2: 指标开发Agent核心（2-3天）
- [ ] validate_and_test_metric 工具
- [ ] check_metric_conflict 工具
- [ ] create_metric_draft 工具
- [ ] create_dimension_draft 工具
- [ ] metric-dev-harness.ts 工厂
- [ ] prompt-builder-metric-dev.ts 提示词

### Phase 3: 前端交互（2天）
- [ ] AgentWelcome组件
- [ ] MetricCard / DimensionCard 消息组件
- [ ] ValidationResult 组件
- [ ] StepProgress 组件
- [ ] MetricsPage联动按钮

### Phase 4: 数据模型 + 测试（1天）
- [ ] Store迁移脚本（新增字段）
- [ ] 新增API路由
- [ ] 单元测试
- [ ] E2E测试

## 九、未来扩展

### 8.1 短期（v1.1）
- **指标治理Agent** — 审核草稿指标、版本管理、弃用流程
- **批量指标开发** — 一次性开发一组相关指标
- **指标模板** — 预置行业常用指标模板

### 8.2 中期（v1.2）
- **数据质量Agent** — 监控指标数据质量，异常告警
- **数据报告Agent** — 自动生成指标分析报告
- **指标血缘** — 追踪指标之间的依赖关系

### 8.3 长期（v2.0）
- **数据血缘Agent** — 完整的数据血缘追踪
- **OSI标准支持** — 导入导出OSI YAML格式
- **MCP Server** — 将语义层暴露为MCP协议，外部Agent可消费
- **Agent市场** — 用户可自定义Agent并分享
