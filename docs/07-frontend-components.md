# 前端组件详解

> 本文档详解前端的组件层级、状态管理和关键交互流程。

---

## 一、技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| React | 19 | UI 框架 |
| Vite | 6 | 构建工具 + 开发服务器 |
| TailwindCSS | 3 | 原子化 CSS |
| Zustand | 5 | 全局状态管理 |
| TanStack Table | — | 数据表格渲染 |
| Recharts | — | 图表渲染 |

---

## 二、组件树

```
App.tsx
  └─ Layout.tsx（侧边栏 + 主内容区）
       ├─ Sidebar.tsx           ← 导航侧边栏 (8 nav items: 数据概览/对话/数据源/Schema标注/指标管理/自助分析/数据字典/SQL历史)
       └─ 主内容区（按 view 切换）：
            ├─ DashboardPage.tsx       ← 数据概览 (默认视图)
            │
            ├─ ChatWindow.tsx          ← 聊天视图
            │    ├─ DatasourceSelector.tsx  ← 数据源选择器
            │    ├─ ModelSelector.tsx
            │    ├─ MessageList.tsx
            │    │    └─ MessageItem.tsx
            │    │         ├─ StepIndicator.tsx      （工具步骤）
            │    │         ├─ ResultSummaryCard.tsx  （结果总结）
            │    │         ├─ ValidationBanner.tsx   （校验提示）
            │    │         ├─ SqlBlock.tsx           （SQL 代码块）
            │    │         ├─ TableResult.tsx        （数据表格）
            │    │         ├─ ChartView.tsx          （图表视图切换）
            │    │         ├─ MarkdownContent.tsx    （Markdown 渲染）
            │    │         ├─ AttributionView.tsx    （归因分析）
            │    │         └─ FeedbackButtons.tsx    （👍👎）
            │    └─ ChatInput.tsx
            │
            ├─ DatasourcePage.tsx     ← 数据源管理
            │    ├─ DatasourceList.tsx
            │    └─ DatasourceForm.tsx
            │
            ├─ SchemaPage.tsx         ← Schema 注解
            │    ├─ SchemaTree.tsx
            │    ├─ SchemaEnhancement.tsx
            │    ├─ AnnotationEditor.tsx
            │    ├─ AIAnnotationReview.tsx
            │    ├─ QueryExampleForm.tsx
            │    └─ SchemaPromptPreview.tsx
            │
            ├─ MetricsPage.tsx        ← 语义层管理
            │    ├─ MetricForm.tsx
            │    ├─ DimensionForm.tsx
            │    └─ ModelForm.tsx
            │
            ├─ AnalysisPage.tsx       ← 自助分析 (含定时查询功能)
            │
            ├─ DictionaryPage.tsx     ← 数据字典
            │    ├─ BrowseTree.tsx
            │    ├─ RelationshipDiagram.tsx
            │    └─ EntryDetail.tsx
            │
            ├─ QueryHistoryPage.tsx   ← SQL 查询历史
            │
            ├─ InsightsPage.tsx       ← BI 看板 (侧边栏无入口)
            │    ├─ StatsBar.tsx
            │    ├─ ChartCard.tsx
            │    └─ BookmarkDialog.tsx
            │
            ├─ OnboardingWizard.tsx   ← 新手引导（仅首次）
            │    └─ WizardStep.tsx
            │
            └─ 共享组件：
                 ├─ ChartRenderers.tsx    ← 共享图表渲染 (Recharts)
                 ├─ ReportView.tsx        ← 报告视图
                 └─ ReportExport.tsx      ← 报告导出 (xlsx)
```

---

## 三、全局状态（Zustand）

`packages/web/src/stores/app.ts`：

