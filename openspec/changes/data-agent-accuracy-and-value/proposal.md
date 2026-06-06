## Why

DataNova 当前作为 NL→SQL 翻译器，在企业场景下准确率约 55%，用户第一次查询经常得不到正确结果，导致信任缺失、无法落地。核心问题：Schema 信息不足导致 LLM 猜错表/列/JOIN、错误 SQL 无验证直接执行、查询结果缺乏业务解读、系统不会从历史中学习。企业需要的不是 SQL 翻译器，而是能理解业务、查准数据、主动洞察的数据 Agent。

## What Changes

### Phase 1 — 查得准（Week 1-2）

- **Schema 增强**：扩展 `formatSchemaForPrompt()` 输出，增加列值域（枚举值/数值范围）、每表常见查询示例、列间关系说明；在 schema discovery 时自动采样列值域
- **AI 自动注释**：实现 `ai-suggest` 接口，基于 DDL + 样本数据自动生成表描述、列语义、值域推断、FK 推断；用户确认后写入 annotation
- **SQL 验证纠错**：启用 `isSelectQuery()` 强制校验；增加表名/列名存在性检查、大表 WHERE 检查、空结果自动纠错（最多 2 次重试）、LIMIT 10 探测执行
- **结果总结增强**：Agent 执行 SQL 后强制生成结构化总结（关键数字 + 趋势判断 + 异常标注）；前端增加总结卡片组件

### Phase 2 — 语义层 + 追问（Week 3-4）

- **语义层 Phase 1-2**：实现指标定义（`semantic_metrics`）、维度定义（`semantic_dimensions`）、关系模型（`semantic_models`）的存储和 CRUD；Agent 流程改造为优先走语义层、兜底走 NL→SQL；AI 辅助发现指标/维度；前端指标管理 UI
- **多轮对话增强**：增加意图分类（new_query/refine/drill_down/compare/explain/chat）；追问时注入上轮 SQL 上下文；支持常见追问模式
- **Few-Shot 知识积累**：成功查询自动保存到 `query_examples` 表；查询时检索相似历史问题注入 prompt；关键词+编辑距离匹配（暂不用向量检索）
- **用户反馈闭环**：前端增加 👍👎 反馈按钮；反馈数据用于标记正确/错误 SQL、积累 Few-Shot

### Phase 3 — 用数据（Week 5-6）

- **语义层 Phase 3**：用户反馈修正指标定义；指标版本管理；指标测试查询
- **智能归因**：用户问"为什么 X 变化"→ 自动按维度拆解 → 找最大变化贡献因子 → 生成归因结论；依赖语义层维度层级

### Phase 4 — 完整能力（Week 7+）

- **智能报告**：用户说"生成月报"→ Agent 自动编排多查询 → 汇总为结构化报告（含图表+文字）
- **定时查询与告警**：配置定时任务自动执行；结果推送；异常阈值告警
- **数据字典**：全局搜索指标/表/术语；统一业务语义入口

## Capabilities

### New Capabilities

- `schema-enhancement`: Schema 增强与 AI 自动注释 — 列值域发现、常见查询示例、AI 生成注释、增量同步
- `sql-validation`: SQL 验证与自动纠错 — 多阶段验证、空结果纠错、探测执行
- `result-summary`: 结果总结增强 — 结构化自然语言总结、趋势标注、异常高亮
- `semantic-layer`: 语义层/指标层 — 指标定义、维度定义、关系模型、AI 辅助构建、指标管理 UI
- `multi-turn-dialog`: 多轮对话增强 — 意图分类、追问识别、SQL 继承、下钻上卷
- `knowledge-accumulation`: 知识积累与反馈闭环 — Few-Shot 示例库、自动积累、用户反馈
- `intelligent-attribution`: 智能归因 — 多维拆解、贡献因子识别、归因结论生成
- `smart-report`: 智能报告 — 自动编排查询、结构化报告生成
- `scheduled-query`: 定时查询与告警 — 定时任务、结果推送、异常检测
- `data-dictionary`: 数据字典 — 全局搜索、统一语义入口

### Modified Capabilities

（无现有 specs，所有能力均为新增）

## Impact

- **后端**：`harness-factory.ts`（Agent 工具注册、System Prompt 改造）、`chat-handler.ts`（事件转发增加新事件类型）、`store.ts`（新增多张 SQLite 表）、`executor.ts`（验证逻辑增强）、`discovery.ts`（值域采样）、新增多个工具文件
- **前端**：`ChatWindow.tsx`（总结卡片、反馈按钮）、新增指标管理页面、数据字典页面、Schema 增强编辑组件
- **API**：新增语义层 CRUD 路由、AI 注释路由、反馈路由、Few-Shot 路由、定时任务路由
- **依赖**：可能需要 SQL AST 解析库（如 `node-sql-parser`）、`node-cron` 定时任务库
- **数据迁移**：SQLite 新增 `semantic_metrics`、`semantic_dimensions`、`semantic_models`、`query_examples`、`query_feedback` 等表
