# Text2SQL 数据Agent 功能规划 — 让企业真正用起来

> 核心目标：提升查数准确率、降低用数门槛、释放数据价值

---

## 一、核心问题：为什么企业用不起来？

当前 QueryAgent 的根本问题不是缺功能，而是 **NL→SQL 这条路在企业场景下准确率不够**。

| 问题 | 根因 | 后果 |
|-----|------|------|
| "销售额"查出来不对 | 业务口径与数据库字段脱节，不同部门含义不同 | 用户不信任结果 |
| 复杂多表JOIN失败 | LLM无法从裸Schema推断正确的关联路径 | 只能查简单单表 |
| 业务术语不识别 | "GMV""毛利""环比"无法映射到具体SQL逻辑 | 业务人员用不起来 |
| 查完就结束 | 缺乏下钻、归因、对比等深度分析 | 止步于"看数"，到不了"用数" |
| 问一次错一次 | 没有纠错反馈闭环、没有知识积累 | 准确率无法提升 |

**关键认知转变**：企业要的不是一个"SQL翻译器"，而是一个**数据Agent**——能理解业务、查准数据、主动洞察、持续学习。

---

## 二、功能规划：三大层次 × 六大模块

```
┌─────────────────────────────────────────────────────────┐
│          第三层：智能分析（从"看数"到"用数"）            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ 智能归因  │  │ 智能报告  │  │ 洞察发现与主动推荐   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│          第二层：准确率保障（查得准）                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ 语义层    │  │ 验证纠错  │  │ 知识积累与Few-Shot   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│          第一层：基础设施（查得到）                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ RAG增强   │  │ 多轮对话  │  │ 结果呈现  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

---

## 三、第一层：基础设施（查得到）

### 3.1 RAG增强 — 让Agent找到正确的表和列

**当前问题**：关键词匹配，内存存储，重启丢失

**目标**：向量检索 + 业务元数据增强 + 持久化

#### 3.1.1 向量检索替代关键词匹配

```
当前流程：
  用户问题 "上个月华东区销售额" → 关键词分词 → 匹配表名/列名 → 命中率低

目标流程：
  用户问题 → Embedding → pgvector相似度检索 → Top-K相关表/列 → 命中率高
```

**实现要点**：
- 使用已安装的 pgvector 扩展
- 嵌入模型推荐 BGE-M3（中文优化、可本地部署）或 DeepSeek Embedding
- 检索时同时返回表描述、列描述、业务注释、示例值
- 支持混合检索：向量相似度 + 关键词匹配，加权排序

#### 3.1.2 Schema文档增强 — 比裸DDL强10倍

这是**投入产出比最高**的改进。研究表明，给LLM提供增强的Schema描述，比裸DDL准确率提升20-30%。

**当前Schema Prompt（弱）**：
```
Table: orders
Columns: id (INTEGER), customer_id (INTEGER), amount (DECIMAL), status (VARCHAR), created_at (TIMESTAMP)
```

**增强Schema Prompt（强）**：
```
Table: orders — 订单事实表，记录所有客户订单
Columns:
  - id (INTEGER) — 订单唯一标识，主键
  - customer_id (INTEGER) — 客户ID，关联 customers.id
  - amount (DECIMAL) — 订单金额（单位：元），不含运费
  - status (VARCHAR) — 订单状态，可选值: pending/paid/shipped/completed/cancelled
  - created_at (TIMESTAMP) — 下单时间
Foreign Keys: customer_id → customers.id
Common Queries:
  - "月度销售额" → SELECT DATE_TRUNC('month', created_at), SUM(amount) FROM orders WHERE status='completed' GROUP BY 1
  - "各状态订单数" → SELECT status, COUNT(*) FROM orders GROUP BY status