```typescript
interface AppState {
  // 导航
  view: "dashboard" | "chat" | "datasources" | "schemas" | "metrics" | "analysis" | "dictionary" | "queryHistory" | "insights";
  setView: (view: AppView) => void;

  // 当前选中的数据源
  selectedDatasourceId: string | null;
  selectedDatasourceName: string | null;
  setSelectedDatasource: (id: string | null, name: string | null) => void;

  // 当前选中的对话
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // 当前选中的指标
  selectedMetricId: string | null;
  setSelectedMetricId: (id: string | null) => void;

  // 当前选的模型
  modelProvider: string | null;
  modelId: string | null;
  setModel: (provider: string, modelId: string) => void;

  // 新手引导状态
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
}
```

---

## 四、CSS 变量体系

项目使用 CSS 变量实现主题，核心变量（Indigo/Purple 主题）：

```css
/* 主色调 (Indigo/Purple) */
--primary          /* 主色 (#4f46e5 indigo) */
--primary-soft     /* 主色浅底 */
--primary-deep     /* 主色深色 */
--primary-glow     /* 主色发光 */
--primary-text     /* 主色文字 */

/* 强调色 */
--accent-100 ~ --accent-700  /* 强调色阶梯 */
--highlight        /* 高亮色 */
--highlight-soft   /* 高亮浅底 */

/* 表面色 */
--canvas           /* 页面背景 */
--surface          /* 卡片/面板背景 */
--surface-raised   /* 提升表面 */
--surface-code     /* 代码块背景 */

/* 文字色 */
--ink              /* 主文字 */
--ink-tint         /* 略淡主文字 */
--slate            /* 次要文字 */
--steel            /* 三级文字 */
--charcoal         /* 强调文字 */
--stone            /* 标签文字 */
--muted            /* 禁用/占位文字 */

/* 侧边栏 */
--sidebar-bg       /* 侧边栏背景 */
--sidebar-hover    /* 侧边栏悬停 */
--sidebar-active   /* 侧边栏激活 */

/* 边框 */
--hairline         /* 1px 分割线 */

/* 语义色 */
--success          /* 成功 */
--warning          /* 警告 */
--error            /* 错误 */
--info             /* 信息 */
--info-soft        /* 信息浅底 */

/* 阴影 */
--shadow-1 ~ --shadow-3  /* 阴影层级 */
--shadow-glow      /* 发光阴影 */

/* 圆角 */
--radius-sm/md/lg/xl  /* 圆角阶梯 */

/* 过渡 */
--transition-fast/base/slow  /* 过渡时间 */
```

---

## 五、聊天流程（前端视角）

### 5.1 初始化

```
ChatWindow mount
  ├─ useWebSocket(url)  ← 建立 WebSocket 连接
  │    └─ ws.onopen → setIsConnected(true)
  │
  ├─ useAgentStream({ send, onEvent })
  │    └─ 提供 initSession() / sendMessage()
  │
  └─ useEffect
       ├─ 加载数据源列表
       ├─ 加载对话列表
       ├─ 发送 WebSocket init 消息
       │    send({ type: "init", payload: { conversationId, datasourceId, ... } })
       └─ 收到 init_success → 获取消息历史
```

### 5.2 发送消息

```
用户输入文字 → 点发送
  ├─ 乐观更新：立即插入用户消息到 messageList
  ├─ useAgentStream.sendMessage(text, conversationId)
  │    └─ useWebSocket.send({ type: "message", text, payload: { conversationId } })
  └─ 等待 agent_start 事件创建流式助手消息
```

### 5.3 接收事件

```
WebSocket onmessage → JSON.parse → processWsEvent(event, currentMsg)
  ├─ "agent_start"     → 创建空 assistant 消息（isStreaming: true）
  ├─ "text_delta"      → 追加 content
  ├─ "tool_execution_start" → 追加 step（type: "tool_call"）
  ├─ "tool_execution_end"   → 将 step 改为 tool_result
  ├─ "thinking"        → 追加 step（type: "thinking"）
  ├─ "agent_end"       → isStreaming = false
  ├─ "settled"         → isStreaming = false
  ├─ "message_history" → 替换全部消息列表
  └─ "error"           → 停止流式
```

### 5.4 消息持久化

