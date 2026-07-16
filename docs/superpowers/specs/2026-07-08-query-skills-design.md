# 查询技能模块设计

> 日期: 2026-07-08
> 状态: Draft
> 替代模块: 业务知识 (business_knowledge)

## 1. 背景与动机

当前"业务知识"模块是一个结构化表单填写的知识库——5个分类（业务术语、查询规则、表关联规则、数据质量、分析模式），每个分类有固定字段，用户填写后存入 `business_knowledge` 表，同步生成一个 `bk-{datasourceId}/SKILL.md` 文件。

**核心问题**：这种设计把"业务知识"当成了**解释性文档**，而不是**行动性技能**。一个资深数据人员的大脑里不是存着"账单的定义是什么"，而是"遇到账单问题，我知道该查哪张表、怎么关联、优先看什么"——这是一种查询能力，不是解释能力。

**设计目标**：将"业务知识"重新定位为"查询技能"——沉淀下来的、可被 Agent 调用的查询经验，当语义层无法直接取数时，这项技能尤为重要。

## 2. 核心概念

### 2.1 定位变化

| 维度 | 旧（业务知识） | 新（查询技能） |
|------|---------------|---------------|
| 本质 | 解释性文档 | 行动性技能 |
| 粒度 | 按知识分类（术语/规则/质量） | 按查询场景（客户账单明细/账单异常排查） |
| Agent 使用 | 被动参考 | 主动调用攻略 |
| 用户价值 | "AI 知道术语定义" | "AI 知道怎么查" |

### 2.2 与语义层的互补关系

- **语义层**（指标/维度）：处理标准化查询，如"本月GMV按地区" → `lookup_semantic_layer` 命中 → 直接用语义层 SQL
- **查询技能**：处理需要业务经验的复杂查询，如"查某客户的账单明细和异常" → `lookup_semantic_layer` 未命中 → Agent 检查技能 → `read_skill` 加载完整攻略

### 2.3 Agent 调用链

```
用户问题 → lookup_semantic_layer → 命中? → 用语义层SQL
                                  → 未命中 → 检查技能摘要(qs-*) → 匹配? → read_skill → 按攻略查询
                                                           → 不匹配 → lookup_examples → 命中? → 参考历史查询
                                                                                    → 未命中 → discover_schema + 从头生成
```

### 2.4 技能粒度

按查询场景划分，每个场景是一个独立技能。例如：
- "客户账单明细查询" — 一个技能
- "账单异常排查" — 另一个技能
- "员工考勤统计" — 又一个技能

## 3. 数据模型

### 3.1 新表 `query_skill`

替代 `business_knowledge` 表，旧表直接删除不迁移。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| datasource_id | TEXT | 所属数据源 |
| domain | TEXT | 业务域（如"账单"、"人力资源"、"库存"），用于分类管理 |
| name | TEXT | 技能名称（如"客户账单明细查询"） |
| trigger_keywords | TEXT (JSON array) | 触发关键词（如["账单","billing","客户明细"]），Agent 用于匹配 |
| business_context | TEXT | 业务背景简述（如"客户账单包含主表和明细表，需关联查询"） |
| core_tables | TEXT (JSON array of objects) | 核心表列表（如[{"table":"ads_bill","purpose":"账单汇总"},{"table":"dim_customer","purpose":"客户维度"}]），按查询优先级排序 |
| join_path | TEXT | 表关联路径描述（如"ads_bill → dim_customer ON customer_id, ads_bill → dwd_bill_detail ON bill_id"） |
| query_steps | TEXT | 查询步骤（如"1.从ads_bill取客户账单汇总 2.关联dim_customer取客户信息 3.关联dwd_bill_detail取明细"） |
| example_sql | TEXT | 示例SQL（带注释的完整SQL） |
| caveats | TEXT | 注意事项（如"ads_bill的status字段0=未支付1=已支付，不要用IS NULL判断"） |
| common_issues | TEXT | 常见问题（如"客户维度查询时注意区分企业客户和个人客户"） |
| enabled | INTEGER | 0/1 启用状态 |
| sort_order | INTEGER | 排序 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