```

**增强项清单**：

| 增强项 | 当前 | 目标 | 准确率贡献 |
|-------|------|------|----------|
| 表描述/业务含义 | ❌ 仅表名 | ✅ 自然语言描述 | ⭐⭐⭐⭐⭐ |
| 列描述/业务语义 | ✅ 有annotation（手动） | ✅ 自动+手动 | ⭐⭐⭐⭐⭐ |
| 外键关系/JOIN路径 | ❌ 无 | ✅ 明确标注 | ⭐⭐⭐⭐⭐ |
| 列值域/枚举值 | ❌ 无 | ✅ 列出常见值 | ⭐⭐⭐⭐ |
| 常见查询示例 | ❌ 无 | ✅ 每表2-3个 | ⭐⭐⭐⭐ |
| 列间关系说明 | ❌ 无 | ✅ 如"amount不含运费" | ⭐⭐⭐ |

#### 3.1.3 AI自动生成Schema注释

当前 `ai-suggest` 接口是空占位符。这是让系统自举的关键功能。

**实现方案**：
```
1. 获取表的DDL + 样本数据（5-10行）
2. 调用LLM生成：
   - 表的业务描述
   - 每列的业务含义
   - 列值域推断（枚举值、数值范围）
   - 推断的外键关系
3. 人工确认或修改
4. 确认后写入column_annotations + schema文档
```

**Prompt示例**：
```
你是一个数据架构师。请分析以下表结构，生成业务语义注释。

表名: {table_name}
DDL: {ddl}
样本数据:
{sample_rows}

请输出JSON:
{
  "table_description": "该表的业务描述",
  "columns": [
    {
      "name": "column_name",
      "business_semantics": "该列的业务含义",
      "value_domain": "可选值或范围",
      "is_identifier": true/false
    }
  ],
  "inferred_foreign_keys": [
    {"column": "xxx", "references": "table.column"}
  ]
}
```

#### 3.1.4 增量同步

当前每次 sync-schema 是全量重建。改为增量：
- 记录上次同步时间
- 仅同步新增/变更的表
- 保留已确认的注释，不覆盖

---

### 3.2 多轮对话 — 让复杂问题能问出来

**当前问题**：对话有上下文但Agent不理解"追问"

**企业真实场景**：
```
用户: 华东区上个月销售额多少？
Agent: 华东区2025年5月销售额为1,234万元。

用户: 和去年同期比呢？          ← 追问，需要继承"华东区""销售额"
Agent: 同比增长15.3%。          ← 需要理解是"华东区销售额同比"

用户: 主要贡献来自哪个城市？    ← 下钻，需要继承维度
Agent: 贡献最大的是上海，占华东区42%。

用户: 为什么上海增长这么快？    ← 归因，需要主动分析
Agent: 主要因为...新品上线+渠道扩张...  ← 需要深度分析能力
```

**需要的改进**：

| 能力 | 当前 | 目标 | 实现 |
|-----|------|------|------|
| 指代消解 | ❌ 无 | ✅ "它""这个"指代上文实体 | LLM上下文 + 意图分类增强 |
| 追问识别 | ❌ 无法区分新问题vs追问 | ✅ 分类为new_query/follow_up/refine | 意图分类器增加追问类型 |
| SQL继承 | ❌ 每次重新生成 | ✅ 在上轮SQL基础上修改 | 提供上轮SQL作为上下文 |
| 下钻/上卷 | ❌ 无 | ✅ 维度层级感知 | 语义层提供维度层级 |

**追问类型与处理策略**：

```python
INTENT_TYPES = {
    "new_query": "全新问题，独立生成SQL",
    "refine": "修改上轮查询条件（时间范围、筛选条件等）",
    "drill_down": "下钻到更细维度",
    "roll_up": "上卷到更粗维度",
    "compare": "对比（同比、环比、分组对比）",
    "explain": "解释结果/归因分析",
    "chat": "闲聊/非数据问题"
}
```

---

### 3.3 结果呈现 — 让数据看得懂

**当前**：表格 + 图表，基本可用

**需要增强**：

| 功能 | 说明 | 优先级 |
|-----|------|-------|
| **自然语言总结** | Agent用文字总结查询结果关键发现 | 🔴 高 |
| **趋势标注** | 自动标注同比/环比变化 | 🔴 高 |
| **异常高亮** | 结果中的异常值自动标红 | 🟡 中 |
| **多图联动** | 表格+图表+文字联动展示 | 🟡 中 |
| **结果解释** | "这个数字是怎么算出来的" | 🟡 中 |

**自然语言总结示例**：
```
查询: 华东区各城市2025年5月销售额

