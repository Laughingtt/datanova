# AI指标开发 — 行业调研报告

> 调研时间：2026年7月 | 调研范围：AI驱动的指标开发与语义层自动化

## 一、行业背景

2025-2026年，BI/数据分析行业经历了从"AI辅助查询"到"Agent驱动指标开发"的根本性转变。核心趋势：

1. **AI Agent成为指标的一等消费者** — 不再是Agent直接查表，而是通过语义层获取治理后的指标定义
2. **指标开发自动化** — 从手动定义指标到Agent自动发现、生成、验证指标
3. **语义层标准化** — OSI (Open Semantic Interchange) YAML标准统一了跨平台指标定义
4. **验证闭环** — 指标必须经过自动化测试才能发布，确保数据可信

## 二、国际产品调研

### 2.1 ThoughtSpot — Spotter Semantics (2026.3)

**核心创新**：Spotter Semantics是业界首个Agent驱动的语义层。

- **语义图(Semantic Graph)** — 存储表、列、业务指标之间的预定义关系
- **Agent查询流程** — 用户问"营收"→ Agent先在语义图中解析到标准指标定义 → 再生成SQL
- **自动指标发现** — Agent可以从数据仓库元数据和BI使用模式中自动发现并推荐指标定义
- **效果** — Looker内部测试显示，语义层将AI自然语言查询的数据错误率降低了2/3
- **商业表现** — 2025财年收入同比增长133%，64%+客户将Spotter作为主要AI分析师

**对DataNova的启发**：
- ✅ Agent必须先查语义层再查表 — 与当前 `lookup_semantic_layer` 优先级设计一致
- ✅ 指标定义需要业务上下文(context) — 我们已有 `business_context` 字段
- 📌 需要增加：Agent主动发现指标的能力，而非仅被动查找

### 2.2 dbt Semantic Layer (MetricFlow)

**定位**：Analytics工程团队的Metrics-as-Code方案。

- **核心能力**：指标定义嵌入dbt项目，Git版本控制，仓库无关
- **集成**：Tableau、Power BI、Hex、Mode、AI Copilots
- **局限**：依赖dbt Cloud、无内置缓存、仅限指标定义（非完整语义层）
- **2026发展**：支持OSI标准，指标定义可跨平台消费

**对DataNova的启发**：
- 📌 指标版本控制的重要性 — 我们的 `version` 字段需要更完善的变更追踪
- 📌 Metrics-as-Code理念 — 未来可考虑将指标定义导出为YAML/Markdown

### 2.3 Cube.dev

**定位**：开源无头BI引擎，专为嵌入式分析和AI Agent设计。

- **核心架构**：读取dbt模型 → 预聚合缓存 → SQL/REST/GraphQL/MCP多接口服务
- **AI Agent支持**：通过MCP (Model Context Protocol) 暴露治理指标给AI Agent
- **Brex选择Cube**而非dbt SL和LookML — 证明无头架构在Agent场景的优势
- **多租户安全**：内置访问控制

**对DataNova的启发**：
- ✅ 无头API架构 — 与DataNova的Agent工具调用模式相似
- 📌 MCP协议 — 未来可考虑暴露语义层为MCP Server，让外部Agent消费
- 📌 预聚合缓存 — 指标查询性能优化方向

### 2.4 Microsoft Fabric — Power BI Copilot

**定位**：Microsoft生态内的AI助手。

- **三大能力**：自然语言生成报表、DAX编写/解释、语义模型问答
- **消耗模型**：每次Copilot交互消耗约1800 CU，F64容量支持100-150次/小时
- **Real-Time Dashboard** — AI生成可视化，无需KQL知识
- **Data Agents** — Fabric数据可在Microsoft 365 Copilot中直接查询

**对DataNova的启发**：
- 📌 AI交互的成本控制 — 需要考虑Token消耗和速率限制
- 📌 自然语言→指标定义 — 用户描述需求，AI生成完整的指标配置

### 2.5 Tableau Pulse

**定位**：AI驱动的指标监控层。

- **核心模式**：定义指标一次 → 自动推送个性化洞察到Web/Email/Slack/Mobile
- **异常检测**：自动发现指标异常并生成自然语言解释
- **权限继承**：AI摘要遵循Tableau现有权限和行级安全
- **定价**：Tableau Cloud免费附带

**对DataNova的启发**：
- 📌 指标监控与告警 — 与DataNova的 `scheduled_queries` + `alert_conditions` 方向一致
- 📌 指标异常自动解释 — 未来可扩展

### 2.6 Databricks — AI/BI Dashboard (Genie)

**定位**：仓库原生的AI分析助手。

- **Unity Catalog Metric Views** — 2026年4月GA，指标定义作为仓库一等对象
- **Genie Agent** — 利用Metric Views提供单一指标真相
- **多场景支持**：SQL仪表板、Python/R笔记本、ML特征工程、LLM Agent
- **兼容性问题**：2026年移除了Power BI兼容模式

**对DataNova的启发**：
- 📌 指标作为一等对象 — 与我们的semantic_metrics表理念一致
- 📌 多场景消费 — 同一指标定义被问数Agent、指标开发Agent、报告Agent等共享

### 2.7 Snowflake — Semantic View Autopilot (2026)

**核心创新**：ML自动发现指标定义。

- **自动发现**：分析仓库元数据和BI使用模式，自动推荐语义视图定义
- **零延迟**：语义视图作为仓库原生对象，无中间件延迟
- **OSI支持**：与其他语义层工具互通