**必填字段**：`domain`, `name`, `trigger_keywords`, `core_tables`, `query_steps`
**可选字段**：`business_context`, `join_path`, `example_sql`, `caveats`, `common_issues`

### 3.2 索引

```sql
CREATE INDEX IF NOT EXISTS idx_query_skill_datasource ON query_skill(datasource_id);
CREATE INDEX IF NOT EXISTS idx_query_skill_domain ON query_skill(datasource_id, domain);
```

### 3.3 SKILL.md 生成

每个启用的技能生成 `skills/qs-{skillId}/SKILL.md`，内容格式：

```markdown
---
name: qs-{skillId}
description: {domain}: {name}
---

# {name}

**业务域**: {domain}
**触发关键词**: {trigger_keywords}

## 业务背景
{business_context}

## 核心表
{core_tables rendered as bullet list: "- ads_bill: 账单汇总"}

## 关联路径
{join_path}

## 查询步骤
{query_steps}

## 示例SQL
{example_sql in code block}

## 注意事项
{caveats}

## 常见问题
{common_issues}
```

**命名规则变化**：
- 旧：`bk-{datasourceId}`（一个数据源一个 Skill，所有知识混在一起）
- 新：`qs-{skillId}`（每个场景一个 Skill，独立可管理）

## 4. AI 生成技能

### 4.1 单个技能生成流程

1. 用户点击"AI 生成技能"按钮
2. 弹出对话框，用户输入：
   - **业务域**（如"账单"）
   - **场景描述**（如"查询客户的账单明细，包括账单汇总和明细流水"）
3. 后端调用 AI，AI 分析该数据源的 schema 信息，生成完整的技能内容
4. 返回生成的技能草稿，用户在前端编辑器中审核和修改
5. 用户确认后保存

### 4.2 批量生成

用户也可以输入一个业务域，AI 自动识别该域下的多个查询场景，一次性生成多个技能。

**请求格式**：`POST /api/datasources/:dsId/query-skills/generate-batch`
```json
{ "domain": "账单" }
```

**响应格式**：返回 AI 生成的技能草稿数组（未保存到数据库），用户逐个审核后手动保存。
```json
{ "skills": [{ "domain": "账单", "name": "...", "trigger_keywords": [...], ... }, ...] }
```

### 4.3 AI Prompt 设计

```
你是一个资深数据分析师，正在为以下数据库编写查询技能攻略。

数据库 Schema:
{discover_schema 返回的表结构信息}

业务域: {domain}
场景描述: {scenario_description}

请生成一个完整的查询技能，包含：
1. name: 技能名称（简洁明确，如"客户账单明细查询"）
2. trigger_keywords: 触发关键词（3-5个，用户提到这些词时应激活此技能）
3. business_context: 业务背景（2-3句话说明这个场景的业务含义）
4. core_tables: 核心表列表（按查询优先级排序，说明每张表的用途）
5. join_path: 关联路径（表之间的 JOIN 关系，用箭头表示）
6. query_steps: 查询步骤（1.2.3.分步骤说明查询逻辑）
7. example_sql: 示例SQL（一个完整的、可执行的SQL，带中文注释）
8. caveats: 注意事项（数据质量、字段含义、常见陷阱）
9. common_issues: 常见问题（用户可能遇到的典型问题和处理方式）

输出 JSON 格式。
```

批量生成时追加：`请识别该业务域下的3-5个典型查询场景，为每个场景生成上述完整技能。输出 JSON 数组。`

### 4.4 技术实现

- 使用 `DEEPSEEK_API_KEY` 或 `ANTHROPIC_API_KEY` 调用 AI
- 调用 `discoverSchema(datasourceId)` 获取 schema 信息作为 AI 上下文
- 新增 API 端点：`POST /api/datasources/:dsId/query-skills/generate`

## 5. 前端交互