表格结果:
  上海 518万  同比+23%
  杭州 312万  同比+8%
  南京 198万  同比-5%
  ...

Agent总结:
  华东区5月总销售额1,234万元，同比增长15.3%。
  上海贡献最大（42%），同比增长23%是主要驱动力。
  南京出现5%下滑，值得关注。
```

---

## 四、第二层：准确率保障（查得准）

### 4.1 语义层/指标层 — 准确率的根本解决方案 🔴🔴🔴

**这是最重要的功能。** 行业共识：直接NL→SQL在企业场景下准确率天花板约60-70%，引入语义层可提升到95%+。

#### 4.1.1 为什么需要语义层

```
❌ 当前路径: NL → SQL（直接映射到裸表，LLM猜逻辑）
   问题: "销售额"到底查哪张表？哪些状态算？包不包含运费？退单怎么算？

✅ 语义层路径: NL → 指标意图 → 语义层生成SQL（确定性映射）
   优势: "销售额"= orders表 + status='completed' + SUM(amount)，口径唯一
```

**行业验证**：
- **Aloudata**: NL→MQL→SQL，语义层保证100%指标准确
- **衡石ChatBI**: NL→HQL→SQL，四层安全架构，指标口径统一
- **Kyligence**: 统一语义层+指标平台，避免SQL幻觉
- **Snowflake**: Agentic Semantic Model，语义模型驱动的Text2SQL

#### 4.1.2 语义层核心概念

```
┌─────────────────────────────────────────────┐
│                  语义层                       │
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  指标    │  │  维度    │  │ 关系模型 │    │
│  │ Metrics  │  │Dimensions│  │  Model   │    │
│  └─────────┘  └─────────┘  └─────────┘    │
│                                             │
│  指标: 销售额 = SUM(orders.amount)           │
│        WHERE orders.status = 'completed'     │
│  维度: 城市 → customers.city                  │
│        月份 → DATE_TRUNC('month', created_at) │
│  关系: orders.customer_id → customers.id      │
└─────────────────────────────────────────────┘
         ↓ 语义层生成SQL
  SELECT c.city, SUM(o.amount)
  FROM orders o JOIN customers c ON o.customer_id = c.id
  WHERE o.status = 'completed'
    AND DATE_TRUNC('month', o.created_at) = '2025-05-01'
  GROUP BY c.city
```

#### 4.1.3 语义层数据模型设计

```sql
-- 指标定义
semantic_metrics (
    id, datasource_id,
    name,              -- 内部标识: gmv
    display_name,      -- 展示名: 商品交易总额
    description,       -- 业务含义: 所有已完成订单的金额总和
    sql_expression,    -- 计算逻辑: SUM(orders.amount)
    filters,           -- 固定过滤: {"status": "completed"}
    dimensions,        -- 可分析维度: [city, month, category]
    default_granularity, -- 默认粒度: month
    unit,              -- 单位: 元
    category,          -- 分类: 财务指标
    aliases,           -- 别名列表: ["成交额","交易额","GMV"]
    created_at, updated_at
)

-- 维度定义
semantic_dimensions (
    id, datasource_id,
    name,              -- 内部标识: city
    display_name,      -- 展示名: 城市
    sql_expression,    -- SQL映射: customers.city
    data_type,         -- 类型: string
    hierarchy,         -- 层级: {"region": "大区", "province": "省", "city": "城市"}
    values,            -- 常见值: ["上海","北京","深圳"]
    created_at, updated_at
)