```typescript
// 用户消息：发送时立即存
saveMessage({ conversationId, role: "user", content: text });

// 助手消息：agent_end 时累积内容统一存
saveMessage({ conversationId, role: "assistant", content, steps });
```

---

## 六、数据概览页面

`DashboardPage.tsx`（默认视图 dashboard）：
- 展示数据源概览信息
- 作为用户进入应用的首屏体验
- 需选择数据源后显示相关统计数据

---

## 七、自助分析页面

`AnalysisPage.tsx`（视图 analysis）：
- 整合了原 ScheduledPage 的定时查询功能
- 提供自助 SQL 分析能力
- 定时查询管理：创建/编辑/删除定时查询
- 告警配置：AlertConfig

---

## 八、Insights BI 看板

`InsightsPage.tsx`（视图 insights）：
- 注意：侧边栏无导航入口，需通过编程方式访问
- 子组件：
  - StatsBar.tsx：查询统计展示
  - ChartCard.tsx：图表面板
  - BookmarkDialog.tsx：查询收藏对话框
- API：/api/datasources/:dsId/insights/stats, /top-queries, /execute
- 收藏查询：/api/datasources/:dsId/bookmarks

---

## 九、SQL 查询历史页面

`QueryHistoryPage.tsx`（视图 queryHistory）：
- 展示所有已执行的 SQL 查询记录
- 数据来自 sql_query_history 表
- API：GET /api/query-history, GET /api/datasources/:dsId/query-history

---

## 十、数据源管理页面

`DatasourcePage.tsx`：
- 列表展示所有数据源
- 点击 "Add Datasource" → `DatasourceForm.tsx`
- 表单字段：Name / Host / Port / Database / User / Password
- 创建时先调 `POST /api/datasources`（服务端自动测试连接）
- 编辑时如果改连接信息，服务端重新测试连接
- 密码字段：编辑时留空表示不修改
- `DatasourceSelector.tsx` 在 ChatWindow 中用于切换当前数据源

---

## 十一、Schema 注解页面

`SchemaPage.tsx` 支持两种模式：

### Manual Annotate 模式
- `SchemaTree.tsx`：树形展示表 → 字段
- 点击字段 → `AnnotationEditor.tsx`：编辑注解
- 支持表级注解和字段级注解
- 状态：draft（草稿） / confirmed（已确认）

### Enhance 模式
- 选择多张表 → AI 批量注解
- `AIAnnotationReview.tsx`：审核 AI 生成的注解
- 确认后调用 `PUT /api/schemas/:dsId/annotations`
- 注解变更自动刷新所有 AgentHarness 的 Skills

---

## 十二、语义层管理页面

`MetricsPage.tsx` 三个标签页：

### Metrics 标签
- 列表展示所有指标（支持按 status 过滤）
- 状态：draft（草稿） / published（已发布） / deprecated（已废弃）
- 创建/编辑：`MetricForm.tsx`
  - 核心字段：name、display_name、sql_expression、filters、dimensions、aliases
- 支持 "Test SQL" 按钮

### Dimensions 标签
- 列表展示所有维度
- 创建/编辑：`DimensionForm.tsx`
  - 核心字段：name、display_name、sql_expression、data_type、values

### Models 标签
- 列表展示所有模型
- 创建/编辑：`ModelForm.tsx`
  - 核心字段：name、base_table、joins、metrics、dimensions

### AI Suggest
- 点击 "AI Suggest" → 调 `POST /api/datasources/:dsId/ai-suggest-semantic`
- 返回表结构分析 → AI 推荐指标/维度/模型定义

---

## 十三、模型选择器

`ModelSelector.tsx`：
1. 加载时调 `GET /api/models` 获取可用模型
2. 只显示配置了 API Key 的 Provider
3. 分组显示：Anthropic / OpenAI / DeepSeek / ...
4. 选中后存 Zustand：`setModel(provider, modelId)`
5. 切换后通过 WebSocket `init` 消息通知服务端