### 5.1 页面布局

三栏式布局，与现有页面风格一致：

```
┌─────────────────────────────────────────────────────────┐
│ 查询技能                                    [AI生成] [新增] │
│ 让 AI 掌握你的业务查询经验，提升复杂查询准确度              │
├──────┬──────────────┬──────────────────────────────────┤
│ 业务域 │  技能列表     │  技能详情 / 编辑器                │
│      │              │                                  │
│ 📋全部│ □ 客户账单明细  │  # 客户账单明细查询               │
│ 💰账单│   查询        │                                  │
│ 👥人力│ □ 账单异常排查  │  业务域: 账单                     │
│ 📦库存│ □ 员工考勤统计  │  触发关键词: 账单, 客户明细, billing│
│      │              │                                  │
│      │              │  业务背景:                        │
│      │              │  客户账单包含主表和明细表...          │
│      │              │                                  │
│      │              │  核心表:                          │
│      │              │  • ads_bill (账单汇总)             │
│      │              │  • dim_customer (客户维度)         │
│      │              │                                  │
│      │              │  关联路径:                        │
│      │              │  ads_bill → dim_customer ...      │
│      │              │                                  │
│      │              │  查询步骤:                        │
│      │              │  1. 从ads_bill取...               │
│      │              │                                  │
│      │              │  示例SQL:                         │
│      │              │  ┌──────────────────────┐        │
│      │              │  │ SELECT ... FROM ...   │        │
│      │              │  └──────────────────────┘        │
│      │              │                                  │
│      │              │  注意事项 / 常见问题               │
└──────┴──────────────┴──────────────────────────────────┘
```

### 5.2 关键交互

1. **左侧业务域**：自动从技能的 `domain` 字段聚合生成，加"全部"选项
2. **中间技能列表**：显示技能名称、触发关键词标签、启用/禁用开关
3. **右侧编辑器**：结构化表单，每个字段有明确的标签和占位提示。示例SQL 用代码编辑器样式展示
4. **AI 生成对话框**：输入业务域+场景描述 → 生成草稿 → 用户审核修改 → 保存
5. **预览 AI 视角**：保留现有功能，展示 Agent 看到的技能摘要和完整内容

### 5.3 导航变更

- 侧边栏："业务知识" → "查询技能"，图标 🧠 → 🎯
- AppView 类型：`businessKnowledge` → `querySkills`
- 路由前缀：`/api/datasources/:dsId/business-knowledge` → `/api/datasources/:dsId/query-skills`

## 6. 后端 API

### 6.1 CRUD 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/datasources/:dsId/query-skills` | 列出技能（可选 `?domain=xxx` 筛选） |
| GET | `/api/datasources/:dsId/query-skills/:id` | 获取单个技能 |
| POST | `/api/datasources/:dsId/query-skills` | 创建技能 |
| PUT | `/api/datasources/:dsId/query-skills/:id` | 更新技能 |
| DELETE | `/api/datasources/:dsId/query-skills/:id` | 删除技能 |
| PUT | `/api/datasources/:dsId/query-skills/:id/toggle` | 启用/禁用 |
| GET | `/api/datasources/:dsId/query-skills/preview` | 预览 AI 视角 |
| POST | `/api/datasources/:dsId/query-skills/generate` | AI 生成技能 |
| POST | `/api/datasources/:dsId/query-skills/generate-batch` | AI 批量生成技能 |

### 6.2 同步机制

技能 CRUD 后：
1. 调用 `syncQuerySkillSkill(datasourceId)` 同步 SKILL.md 文件
2. 调用 `refreshHarnessesForDatasource(datasourceId)` 刷新活跃会话

## 7. Agent 集成

### 7.1 系统提示更新

修改 `prompt-builder.ts` 中的技能相关指令：