-- 关系模型（逻辑数据模型）
semantic_models (
    id, datasource_id,
    name,              -- 模型名: 订单分析模型
    description,       -- 描述
    base_table,        -- 主表: orders
    joins,             -- 关联: [{"table": "customers", "on": "orders.customer_id = customers.id", "type": "left"}]
    metrics,           -- 包含的指标: [gmv, order_count]
    dimensions,        -- 包含的维度: [city, month, category]
    created_at, updated_at
)
```

#### 4.1.4 Agent流程改造

```
当前流程:
  用户问题 → classify_intent → generate_sql → validate → execute → suggest_chart

改造后流程:
  用户问题
    ↓
  classify_intent (增加指标识别)
    ↓
  ┌─ 命中语义层指标 ─→ 语义层生成SQL（确定性，100%准确）
  │                    ↓
  │              validate → execute → suggest_chart
  │
  └─ 未命中（ad-hoc查询）─→ LLM生成SQL（概率性，需验证）
                           ↓
                     generate_sql → verify → correct → execute
```

**关键逻辑**：优先走语义层，兜底走NL→SQL。语义层命中的查询准确率接近100%。

#### 4.1.5 指标管理UI

```
┌─────────────────────────────────────────────────┐
│  指标管理                                        │
├─────────────────────────────────────────────────┤
│  [+ 新建指标] [AI推荐指标] [导入指标]             │
│                                                 │
│  📊 财务指标 (5)                                │
│    ├─ 销售额 (GMV)    ✅ 已发布                  │
│    ├─ 毛利率          ✅ 已发布                   │
│    ├─ 净利润          🔄 草稿                    │
│    └─ ...                                       │
│  📊 运营指标 (8)                                │
│    ├─ 订单量          ✅ 已发布                   │
│    ├─ 客单价          ✅ 已发布                   │
│    └─ ...                                       │
│                                                 │
│  ── 指标详情: 销售额 (GMV) ──                    │
│  展示名: 商品交易总额                             │
│  业务含义: 所有已完成订单的金额总和                 │
│  计算逻辑: SUM(orders.amount)                    │
│  过滤条件: orders.status = 'completed'            │
│  可分析维度: 城市 / 月份 / 品类 / 渠道             │
│  别名: 成交额, 交易额, GMV, revenue              │
│  来源模型: 订单分析模型                           │
│                                                 │
│  [测试查询] [编辑] [版本历史]                     │
└─────────────────────────────────────────────────┘
```

#### 4.1.6 AI辅助构建语义层

这是让语义层落地的关键——不能要求用户手动配置一切。

```
自动发现流程:
1. 分析表结构 → 推断事实表/维度表
2. 分析外键 → 推断JOIN关系
3. 分析列名/样本数据 → 推断指标和维度
4. 生成推荐的语义层配置
5. 用户确认/修改 → 发布

Prompt示例:
  你是一个数据架构师。请分析以下数据库schema，推荐语义层配置。
  
  表结构:
  {schema_info}
  
  样本数据:
  {sample_data}
  
  请推荐:
  1. 哪些是事实表，哪些是维度表
  2. 推荐定义哪些指标（含计算逻辑和过滤条件）
  3. 推荐定义哪些维度（含层级关系）
  4. 推荐的逻辑数据模型（表关联关系）
```

---

### 4.2 验证纠错 — 让错误的SQL能自动修复

**当前**：validate_sql只检查SELECT + 禁止关键词 + 注入LIMIT

**需要增强为三阶段验证**：

```
Stage 1: 静态检查（<100ms，确定性）
├── AST语法校验
├── 表名/列名是否存在（对照schema）
├── 类型兼容性检查
├── 禁止语句检查（已有）
└── 必要过滤条件检查（大表必须有WHERE）

Stage 2: 语义检查（<1s，半确定性）
├── JOIN路径是否正确（对照外键/语义层）
├── 聚合函数是否合理
├── GROUP BY是否完整
└── 子查询是否必要

