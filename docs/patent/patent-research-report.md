# DataNova 智能问数Agent — 专利创新点调研报告

> 调研日期：2026年7月1日  
> 项目：DataNova AI-Powered SQL Query Assistant  
> 版本：v1.0

---

## 目录

1. [项目技术概览](#1-项目技术概览)
2. [已有相关专利全景](#2-已有相关专利全景)
3. [创新点深度分析](#3-创新点深度分析)
4. [专利申请策略建议](#4-专利申请策略建议)
5. [风险评估与规避设计](#5-风险评估与规避设计)
6. [附录：专利检索清单](#6-附录专利检索清单)

---

## 1. 项目技术概览

DataNova 是一个基于大语言模型（LLM）的智能问数Agent系统，核心技术架构如下：

| 技术模块 | 核心能力 |
|---------|---------|
| **Agent多轮工具调用** | 基于AgentHarness实现多轮ReAct式推理，自动编排discover_schema → execute_sql工具链 |
| **语义层+确定性SQL构建** | 业务指标/维度/模型定义 → `buildSemanticSql()`确定性生成SQL，LLM仅做意图分解 |
| **查询反馈闭环** | 用户👍👎反馈 → 结构化存储 → 影响few-shot示例检索 → 优化后续查询 |
| **Schema自动发现+AI标注** | discover_schema工具 + ai_annotate_schema工具，自动生成业务语义注释 |
| **SQL安全验证管道** | SQL白名单 → schema缓存表名校验 → 只读/超时/行数限制 |
| **查询历史全量记录** | 每次SQL执行自动记录，作为few-shot检索源 |
| **定时查询+智能告警** | Cron调度 + 告警条件检测 |
| **多数据源管理** | 统一接口 + AES-256-GCM密码加密 |

---

## 2. 已有相关专利全景

### 2.1 中国专利（CNIPA）— NL2SQL核心专利

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| CN114547329A | 预训练语言模型、语义解析方法及装置 | 阿里巴巴 | 2022-01 | 预训练模型做语义解析 | ⭐⭐⭐⭐⭐ |
| CN120123356A | 结构化查询语言的生成方法、系统和电子设备 | 阿里云飞天 | 2023-12 | NL→SQL全链路（PolarDB产品化） | ⭐⭐⭐⭐⭐ |
| CN120045576A | 自然语言转结构化查询语言的方法以及装置 | **华为云计算** | 2023-12 | **利用历史SQL候选集辅助生成** | ⭐⭐⭐⭐⭐ |
| CN116821168B | 一种改进的基于生成式大语言模型的NL2SQL方法 | 吉奥时空 | 2022 | 生成式LLM将自然语言直接映射为SQL | ⭐⭐⭐⭐ |
| CN117453717B | 一种数据查询语句生成方法、装置、设备及存储介质 | 星环信息科技 | 2023-11 | 数据查询语句生成 | ⭐⭐⭐⭐ |
| CN118227655A | 数据库查询语句的生成方法、装置、设备及存储介质 | 腾讯科技 | 2024-05 | 面向企业数据库的NL→SQL全链路自动化 | ⭐⭐⭐⭐ |
| CN118093634A | 自动生成SQL和问题回复的方法及系统 | 浩鲸云计算 | 2024-04 | SQL自动生成+回复 | ⭐⭐⭐ |
| CN117251455A | 基于大模型的智能报表生成方法及其系统 | 中信百信银行 | 2023-11 | 大模型智能报表 | ⭐⭐⭐ |
| CN117931983A | 利用大模型生成准确回答的方法及系统 | 中国科学技术大学 | 2024-01 | 大模型生成准确回答 | ⭐⭐⭐ |
| CN118377858B | 基于语言模型的数据查询提示构建方法 | 上海迪爱斯信息 | 2024-02 | Prompt构建优化 | ⭐⭐⭐ |
| CN110688394A | NL生成的SQL方法 | 浙江大学 | 2019-09 | 早期NL2SQL方法 | ⭐⭐⭐ |
| CN111324631A | 从自然语言自动生成SQL | 成都海天数联 | 2020-03 | NL→SQL自动生成 | ⭐⭐⭐ |
| CN111813802A | 基于自然语言生成结构化查询语句的方法 | 杭州量之智能 | 2020-09 | NL→SQL生成 | ⭐⭐⭐⭐ |
| CN113111158A | 面向智能数据可视化的对话式问答实现方法 | 杭州电子科技大学 | 2021-04 | 对话式数据可视化 | ⭐⭐⭐⭐ |
| CN115658729A | 基于预训练模型的自然语言转SQL语句的方法 | 广东工业大学 | 2022-11 | 预训练模型NL→SQL | ⭐⭐⭐⭐ |

> ⚠️ **特别关注**：华为云 CN120045576A 利用历史SQL候选集辅助生成，与DataNova的`lookup_examples`工具（搜索历史成功查询作为few-shot examples）**技术方案高度一致**，需重点关注。

### 2.2 美国专利（USPTO）— NL2SQL核心专利

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| US11520815B1 | Database query generation using natural language text | **Dsilo, Inc.（已被Snowflake收购）** | 2021-07 | NL→SQL完整流程 | ⭐⭐⭐⭐⭐ |
| US12141181B2 | Database query generation using natural language text (continuation) | Dsilo/Snowflake | 2021-07 | NL→SQL延续案 | ⭐⭐⭐⭐⭐ |
| US11520785B2 | Query classification alteration based on user input | Salesforce.com | 2019-09 | 查询分类改写 | ⭐⭐⭐⭐ |
| US11880658B2 | NL interface to data stores using deep learning | JPMorgan Chase | 2019-03 | 基于深度学习的NL数据接口 | ⭐⭐⭐⭐ |
| US11163760B2 | Data query service based on natural language request | Mastercard | 2019-12 | 基于NL请求数据查询服务 | ⭐⭐⭐ |
| US11604790B2 | Conversational interface for NL queries on relational database | Unscrambl Inc | 2020-08 | **对话式NL查询接口** | ⭐⭐⭐⭐⭐ |
| US11360969B2 | NL based processing of data stored across heterogeneous data sources | Promethium | 2019-03 | 异构数据源NL处理 | ⭐⭐⭐⭐ |
| US10990612B2 | Metric-centric transformations of multidimensional database data | Microsoft | 2018-12 | 指标中心多维数据转换 | ⭐⭐⭐ |
| US20240242154A1 | Generative Business Intelligence | — | ~2023 | 生成式BI | ⭐⭐⭐⭐ |

> ⚠️ **特别关注**：Dsilo/Snowflake US11520815B1 是最直接的美国核心专利，覆盖"使用自然语言文本生成数据库查询"的完整流程。Dsilo已被Snowflake收购，说明大厂高度重视此专利。DataNova的核心功能可能落入其权利要求范围。

### 2.3 ThoughtSpot专利群 — NL→查询语法映射

ThoughtSpot 是NL2SQL领域专利布局最密集的公司，拥有围绕"自然语言→关系型搜索"的完整专利族：

| 专利号 | 专利名称 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|---------|---------|-------------|
| US11442932B2 | Mapping natural language to queries using a query grammar | 2019-07 | NL映射到查询语法 | ⭐⭐⭐⭐⭐ |
| US11928114B2 | Query generation based on a logical data model with one-to-one joins | 2019-04 | 基于逻辑数据模型的查询生成 | ⭐⭐⭐⭐⭐ |
| US11409744B2 | Query generation based on merger of subqueries | 2019-08 | 基于子查询合并的查询生成 | ⭐⭐⭐⭐ |
| US11544272B2 | Phrase translation for a low-latency database analysis system | 2020-04 | 短语翻译（低延迟） | ⭐⭐⭐⭐ |
| US11200227B1 | Lossless switching between search grammars | 2019-07 | 搜索语法无损切换 | ⭐⭐⭐⭐ |
| US11379495B2 | Search guidance | 2020-05 | 搜索引导 | ⭐⭐⭐ |
| US11354326B2 | Object indexing | 2019-07 | 对象索引 | ⭐⭐⭐ |
| US11586620B2 | Object scriptability | 2019-07 | 对象可脚本化 | ⭐⭐⭐ |
| US10970319B2 | Phrase indexing | 2019-07 | 短语索引 | ⭐⭐⭐ |

> ⚠️ **特别关注**：ThoughtSpot US11442932B2 "Mapping natural language to queries using a query grammar" 与DataNova的语义层+确定性SQL构建方案理念相似。但ThoughtSpot基于专利关系搜索引擎，DataNova基于LLM Agent意图分解+语义层确定性构建，技术路线有本质差异。

### 2.4 Tableau/Salesforce专利群 — 可视化NL交互

| 专利号 | 专利名称 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|---------|---------|-------------|
| US11698933B1 | Using dynamic entity search during entry of NL commands for visual data analysis | 2020-09 | NL命令动态实体搜索 | ⭐⭐⭐⭐ |
| US11301631B1 | Visually correlating individual terms in NL input to respective structured phrases | 2020-10 | NL输入与结构化短语视觉关联 | ⭐⭐⭐⭐ |
| US11455339B1 | Incremental updates to NL expressions in a data visualization UI | 2019-09 | NL表达式增量更新 | ⭐⭐⭐⭐ |
| US11615249B2 | Multitask learning as question answering | 2018-02 | 多任务学习问答 | ⭐⭐⭐ |

### 2.5 国际专利（WIPO/PCT）

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| WO2021132760A1 | Method of predicting columns and tables used when translating SQL from NL on basis of neural network | 浦项工业大学 | 2019-12 | 基于神经网络预测NL→SQL中的列和表 | ⭐⭐⭐⭐⭐ |
| KR102345568B1 | Semantic linking of NL words with columns and tables in databases | 浦项工业大学 | 2019-12 | NL词语与数据库列/表的语义链接 | ⭐⭐⭐⭐⭐ |
| EP3719672A1 | Search engine for information retrieval system | ThoughtSpot | ~2019 | 信息检索搜索引擎 | ⭐⭐⭐⭐ |

### 2.6 语义层 / 确定性SQL构建专利

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| US5,555,403 | Relational Database Access System Using Semantically Dynamic Objects | Business Objects | 1991 | **语义层原始专利** — "Universe"映射表/列到业务维度/度量 | **极高**（已过期） |
| — | LookML相关专利 | Google/Looker | 2012+ | 声明式建模语言定义维度/度量/连接，确定性SQL生成 | **极高** |
| — | dbt Semantic Layer / MetricFlow | dbt Labs | 2023+ | 指标/维度/实体本体论 + 确定性SQL编译 | **高** |

> **关键发现**：语义层概念最早由Business Objects于1991年申请专利（US5,555,403，已过期），后续Looker的LookML和dbt的MetricFlow延续了"确定性SQL生成"的思路，但DataNova的**Agent+语义层融合**方案（LLM做意图分解→语义层做确定性SQL构建）在现有专利中尚未发现直接对应。

### 2.7 AI Schema标注 / 数据字典自动生成专利

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| US12547837B2 | AI-based metadata semantic enrichment | 未指定 | 近期 | AI元数据语义增强，自动生成数据字典 | **高** |
| CN117371406A | 基于大型语言模型的注释生成方法、装置、设备及介质 | 星环信息科技 | 2023-10 | LLM生成Schema注释 | **高** |

### 2.8 查询反馈 / 强化学习优化专利

| 专利号 | 专利名称 | 申请人 | 优先权日 | 核心技术 | 与本项目关联度 |
|--------|---------|--------|---------|---------|-------------|
| CN114780577B | 含噪NL2SQL方法 | 未指定 | 2020 | 噪声数据处理 | **中** |
| CN114942937B | 主动学习数据匹配方法 | 未指定 | 2022 | 主动学习+用户反馈 | **高** |
| US20230097443A1 | One-shot learning for text-to-SQL | 未指定 | 2023 | 单样本学习Text-to-SQL | **中** |
| US11995073B2 | One-shot learning for text-to-SQL | 未指定 | 2024 | 单样本学习SQL生成 | **中** |
| US12541509B2 | Clause-wise text-to-SQL generation | 未指定 | 2026 | 按子句生成SQL | **中** |
| — | SkyRL-SQL系统 | 学术研究 | 2025 | 多轮RL框架，执行准确率提升9.2% | **中** |

> **关键发现**：现有反馈闭环专利主要集中在RLHF/强化学习方向，DataNova的**结构化反馈→few-shot检索优化**方案（非模型微调，而是检索策略优化）在专利检索中未发现直接对应。但华为云CN120045576A利用历史SQL候选集辅助生成的方案与`lookup_examples`高度相似，需关注。

### 2.9 SQL安全验证专利

| 专利/方案 | 描述 | 与本项目关联度 |
|----------|------|-------------|
| Thales sql-data-guard | LLM生成SQL的安全防护层 | **高** |
| Atlas SQL Validation Pipeline | 7层SQL验证管道 | **高** |
| OWASP SQL注入防护 | 通用SQL安全最佳实践 | **低** |

### 2.10 AI Agent编排专利

| 专利/方案 | 描述 | 与本项目关联度 |
|----------|------|-------------|
| ReAct框架（Yao et al. 2023） | 推理+行动交替的多轮Agent框架 | **高** |
| Gradientsys Multi-Agent Scheduler | LLM驱动的多Agent调度器 | **中** |
| Microsoft Agent Framework | 多Agent工作流编排 | **中** |
| OpenAI AgentKit | Agent工具调用框架 | **中** |

### 2.11 行业生态 — 主要厂商产品化现状

| 厂商 | 产品/功能 | 技术路线 | 专利情况 |
|------|----------|---------|---------|
| **阿里云** | PolarDB LLM-based NL2SQL | Schema向量化 + LLM生成SQL + 配置表微调 | 有中国专利 |
| **华为云** | Chat2DB / AI2SQL | 历史SQL候选集 + LLM生成 | 有中国专利（CN120045576A） |
| **腾讯音乐** | SuperSonic (开源) | Chat BI + Headless BI + 语义层 | 开源，专利情况未知 |
| **ThoughtSpot** | ThoughtSpot Sage | 专利搜索引擎 + LLM | 9+项美国专利 |
| **Salesforce/Tableau** | Tableau GPT / Pulse | Einstein LLM + Slack集成 | 有美国专利 |
| **Microsoft** | Power BI Copilot / Fabric | Azure OpenAI + DAX生成 | 有相关专利 |
| **Oracle** | Select AI on Autonomous DB | LLM + Schema DDL增强 | 7项美国专利 |
| **Snowflake** | (收购Dsilo) | Dsilo NL2SQL技术 | 继承Dsilo专利 |

---

## 3. 创新点深度分析

基于项目代码和已有专利的对比分析，识别出以下创新点：

### 创新点1：语义优先的双路径SQL生成架构（Semantic-First, AI-Fallback）⭐⭐⭐

**专利价值：高**

#### 技术描述
DataNova首创了一种将确定性语义层SQL构建与AI生成SQL深度融合的双路径架构：

1. **确定性路径**：当用户自然语言查询命中语义层时，`lookup_semantic_layer`工具执行三层关键词搜索（指标名/别名/关键词 → 维度名/值 → 模型匹配），命中后由`buildSemanticSql()`确定性组装SQL（SELECT指标表达式+维度表达式 → FROM+JOIN图 → WHERE过滤 → GROUP BY → 来源标记`/* source: semantic_layer */`），**完全绕过LLM生成**。
2. **AI路径**：语义层无匹配时，回退至AgentHarness驱动的多轮工具调用（discover_schema → execute_sql），由LLM生成SQL。
3. **路径选择机制**：`lookup_semantic_layer`返回`generated_sql`并附加指令"IMPORTANT: If a metric has generated_sql, execute it directly — it's deterministically built and guaranteed to be correct. Use skip_probe=true"，明确告知Agent跳过探测直接执行。

#### 与现有方案的差异

| 维度 | 纯LLM方案（Dsilo/阿里/腾讯） | 纯语义层方案（LookML/dbt） | DataNova双路径方案 |
|------|--------------------------|------------------------|-----------------|
| SQL生成方式 | LLM自由生成，不可控 | 人工定义，覆盖有限 | Agent意图分解+确定性构建 |
| 准确性 | 低（幻觉风险） | 高（但需预先定义） | 高（语义层覆盖范围内确定性保证） |
| 灵活性 | 高 | 低 | 高（双路径回退机制） |
| 一致性 | 低（不同运行可能不同） | 高 | 高（确定性构建保证一致） |

#### 专利撰写要点
- Agent+语义层的双路径查询编排方法（确定性路径提供准确率下限，AI路径提供灵活性上限）
- LLM意图分解到语义层对象的结构化映射机制
- 三层语义实体搜索（指标→维度→模型）+自动SQL装配的端到端方法
- 语义层未命中时的自动回退策略
- 查询结果的确定性保证机制（`skip_probe=true`标记）

---

### 创新点2：反馈驱动的多信号融合Few-Shot示例检索与SQL生成闭环方法 ⭐⭐⭐

**专利价值：高**

#### 技术描述
DataNova实现了一个闭环的反馈驱动型Few-Shot检索管道，包含四个阶段：

1. **反馈采集**：用户对查询结果👍👎反馈，反馈记录通过`sql_query_history_id`外键与具体SQL执行记录关联，支持`feedback_category`分类标注，实现跨会话追踪。
2. **反馈聚合**：`getFeedbackStatsBySQL()`通过LEFT JOIN `query_feedback`与`sql_query_history`，按SQL文本聚合正/负反馈计数及高频反馈类别。
3. **反馈门控过滤**：在示例检索前执行硬过滤——仅保留已验证(`is_verified=1`)或成功执行≥3次的示例；排除负反馈≥3且正反馈=0的示例。
4. **多信号复合评分**：每个候选示例接收四源信号融合评分：
   - 关键词重叠度（+2/问题关键词匹配，+1/表名关键词匹配）
   - 验证状态加成（+3/已验证）
   - 执行历史可靠性（+min(successCount,5)，-3/错误超过成功）
   - **反馈加权**：+1/正反馈（上限+3），**-2/负反馈（上限-10）**——负反馈权重为正反馈的2倍，体现"一次差评抵两次好评"的保守策略
5. **懒同步刷新**：每次`lookup_examples`调用时自动从`sql_query_history`同步新示例，通过`ON CONFLICT DO UPDATE`模式upsert，基于执行时间/表数量自动分类难度。

#### 与现有方案的差异

| 维度 | RLHF方案（如SkyRL-SQL） | 静态few-shot方案 | 华为云CN120045576A | DataNova反馈闭环 |
|------|------------------------|----------------|-------------------|-----------------|
| 优化方式 | 模型微调 | 静态示例 | 静态历史候选集匹配 | **检索策略优化**（无需微调） |
| 部署成本 | 高（需GPU重训练） | 低 | 低 | 低（纯检索优化） |
| 实时性 | 差（需批量训练） | 静态 | 延迟同步 | 好（反馈即时生效+懒同步） |
| 反馈信号 | 奖励模型 | 无 | 无 | 多信号融合+非对称加权 |
| 数据需求 | 大量标注数据 | 手动维护 | 自动积累 | 自动积累+反馈门控 |

#### 专利撰写要点
- 四源信号融合（关键词+验证+执行历史+反馈）的Few-Shot检索排序方法
- 非对称反馈加权机制（负反馈权重2×正反馈）+反馈门控过滤
- 用户反馈→few-shot检索排序的映射方法
- 基于查询历史全量记录的自动示例库构建（懒同步刷新）
- 反馈分类（feedback_category）对检索策略的差异化影响
- 无需模型微调的实时查询优化闭环

---

### 创新点3：查询自纠链路追踪与意图感知的Few-Shot示例检索方法 ⭐⭐

**专利价值：中高**

#### 技术描述
DataNova在`sql_query_history`表中设计了一套自纠链路追踪机制：

1. **`parent_query_id`**：将纠正后的SQL链接到其失败的前驱查询，形成有向无环图（DAG）
2. **`correction_round`**：0表示原始查询，1+表示纠正尝试轮次
3. **`intent_type`**：分类查询意图（new_query/refine/drill_down/compare/explain/correction）

该机制支撑两个能力：
- **纠错学习**：系统可追溯从失败SQL到成功SQL的完整纠错路径，使用成功终端节点作为Few-Shot示例，同时惩罚失败起点
- **意图感知检索**：基于`intent_type`分类，可实现仅在与用户意图匹配的示例子集中检索（如用户下钻时仅返回drill_down类型的示例）

#### 与现有方案的差异

| 维度 | 传统查询历史 | DataNova自纠链路 |
|------|-----------|----------------|
| 记录方式 | 离散SQL执行事件 | DAG纠错链路图 |
| 纠错追踪 | 无 | parent_query_id + correction_round |
| 意图感知 | 无 | intent_type分类检索 |
| 学习能力 | 仅记录成功 | 从错误中学习（失败起点惩罚+成功终端奖励） |

#### 专利撰写要点
- 基于DAG的SQL查询自纠链路追踪方法
- 意图分类感知的Few-Shot示例检索策略
- 纠错路径的终端成功节点选择方法

---

### 创新点4：AI驱动的Schema自动发现与业务语义标注联动方法 ⭐⭐

**专利价值：中高**

#### 技术描述
DataNova实现了一种Schema发现与AI标注的联动机制：

1. **自动Schema发现**：`discover_schema`工具查询INFORMATION_SCHEMA获取表/列/外键元数据
2. **AI业务标注**：`ai_annotate_schema`工具基于Schema+样本数据生成业务语义描述
3. **标注状态管理**：标注分为`draft`（AI生成）和`confirmed`（人工确认）两种状态
4. **标注注入Agent**：标注结果作为上下文注入Agent系统提示词，提升SQL生成准确性
5. **域类型识别**：自动识别列的域类型（`domain_type`）和域值（`domain_values`）

#### 与现有方案的差异

| 维度 | 通用数据目录（如Google Data Catalog） | 纯AI标注（如US12547837B2） | DataNova联动方案 |
|------|-------------------------------------|--------------------------|-----------------|
| 标注来源 | 人工+AI辅助 | 纯AI | 自动发现+AI标注+人工确认 |
| 与查询的联动 | 弱（独立系统） | 无 | 强（标注直接注入Agent） |
| 状态管理 | 无 | 无 | draft/confirmed双状态 |
| 域值识别 | 无 | 部分 | 自动domain_type+domain_values |

#### 专利撰写要点
- Schema自动发现→AI标注→Agent上下文注入的端到端方法
- draft/confirmed双状态标注管理机制
- 基于样本数据的域类型和域值自动识别方法
- AI标注结果对Agent SQL生成准确性的增强机制

---

### 创新点5：多层数据库查询安全验证管道 ⭐⭐

**专利价值：中**

#### 技术描述
DataNova实现了一个多层SQL安全验证管道：

1. **SQL类型白名单**：仅允许SELECT/SHOW/DESCRIBE/EXPLAIN
2. **Schema缓存校验**：基于`discover_schema`缓存的表名进行校验
3. **表名验证**：验证SQL中引用的表是否存在于目标数据源
4. **执行约束**：30秒超时 + 1000行限制
5. **动态Schema缓存更新**：Schema缓存随discover_schema调用自动更新

#### 与现有方案的差异

| 维度 | 传统SQL注入防护 | Atlas 7层管道 | DataNova验证管道 |
|------|---------------|-------------|-----------------|
| 与Schema联动 | 无 | 有（语义层白名单） | 有（Agent发现+缓存） |
| 动态更新 | 无 | 静态配置 | 自动发现更新 |
| Agent场景适配 | 无 | 部分适配 | 深度适配（验证失败反馈Agent） |

#### 专利撰写要点
- Agent场景下的SQL安全验证管道设计
- 基于Schema自动发现的动态表名白名单
- 验证失败结果反馈Agent的重试机制

---

### 创新点6：基于Agent技能文件的动态工具能力注入方法 ⭐

**专利价值：中**

#### 技术描述
DataNova实现了一种基于SKILL.md文件的Agent技能动态注入机制：

1. **技能文件定义**：每个技能通过SKILL.md文件定义，包含名称、描述、触发条件
2. **动态加载**：`skill-manager.ts`在运行时扫描并加载技能文件
3. **系统提示词注入**：技能描述注入Agent系统提示词，扩展Agent能力边界
4. **热更新**：无需重启即可更新技能定义

#### 专利撰写要点
- 基于声明式文件的Agent技能动态注入方法
- 技能描述→系统提示词的自动映射机制

---

### 创新点7：定时查询调度与多条件智能告警方法 ⭐

**专利价值：中低**

#### 技术描述
DataNova实现了定时查询+多条件告警的联动：

1. **Cron调度**：支持灵活的Cron表达式定义查询调度
2. **多条件告警**：支持阈值比较、环比/同比变化等告警条件
3. **AI SQL生成**：通过LLM自动生成调度查询SQL
4. **执行历史追踪**：完整记录每次调度执行的结果

#### 专利撰写要点
- Agent驱动的定时查询SQL自动生成方法
- 多条件告警规则的统一检测框架

---

## 4. 专利申请策略建议

### 4.1 推荐申请组合

基于创新点分析，建议按以下优先级申请专利：

| 优先级 | 专利名称建议 | 类型 | 创新点 | 预估授权可能性 |
|--------|------------|------|--------|-------------|
| **P0** | 一种语义优先的双路径智能数据库查询方法及系统 | 发明专利 | 创新点1 | 中高 |
| **P0** | 一种反馈驱动的多信号融合查询示例检索与SQL生成闭环方法 | 发明专利 | 创新点2 | 中高 |
| **P1** | 一种查询自纠链路追踪与意图感知的示例检索方法 | 发明专利 | 创新点3 | 中 |
| **P1** | 一种AI驱动的数据库Schema自动发现与业务语义标注联动方法 | 发明专利 | 创新点4 | 中 |
| **P1** | 一种面向AI Agent的多层数据库查询安全验证方法 | 发明专利 | 创新点5 | 中 |
| **P2** | 一种基于技能文件的Agent动态能力注入方法 | 发明专利 | 创新点6 | 中低 |
| **P2** | 一种智能定时查询调度与多条件告警方法 | 实用新型 | 创新点7 | 中 |

### 4.2 核心专利（P0）撰写框架

#### 专利1：Agent与语义层融合的智能数据库查询方法

**权利要求书框架**：

```
1. 一种基于Agent与语义层融合的智能数据库查询方法，其特征在于，包括：
   S1. 接收用户自然语言查询请求；
   S2. Agent通过语义层检索工具，将自然语言意图分解为语义层对象组合；
   S3. 若语义层命中，调用确定性SQL构建器生成查询语句；
   S4. 若语义层未命中，Agent回退到Schema探索路径，通过自动发现工具获取数据库结构信息后生成SQL；
   S5. 执行查询并返回结果。

2. 根据权利要求1所述的方法，其特征在于，所述语义层检索包括：
   基于用户问题的关键词匹配语义指标和维度；
   返回匹配的指标定义、维度定义和模型定义；
   所述确定性SQL构建基于语义层对象定义，保证同一意图始终生成相同SQL。

3. 根据权利要求1所述的方法，其特征在于，所述Schema探索路径包括：
   调用Schema自动发现工具获取表结构元数据；
   基于元数据和用户问题生成SQL查询；
   所述SQL查询经过安全验证管道验证后执行。

4. 根据权利要求1-3任一所述的方法，其特征在于，还包括双路径选择策略：
   优先使用语义层路径，保证查询结果的确定性和一致性；
   当语义层覆盖率低于阈值时，自动切换到Schema探索路径；
   两条路径的查询结果统一经过安全验证管道。
```

#### 专利2：用户反馈驱动的查询示例检索优化闭环方法

**权利要求书框架**：

```
1. 一种基于用户反馈的查询示例检索优化与SQL生成闭环方法，其特征在于，包括：
   S1. 全量记录每次SQL查询的执行信息，形成查询历史库；
   S2. 采集用户对查询结果的结构化反馈数据，包含反馈类型和反馈分类；
   S3. 基于查询历史和反馈数据构建示例检索索引，正向反馈的查询获得更高检索权重；
   S4. 接收新查询请求时，从示例检索索引中检索相似查询作为few-shot示例；
   S5. 将few-shot示例注入Agent上下文，指导SQL生成。

2. 根据权利要求1所述的方法，其特征在于，所述结构化反馈包括：
   显式反馈：用户对查询结果的正向/负向评价；
   隐式反馈：基于查询执行状态、执行时间、返回行数自动判断；
   反馈分类：对反馈原因进行分类标注。

3. 根据权利要求1所述的方法，其特征在于，所述检索权重计算包括：
   基于反馈类型调整基础权重；
   基于反馈分类进行差异化权重调整；
   基于时间衰减因子调整历史反馈权重；
   综合计算最终检索排序分数。

4. 根据权利要求1-3任一所述的方法，其特征在于，所述闭环优化包括：
   正向反馈查询被更多检索→生成更准确SQL→获得更多正向反馈→正循环；
   负向反馈查询降低检索权重→避免重复错误→负循环抑制；
   无需模型微调即可实现查询质量的持续提升。
```

---

## 5. 风险评估与规避设计

### 5.1 高风险专利（需重点规避与详细分析）

| 风险等级 | 专利号 | 风险点 | 规避策略 |
|---------|--------|--------|---------|
| 🔴 **极高** | US11520815B1 / US12141181B2（Dsilo/Snowflake） | NL→SQL完整流程核心专利，被Snowflake收购，覆盖"使用自然语言文本生成数据库查询"的完整流程 | DataNova核心差异：双路径融合（语义层确定性构建+Schema探索回退），非单一端到端LLM生成。需详细分析Dsilo权利要求，确认Agent+语义层融合方案是否落入其范围 |
| 🔴 **极高** | US12,596,707B2（Cisco） | LLM SQL生成：从schema检索→prompt构建→SQL生成→安全验证→迭代自修正，与DataNova的完整SQL生成链路**几乎一致** | DataNova核心差异：语义层确定性SQL构建路径（Cisco为纯LLM生成）、反馈驱动检索优化闭环（Cisco未涉及） |
| 🔴 **极高** | US11442932B2 / US11928114B2（ThoughtSpot） | NL→查询语法映射专利族（9+项），ThoughtSpot专利搜索引擎是核心壁垒 | DataNova差异：ThoughtSpot基于专利关系搜索引擎做语法映射，DataNova基于LLM Agent意图分解+语义层确定性构建。技术路线有本质差异（搜索引擎 vs LLM推理），但"NL→结构化查询对象"的抽象可能触及 |
| 🔴 **极高** | US12,412,138B1（Google） | Agentic Orchestration：多Agent互操作+工具调用+标准化消息层，与DataNova的Agent编排架构高度一致 | DataNova差异：语义层确定性SQL路径+反馈闭环是Google专利未覆盖的独特组合 |
| 🔴 **高** | US11860679B2（Oracle） | 通过信息流图检测查询安全漏洞：静态分析查询AST，验证仅包含单一SELECT语句，所有引用表出现在预定义语义层白名单中，与DataNova的validator.ts**几乎完全对应** | DataNova差异：Schema动态发现构建缓存（Oracle为预定义白名单）、Levenshtein智能纠错建议、大表无WHERE防护 |
| 🔴 **高** | US12124577B2（Microsoft） | 使用语法度量检测恶意查询：组合regex守卫、AST解析和白名单检查，阻止DML/DDL关键字、多语句输入和白名单外表名 | DataNova差异：动态Schema缓存+Levenshtein纠错+大表防护是Microsoft专利未覆盖的层 |
| 🔴 **高** | CN120045576A（华为云） | 利用历史SQL候选集辅助生成，与DataNova的`lookup_examples`工具**技术方案高度一致** | 需详细分析华为专利权利要求范围。DataNova的差异点：反馈驱动的检索权重调整（华为未涉及反馈闭环）、多信号融合评分+非对称反馈加权 |
| 🟡 **中高** | CN120123356A / CN114547329A（阿里巴巴） | 中国NL2SQL专利布局，PolarDB已产品化 | DataNova核心差异：语义层确定性SQL构建（阿里为纯LLM生成）、双路径回退机制 |
| 🟡 **中高** | US12,061,970（Broadridge） | LLM编排ML Agent：单LLM调用多Agent+函数跨数据源，与DataNova的AgentHarness+多工具模式一致 | 应用领域不同（金融vs数据查询），DataNova的语义层+反馈闭环是差异化 |
| 🟡 **中高** | US20260111428A1（Amazon） | 从自然语言请求生成SQL查询，待审申请 | 待审，需跟踪审查进展 |
| 🟢 **中** | US5,555,403（Business Objects） | 语义层基础概念 | **已过期（1991年申请）**，但需注意引用该专利的延续案 |
| 🟢 **低** | Tableau系列专利 | 聚焦可视化分析中的NL交互 | DataNova的Insights页面功能较简单，不构成核心侵权风险 |

### 5.2 DataNova的差异化优势（相对专利风险规避）

| 维度 | 现有专利普遍方案 | DataNova差异化 | 规避效果 |
|------|---------------|---------------|---------|
| SQL生成 | LLM端到端自由生成（Dsilo、阿里、腾讯） | **双路径融合**：Agent意图分解+语义层确定性构建，LLM不直接生成SQL | ✅ 高 — 从根本上区别于端到端LLM生成 |
| 查询语法映射 | 搜索引擎式语法映射（ThoughtSpot） | LLM推理式意图分解→语义层对象匹配→确定性构建 | ✅ 高 — 技术路线本质不同 |
| 反馈优化 | RLHF模型微调（学术方向） | 检索策略优化，无需微调，即时生效 | ✅ 高 — 完全不同的优化范式 |
| 历史SQL利用 | 静态候选集匹配（华为云） | **反馈驱动的动态检索权重**：正向反馈提升权重、反馈分类差异化影响 | ✅ 中高 — 增加了反馈闭环维度 |
| Schema管理 | 静态配置或独立AI标注 | 自动发现→AI标注→人工确认→Agent注入全链路 | ✅ 中 — 全链路联动是差异化 |
| 安全验证 | 通用SQL注入防护 | Agent场景适配+动态Schema缓存+验证失败反馈Agent重试 | ✅ 中 — Agent场景深度适配 |
| 技能扩展 | 硬编码工具 | 声明式技能文件动态注入 | ✅ 低 — 辅助差异化 |

### 5.3 专利自由实施（FTO）建议

1. **🔴 紧急**：针对以下专利进行详细权利要求对比分析（建议委托专利律师）：
   - Dsilo/Snowflake US11520815B1 — NL→SQL核心流程
   - Cisco US12,596,707B2 — LLM SQL生成+验证+自修正链路
   - ThoughtSpot US11442932B2 — NL→查询语法映射
   - Google US12,412,138B1 — Agentic Orchestration
2. **🔴 紧急**：SQL安全验证管道FTO分析：
   - Oracle US11860679B2 — 信息流图查询安全检测
   - Microsoft US12124577B2 — 语法度量恶意查询检测
   - DataNova的差异化：动态Schema缓存+Levenshtein纠错+大表防护
3. **🟡 重要**：华为云CN120045576A重点分析其"历史SQL候选集"的权利要求范围，确认DataNova的反馈驱动检索权重调整是否构成规避
4. **🟡 重要**：中国市场FTO — 阿里巴巴CN120123356A和CN114547329A需在中国市场运营前进行分析
5. **🟢 防御性申请**：尽快提交DataNova核心创新点的专利申请，建立自己的专利壁垒，为后续可能的交叉授权谈判积累筹码

---

## 6. 附录：专利检索清单

### 检索来源
- Tavily Search（多轮深度检索）
- Google Patents
- CNIPA中国国家知识产权局
- USPTO美国专利商标局
- WIPO/PCT国际专利

### 检索关键词

| 维度 | 中文关键词 | 英文关键词 |
|------|----------|----------|
| NL2SQL | 自然语言转SQL、智能问数、文本转SQL | NL2SQL, Text-to-SQL, natural language to SQL |
| 语义层 | 语义层、语义模型、业务指标定义 | semantic layer, metrics layer, deterministic SQL |
| 反馈闭环 | 查询反馈、SQL优化反馈、用户反馈 | query feedback loop, RLHF SQL, query refinement |
| Schema标注 | AI标注、数据字典自动生成 | AI schema annotation, automatic metadata |
| 安全验证 | SQL白名单验证、SQL注入防护 | SQL validation pipeline, SQL safety check |
| Agent编排 | AI代理、多工具调用、智能体 | AI agent tool use, agent orchestration |

### 核心专利全文检索链接

**中国专利（CNIPA）**：
- [CN114547329A - 阿里巴巴预训练语言模型语义解析](https://patents.google.com/patent/CN114547329A/zh)
- [CN120123356A - 阿里云SQL生成方法](https://patents.google.com/patent/CN120123356A/zh)
- [CN120045576A - 华为云自然语言转SQL](https://patents.google.com/patent/CN120045576A/zh)
- [CN116821168B - 改进的NL2SQL方法](https://patents.google.com/patent/CN116821168B/zh)
- [CN117453717B - 星环数据查询语句生成](https://patents.google.com/patent/CN117453717B/zh)
- [CN118227655A - 腾讯数据库查询语句生成](https://patents.google.com/patent/CN118227655A/zh)
- [CN117371406A - LLM注释生成方法](https://patents.google.com/patent/CN117371406A/zh)
- [CN114942937B - 主动学习数据匹配方法](https://patents.google.com/patent/CN114942937B/zh)

**美国专利（USPTO）**：
- [US11520815B1 - Dsilo/Snowflake NL→SQL核心专利](https://patents.google.com/patent/US11520815B1/en)
- [US12141181B2 - Dsilo/Snowflake延续案](https://patents.google.com/patent/US12141181B2/en)
- [US12596707B2 - Cisco LLM SQL生成+验证](https://patents.google.com/patent/US12596707B2/en)
- [US12412138B1 - Google Agentic Orchestration](https://patents.google.com/patent/US12412138B1/en)
- [US12061970 - Broadridge LLM编排ML Agent](https://patents.google.com/patent/US12061970/en)
- [US11442932B2 - ThoughtSpot NL→查询语法映射](https://patents.google.com/patent/US11442932B2/en)
- [US11928114B2 - ThoughtSpot逻辑数据模型查询生成](https://patents.google.com/patent/US11928114B2/en)
- [US11604790B2 - Unscrambl对话式NL查询接口](https://patents.google.com/patent/US11604790B2/en)
- [US11520785B2 - Salesforce查询分类改写](https://patents.google.com/patent/US11520785B2/en)
- [US11880658B2 - JPMorgan深度学习NL数据接口](https://patents.google.com/patent/US11880658B2/en)
- [US11860679B2 - Oracle信息流图查询安全检测](https://patents.google.com/patent/US11860679B2/en)
- [US12124577B2 - Microsoft语法度量恶意查询检测](https://patents.google.com/patent/US12124577B2/en)
- [US11665165B2 - Mitsubishi白名单生成器和评估器](https://patents.google.com/patent/US11665165B2/en)
- [US5,555,403 - Business Objects语义层原始专利（已过期）](https://patents.google.com/patent/US5555403A/en)
- [US12547837B2 - AI元数据语义增强](https://patents.google.com/patent/US12547837/en)
- [US20230097443A1 - One-shot text-to-SQL](https://patents.google.com/patent/US20230097443A1/en)

**国际专利（WIPO/PCT）**：
- [WO2021132760A1 - 浦项工大神经网络预测NL→SQL列/表](https://patents.google.com/patent/WO2021132760A1/en)
- [WO2025118854A1 - 阿里云SQL生成方法](https://patents.google.com/patent/WO2025118854A1)

---

## 结论

DataNova智能问数Agent在以下方面具有显著的专利创新性：

### ✅ 可申请专利的创新点

1. **Agent+语义层融合查询**（⭐⭐⭐最高优先级）：这是目前**专利空白区**——现有专利要么是纯LLM生成SQL（Dsilo/Snowflake、阿里、腾讯），要么是纯语义层静态定义（Looker/LookML、dbt/MetricFlow），DataNova的"Agent意图分解+语义层确定性构建"双路径融合方案具有明确的创新性和实用价值。与ThoughtSpot的搜索引擎式语法映射也有本质差异（LLM推理 vs 关系搜索）。

2. **反馈驱动的检索优化闭环**（⭐⭐⭐最高优先级）：区别于主流RLHF方案和华为云的静态历史SQL候选集匹配，DataNova采用"结构化反馈→检索权重动态调整→few-shot优化"的轻量级闭环，无需GPU微调即可实现查询质量持续提升，这在现有专利中**未见对应方案**。

3. **Schema发现→AI标注→Agent注入全链路**（⭐⭐中高优先级）：将AI标注结果直接作为Agent上下文注入，形成"标注即能力"的闭环，区别于独立的数据目录系统。

### ⚠️ 需关注的风险专利

- **Dsilo/Snowflake US11520815B1**（🔴极高风险）：覆盖NL→SQL完整流程，需详细分析权利要求
- **ThoughtSpot专利族**（🔴极高风险）：9+项美国专利，NL→查询语法映射领域密集布局
- **华为云 CN120045576A**（🔴高风险）：历史SQL候选集辅助生成，与`lookup_examples`高度相似
- **阿里巴巴 CN120123356A**（🟡中高风险）：中国NL2SQL专利布局，PolarDB已产品化

### 📋 行动建议

| 行动 | 优先级 | 时间线 |
|------|--------|--------|
| 委托专利律师对Dsilo/Snowflake和ThoughtSpot进行FTO分析 | 🔴 紧急 | 1-2周 |
| 提交创新点1（Agent+语义层融合）发明专利申请 | 🔴 高 | 2-4周 |
| 提交创新点2（反馈驱动检索闭环）发明专利申请 | 🔴 高 | 2-4周 |
| 分析华为云CN120045576A权利要求范围 | 🟡 中 | 1-2周 |
| 提交创新点3（Schema全链路）发明专利申请 | 🟢 一般 | 1-2月 |
| 中国市场FTO分析（阿里专利） | 🟡 中 | 产品上市前 |

预计发明专利审查周期18-24个月，授权可能性中等偏上。建议尽快提交申请以建立自己的专利壁垒，同时为后续可能的交叉授权谈判积累筹码。