**对DataNova的启发**：
- 📌 **Autopilot模式** — 这是最接近我们"指标开发Agent"的概念
- 📌 自动发现 → 用户确认 → 发布 的工作流与我们的设计完全一致

## 三、国内产品调研

### 3.1 帆软FineBI — 指标中心 + FineBINext AI引擎

**核心架构**：
- **指标中心** — 原子/衍生/复合指标三层建模，统一管理指标口径
- **全链路血缘** — 从数据表到看板每一步可查
- **FineBINext AI引擎** — 分析Agent + 场景Agent，支持私有化部署
- **三级溯源** — L1指标层→L2模型层→L3数据层，AI分析结果可管控可验证
- **信创合规** — 全面适配国产数据库、操作系统和中间件

**对DataNova的启发**：
- ✅ 三层指标类型 — 与我们的 atomic/derived/compound 完全对应
- 📌 三级溯源 — 我们需要增加指标→SQL→数据表的溯源链
- 📌 AI分析结果可溯源 — Agent创建的指标必须记录创建过程和依据

### 3.2 Kyligence — AI增强指标平台

**核心架构**：
- **指标中台** — 从原子指标到复合指标的全链路管理
- **AI增强建模** — 自动化指标构建和治理
- **L1-L3级溯源** — 金融和零售行业的指标血缘追踪
- **统一指标网络** — 跨业务线共享指标定义

**对DataNova的启发**：
- 📌 统一指标网络 — 指标之间应有引用关系（衍生指标引用原子指标）
- 📌 AI增强建模 — 指标开发Agent的核心价值主张

### 3.3 观远数据 — AI增强型云原生BI

**核心架构**：
- **指标中心** — 语义层统一管理口径、血缘和版本
- **AI根因分析** — 自动分析指标波动原因
- **自然语言报告** — AI生成分析报告
- **行业模板** — 零售、制造等行业指标模板

**对DataNova的启发**：
- 📌 行业指标模板 — 可预置常见行业指标模板，加速指标开发
- 📌 AI根因分析 — 指标治理Agent的未来方向

### 3.4 网易有数 — ChatBI

**核心架构**：
- **ChatBI** — 高中文理解精度的自然语言交互
- **轻量化指标管理** — 适合中小企业
- **实时数据处理** — 流式数据支持

**对DataNova的启发**：
- 📌 中文理解精度 — 指标开发Agent需要优秀的中文业务语义理解

## 四、关键技术趋势

### 4.1 Open Semantic Interchange (OSI) 标准

2026年1月发布的OSI标准，统一了跨平台指标定义格式：
- 基于YAML的供应商中立格式
- dbt、Cube、Snowflake、Databricks等40+合作伙伴支持
- 指标定义一次，多平台消费

**DataNova机会**：未来可支持OSI格式的导入导出。

### 4.2 MCP (Model Context Protocol)

Cube等平台通过MCP暴露语义层给AI Agent：
- Agent通过MCP发现可用的指标和维度
- 查询自动路由到正确的语义层定义
- 访问控制继承

**DataNova机会**：当前Agent工具调用模式已类似MCP，未来可标准化。

### 4.3 自动化指标验证

行业最佳实践：
- **CI/CD集成** — 每次指标变更触发自动测试
- **SQL验证** — EXPLAIN + 实际执行 + 结果合理性检查
- **异常检测** — AI辅助发现指标值异常
- **自修复** — 发现问题自动修复并重试

### 4.4 多Agent协作模式

行业趋势是多Agent分工协作：
- **指标开发Agent** — 负责创建新指标
- **指标治理Agent** — 负责审核、版本管理、弃用
- **数据质量Agent** — 负责监控指标数据质量
- **报告Agent** — 负责生成分析报告
- **血缘Agent** — 负责追踪指标血缘关系

**关键设计**：统一Agent管理框架，用户在一个界面选择和切换Agent。

## 五、竞品对比矩阵

| 能力维度 | DataNova(当前) | ThoughtSpot | 帆软FineBI | Kyligence | Cube.dev |
|---------|---------------|-------------|-----------|-----------|----------|
| 指标类型 | atomic/derived/compound | 语义图 | 原子/衍生/复合 | 原子→复合 | measures/dimensions |
| AI推荐 | ✅ 单次批量推荐 | ✅ Agent自动发现 | ✅ FineBINext | ✅ AI增强建模 | ❌ |
| 对话式开发 | ❌ | ✅ Spotter Agent | ✅ 分析Agent | ✅ | ❌ |
| 自动验证 | ❌ (仅EXPLAIN) | ✅ | ✅ 三级溯源 | ✅ L1-L3 | ❌ |
| 自动修复 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 冲突检测 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 指标血缘 | ❌ | ✅ | ✅ 全链路 | ✅ 全链路 | ✅ |
| 版本管理 | ✅ version字段 | ✅ | ✅ | ✅ | ❌ |
| 多Agent | ❌ | ✅ 多Spotter Agent | ✅ 分析+场景 | ❌ | ❌ |
| MCP支持 | ❌ | ❌ | ❌ | ❌ | ✅ |

## 六、对DataNova的核心启示

1. **Agent驱动的指标开发是行业共识** — ThoughtSpot、FineBI、Kyligence都在做
2. **自动验证+自动修复是我们的差异化机会** — 竞品大多只有验证，没有修复
3. **统一Agent管理框架是基础设施** — 未来多个Agent需要统一入口和管理
4. **指标血缘和溯源是长期竞争力** — 当前缺失，需逐步补齐
5. **OSI标准是未来方向** — 短期不急，但架构需预留扩展性