Stage 3: 执行探测（<5s，经验性）
├── 先执行 LIMIT 10 探测
├── 检查结果列数/行数是否合理
├── 检查是否有NULL/异常值
├── 执行 EXPLAIN 检查扫描行数
└── 成本超阈值 → 提示用户确认
```

**自动纠错流程**：

```python
async def generate_and_verify(question, schema_context):
    max_retries = 3
    
    for attempt in range(max_retries):
        # 1. 生成SQL
        sql = await generate_sql(question, schema_context)
        
        # 2. 静态检查
        static_result = static_validate(sql)
        if not static_result.passed:
            sql = auto_fix(sql, static_result.errors)
            continue
        
        # 3. 执行探测
        probe_result = await probe_execute(sql, limit=10)
        if probe_result.is_empty:
            # 结果为空，可能是条件太严
            sql = await correct_sql(sql, "查询结果为空，请检查过滤条件", probe_result)
            continue
        
        if probe_result.cost_too_high:
            # 成本过高，提示确认
            return {"sql": sql, "needs_confirmation": True, "estimated_rows": probe_result.estimated_rows}
        
        # 4. 通过验证
        return {"sql": sql, "verified": True}
    
    # 重试耗尽，返回最佳结果 + 警告
    return {"sql": sql, "verified": False, "warning": "自动验证未通过，请人工检查"}
```

---

### 4.3 知识积累与Few-Shot — 让系统越用越准

**核心思路**：每次成功的查询都是学习材料，系统准确率随使用量增长。

#### 4.3.1 Few-Shot示例库

```sql
-- 已有查询模板表可扩展
query_examples (
    id, datasource_id,
    question,          -- 自然语言问题
    sql,               -- 对应SQL
    tables_used,       -- 涉及的表
    difficulty,        -- 难度: simple/medium/complex
    success_count,     -- 成功执行次数
    is_verified,       -- 是否人工验证
    embedding,         -- 问题向量（用于检索）
    created_at
)
```

**检索策略**：
```
1. 用户提问 → 计算embedding
2. 向量检索Top-3相似问题 → 作为Few-Shot示例注入Prompt
3. 示例选择优先级:
   - 语义相似度 > 0.8
   - 已验证示例优先
   - 高成功率示例优先
   - 覆盖不同SQL模式（单表/多表JOIN/聚合/窗口函数）
```

#### 4.3.2 自动积累机制

```
查询执行成功
  ↓
结果非空 + 用户未反馈错误
  ↓
自动保存到query_examples
  ↓
标记 is_verified = false（待人工确认）

人工确认后
  ↓
is_verified = true → 作为高质量Few-Shot示例
```

#### 4.3.3 用户反馈闭环

```
┌─────────────────────────────────────┐
│  查询结果                           │
│                                     │
│  上海  518万  同比+23%              │
│  杭州  312万  同比+8%               │
│                                     │
│  这个结果对吗？  👍 准确  👎 不准确   │
│                                     │
│  [👎 不准确] → 请问哪里不对？        │
│    ○ 表不对  ○ 字段不对              │
│    ○ 条件不对  ○ 数值不对             │
│    ○ 其他: ________                  │
└─────────────────────────────────────┘
```

反馈数据用于：
1. 标记错误SQL → 排除出Few-Shot库
2. 收集正确SQL → 加入Few-Shot库
3. 识别高频失败模式 → 优化Prompt/语义层

---

## 五、第三层：智能分析（从"看数"到"用数"）

### 5.1 智能归因 — 告诉用户"为什么"

**企业痛点**：看到数据变化，不知道原因。

```
用户: 为什么华东区销售额下降了？
  
Agent归因分析流程:
  1. 确认事实: 华东区5月销售额环比下降12%
  2. 维度拆解:
     - 按城市: 上海-5%, 杭州-18%, 南京-22%  ← 南京大幅下滑
     - 按品类: 3C-3%, 服装-15%, 食品-8%     ← 服装拖累最大
     - 按渠道: 线上-2%, 线下-20%             ← 线下下滑严重
  3. 交叉定位: 南京线下服装 → 下降35%，是主要贡献因素
  4. 生成结论:
     "华东区销售额下降12%，主要受南京线下服装渠道拖累（-35%）。
      可能原因: 南京新开竞品门店分流客户。建议关注南京线下渠道策略。"