```
当用户提出数据查询问题时，按以下优先级处理：
1. 调用 lookup_semantic_layer 检查是否有预定义指标匹配
   → 命中：使用语义层SQL，可追加WHERE/GROUP BY
   → 未命中：进入步骤2
2. 检查可用技能列表（System Prompt 中的 qs-* 技能摘要）
   → 匹配：调用 read_skill 加载完整攻略，按攻略查询
   → 不匹配：进入步骤3
3. 调用 lookup_examples 查找历史成功查询
   → 命中：参考历史查询生成SQL
   → 未命中：从头使用 discover_schema 生成
```

### 7.2 技能描述格式

System Prompt 中的技能摘要示例：
```
<available_skills>
  <skill>
    <name>qs-abc123</name>
    <description>账单: 客户账单明细查询</description>
    <location>skills/qs-abc123/SKILL.md</location>
  </skill>
  <skill>
    <name>qs-def456</name>
    <description>账单: 账单异常排查</description>
    <location>skills/qs-def456/SKILL.md</location>
  </skill>
</available_skills>
```

### 7.3 read_skill 工具

现有 `read_skill` 工具的加载机制无需修改，`qs-*` 前缀的技能与 `bk-*` 前缀使用相同的加载逻辑。但需更新工具描述文本中的 `bk-` 前缀为 `qs-`，以匹配新的技能命名规则。

## 8. 需要修改的文件

### 后端

| 文件 | 变更 |
|------|------|
| `packages/server/src/types.ts` | 新增 `QuerySkill` 类型，删除 `BusinessKnowledge`/`KnowledgeCategory` 类型 |
| `packages/server/src/store.ts` | 新增 `query_skill` 表初始化和 CRUD 函数，删除 `business_knowledge` 相关函数 |
| `packages/server/src/routes/query-skills.ts` | 新建，替代 `business-knowledge.ts` |
| `packages/server/src/routes/business-knowledge.ts` | 删除 |
| `packages/server/src/agent/knowledge-formatter.ts` | 重写为 `skill-formatter.ts`，适配 `QuerySkill` 类型 |
| `packages/server/src/agent/skill-manager.ts` | 无需修改（已支持任意 SKILL.md） |
| `packages/server/src/agent/prompt-builder.ts` | 更新技能相关指令，`bk-` 前缀改为 `qs-` |
| `packages/server/src/agent/harness-factory.ts` | 无需修改（已支持动态技能加载） |
| `packages/server/src/agent/tools/read-skill.ts` | 更新描述中的 `bk-` 前缀为 `qs-` |
| `packages/server/src/index.ts` | 注册新路由，移除旧路由 |

### 前端

| 文件 | 变更 |
|------|------|
| `packages/web/src/components/BusinessKnowledge/` | 删除整个目录 |
| `packages/web/src/components/QuerySkills/QuerySkillsPage.tsx` | 新建 |
| `packages/web/src/components/QuerySkills/SkillForm.tsx` | 新建 |
| `packages/web/src/components/QuerySkills/AIGenerateDialog.tsx` | 新建 |
| `packages/web/src/api/client.ts` | 新增 `querySkillApi`，删除 `businessKnowledgeApi` |
| `packages/web/src/stores/app.ts` | AppView 类型 `businessKnowledge` → `querySkills` |
| `packages/web/src/App.tsx` | 更新视图渲染和导入 |
| `packages/web/src/components/Sidebar.tsx` | "业务知识" → "查询技能"，图标更新 |
| `packages/web/src/components/Layout.tsx` | 导航项更新 |

## 9. 错误处理

- AI 生成失败：返回错误信息，用户可重试
- SKILL.md 同步失败：记录日志，不影响数据库操作
- 技能内容为空（必填字段缺失）：不生成 SKILL.md，从技能列表中排除
- discover_schema 失败（AI 生成时）：提示用户先确保数据源连接正常

## 10. 测试策略

- **后端单元测试**（Vitest）：store CRUD、SKILL.md 生成/同步、AI 生成接口 mock 测试
- **前端**：手动测试为主（项目无前端单元测试）
- **E2E**（可选）：技能创建 → Agent 使用技能查询的完整流程