```

**实现要点**：
- 依赖语义层的维度层级和指标定义
- 自动进行多维下钻拆解
- 识别最大变化贡献因子
- 生成自然语言分析结论

### 5.2 智能报告 — 自动生成分析报告

```
用户: 帮我生成一份5月销售月报

Agent自动编排:
  1. 整体概览: 总销售额、环比、同比
  2. 分维度分析: 按区域、品类、渠道
  3. 趋势分析: 近6个月趋势
  4. 异常发现: 下降最大的区域/品类
  5. 归因分析: 变化主要原因
  6. 行动建议: 基于数据的建议

输出: 含图表+文字的分析报告（可导出PDF）
```

### 5.3 洞察发现与主动推荐

**从被动回答升级为主动推送**：

```
场景1 - 异常告警:
  系统检测到"南京线下服装销售额"环比下降35%
  → 主动推送给相关业务人员

场景2 - 关联发现:
  用户查"销售额"时，系统发现"库存周转率"同步下降
  → 建议"是否需要查看库存情况？"

场景3 - 周期性推荐:
  每周一自动推送"上周核心指标变化"摘要
```

---

## 六、其他实用功能

### 6.1 数据字典 — 让所有人理解数据

```
┌─────────────────────────────────────────────────────┐
│  数据字典                                           │
├─────────────────────────────────────────────────────┤
│  🔍 搜索: "销售额"                                  │
│                                                     │
│  📊 指标                                            │
│    销售额 (GMV) — 所有已完成订单金额总和             │
│      计算逻辑: SUM(orders.amount) WHERE completed    │
│      数据源: 销售数据库                              │
│      更新频率: 实时                                  │
│                                                     │
│  📋 表                                              │
│    orders — 订单事实表                               │
│      包含字段: id, customer_id, amount, status...    │
│                                                     │
│  📝 术语                                            │
│    GMV → 同"销售额"，见指标定义                      │
│    客单价 → 平均每单金额，= 销售额/订单量            │
└─────────────────────────────────────────────────────┘
```

### 6.2 查询收藏与分享

- **收藏**: 常用查询一键收藏，快速重跑
- **分享**: 生成分享链接，他人可直接查看结果
- **嵌入**: 生成iframe代码，嵌入到其他系统

### 6.3 定时查询与报告

- 配置定时任务：每天/每周/每月自动执行
- 结果推送：邮件/IM/飞书/钉钉
- 异常检测：结果超出阈值自动告警

### 6.4 数据导出增强

- 当前仅PDF，增加CSV/Excel导出
- 导出含SQL+结果+图表+分析结论
- 批量导出：一次导出多个查询结果

---

## 七、实施优先级

### 🔴 P0 — 不做就没法用（2-3周）

| 功能 | 工期 | 理由 |
|-----|------|------|
| **RAG向量检索** | 3天 | 当前关键词匹配太弱，找不到正确的表 |
| **Schema文档增强** | 3天 | 投入产出比最高的准确率提升手段 |
| **AI自动生成注释** | 3天 | 让系统能自举，减少人工配置 |
| **自然语言结果总结** | 2天 | 当前只有冷冰冰的表格，用户看不懂 |
| **验证纠错增强** | 3天 | 当前验证太弱，错误SQL直接执行 |

**预期效果**：准确率从当前 ~50-60% 提升到 ~70-75%

### 🟡 P1 — 做了才真正好用（3-4周）

| 功能 | 工期 | 理由 |
|-----|------|------|
| **语义层/指标层** | 2周 | 准确率的根本解决方案，从70%→95% |
| **多轮对话增强** | 1周 | 企业复杂问题需要追问 |
| **Few-Shot知识积累** | 3天 | 越用越准 |
| **用户反馈闭环** | 2天 | 数据驱动的准确率提升 |

**预期效果**：准确率提升到 ~85-95%，用户满意度大幅提升

### 🟢 P2 — 做了拉开差距（2-3周）

| 功能 | 工期 | 理由 |
|-----|------|------|
| **智能归因** | 1周 | 从"看数"到"用数"的关键跨越 |
| **智能报告** | 1周 | 企业高频需求 |
| **数据字典** | 3天 | 降低数据理解门槛 |
| **定时查询/告警** | 3天 | 从被动变主动 |

---

## 八、关键指标衡量

| 指标 | 当前 | P0目标 | P1目标 | P2目标 |
|-----|------|-------|-------|-------|
| SQL生成准确率 | ~55% | ~72% | ~90% | ~93% |
| 复杂查询成功率(多表JOIN) | ~30% | ~55% | ~80% | ~85% |
| 业务指标查询准确率 | ~40% | ~65% | ~95% | ~98% |
| 用户首次查询成功率 | ~50% | ~65% | ~80% | ~85% |
| 多轮对话完成率 | ~40% | ~55% | ~75% | ~80% |
| 用户主动使用率(日活/总用户) | - | >30% | >50% | >65% |

**准确率衡量方法**：
- Execution Accuracy (EX): 生成SQL执行结果与标准结果一致
- Semantic Accuracy: 结果语义正确（数值合理、方向正确）
- User Satisfaction: 用户反馈"准确"的比例

---

## 九、总结

### 一句话

**直接NL→SQL是概率游戏，语义层+验证纠错+知识积累才能变成工程科学。**

### 核心洞察

1. **语义层是准确率的根本** — Aloudata、衡石、Kyligence的行业实践证明，指标语义层能把准确率从60%拉到95%+
2. **Schema增强是性价比之王** — 给LLM提供好的上下文比换更大的模型更有效
3. **知识积累是护城河** — 系统越用越准，竞争对手无法复制
4. **从"看数"到"用数"是价值跃迁** — 归因分析、智能报告才是企业真正需要的

### 实施路径

```
Week 1-3:  RAG增强 + Schema增强 + AI注释 + 结果总结 + 验证纠错
           ↓ 准确率 ~55% → ~72%
           
Week 4-7:  语义层 + 多轮对话 + Few-Shot + 反馈闭环
           ↓ 准确率 ~72% → ~90%
           
Week 8-10: 智能归因 + 智能报告 + 数据字典 + 定时查询
           ↓ 从"看数"到"用数"
```

---

## 参考资料

1. [Text2SQL Accuracy Best Practices - AI2SQL](https://builder.ai2sql.io/blog/text2sql-accuracy-best-practices)
2. [Enterprise Text-to-SQL Accuracy Benchmarks - Promethium](https://promethium.ai/guides/enterprise-text-to-sql-accuracy-benchmarks-2)
3. [Improving Text-to-SQL Accuracy with Schema-Aware Reasoning](https://pub.towardsai.net/improving-text-to-sql-accuracy-with-schema-aware-reasoning-528eadfdc99b)
4. [AWS Best Practices for Text2SQL](https://aws.amazon.com/blogs/machine-learning/generating-value-from-enterprise-data-best-practices-for-text2sql-and-generative-ai)
5. [Oracle Best Practices for Enriching Schema](https://docs.oracle.com/en/database/oracle/oracle-database/26/aienb/best-practices-enriching-your-database-schema.html)
6. [Snowflake Agentic Semantic Model](https://www.snowflake.com/en/blog/engineering/agentic-semantic-model-text-to-sql)
7. [Aloudata: 智能问数Agent如何确保SQL生成100%准确](https://aloudata.com/blogs/data-agent-accurate-sql-generation)
8. [衡石语义建模引擎](https://www.hengshi.com/blog/1398.html)
9. [Aloudata: 从ChatBI到分析型Agent升级路线](https://aloudata.com/resources/guides/ai-data-intelligence/from-chatbi-to-analytical-agent-digital-worker-upgrade-guide)
10. [Text2SQL-Flow: SQL-Aware Data Augmentation](https://arxiv.org/html/2511.10192v3)
11. [SC-Prompt: Structure and Content Prompting](https://nantang.github.io/research/pubs/scprompt.pdf)
12. [Google Cloud: Techniques for Improving Text-to-SQL](https://cloud.google.com/blog/products/databases/techniques-for-improving-text-to-sql)
