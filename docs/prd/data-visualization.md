# PRD: DataNova 数据可视化

## 1. 背景与目标

### 1.1 现状

用户在 DataNova 中通过自然语言提问，AI Agent 生成并执行 SQL，返回结果以 **纯表格** 形式展示在聊天界面（`TableResult` 组件）。当前体验存在以下问题：

- 数值型结果缺乏直观的视觉对比，用户需要手动脑补趋势和分布
- 时序数据无法快速感知变化趋势
- 分类数据无法快速感知占比关系
- 用户需将数据导出到外部工具（Excel / BI）才能看图，链路长

### 1.2 目标

在 SQL 查询结果返回后，自动或半自动地生成可视化图表，让用户「一眼看懂数据」，减少认知负荷。

**核心原则**：
- 图表是表格的 **补充**，不是替代；表格用于精确读数，图表用于直觉理解
- 自动推断 + 手动切换；系统应智能推荐图表类型，但用户始终拥有最终选择权
- 轻量嵌入，不引入重型 BI 面板；保持聊天流的线性叙事感

---

## 2. 技术选型

### 2.1 图表库对比

| 维度 | Recharts | ECharts (apache-echarts) | Chart.js + react-chartjs-2 | Nivo |
|------|----------|--------------------------|----------------------------|------|
| 包体积 | ~45 kB (gzip) | ~300 kB (gzip, 全量) / ~100 kB (按需) | ~60 kB (gzip) | ~30 kB/模块 (按需) |
| React 集成 | 原生 React 组件 | 命令式，需封装 | 需 react-chartjs-2 桥接 | 原生 React 组件 |
| 图表类型 | 柱形/折线/饼/散点/面积/雷达 | 全类型 + 地图 + 3D | 柱形/折线/饼/散点/雷达 | 柱形/折线/饼/散点/热力/树图 |
| 定制能力 | 中（SVG，CSS 友好） | 极高（Canvas，主题系统） | 中（Canvas） | 中（SVG，D3 底层） |
| 动画 | 流畅 | 流畅 | 流畅 | 流畅 |
| SSR | 支持 | 需动态导入 | 需动态导入 | 支持 |
| TypeScript | 原生 | 需 @types/echarts | 原生 | 原生 |
| 主题/样式 | React props 驱动，与 TailwindCSS 配合好 | 独立主题系统 | 需额外配置 | CSS-in-JS |

### 2.2 推荐方案：Recharts

**理由**：

1. **与现有技术栈天然契合** — Recharts 是声明式 React 组件，与 React 19 + TypeScript + Vite 6 零摩擦集成，不需要命令式封装或 Canvas 桥接
2. **包体积合理** — gzip ~45 kB，不影响首屏加载；按需引入可进一步优化
3. **SVG 渲染** — 图表为 SVG 输出，可直接用 CSS 变量控制颜色，与 DataNova 的 `--primary` / `--ink` / `--steel` 等设计变量无缝协作
4. **TailwindCSS 友好** — 组件的 className / style 可直接与 Tailwind 配合
5. **TypeScript 原生** — 无需额外类型包
6. **满足所需图表类型** — 柱形图、折线图、饼图、面积图、散点图、雷达图均已覆盖

**备选**：若未来需要地图、3D、或超大数据量渲染，可引入 ECharts 作为增强层。但当前需求（柱形/折线/饼图）Recharts 完全够用。

---

## 3. 数据流改造

### 3.1 当前数据流（问题）

```
execute_sql 工具 → 返回 { content: markdown表格文本, details: { rowCount, executionTime } }
                    ↓
  LLM 将结果编入文本回复 → 前端只拿到纯文本 + SQL 代码块
                    ↓
  MessageItem → 从 content 中正则提取 SQL → SqlBlock 展示
                                ↓
                   没有结构化数据 → 无法生成图表
```

核心问题：`tool_result` 事件只转发了 `details`（rowCount/executionTime），**没有转发结构化的 columns + rows 数据**。前端拿不到原始数据，就无法驱动图表渲染。

### 3.2 改造后数据流

```
execute_sql 工具 → 返回 { content, details: { rowCount, executionTime, columns, rows } }
                    ↓
  chat-handler.ts → forwardEvent 中对 execute_sql 的 tool_result 事件，
                    将 columns + rows 附加到 details 中转发
                    ↓
  useAgentStream.ts → processWsEvent 在处理 tool_result 时，
                    若 toolName === "execute_sql" 且 details.columns 存在，
                    填充 message.tableData = { columns, rows, executionTime }
                    ↓
  MessageItem → 同时渲染 TableResult + ChartView
```

### 3.3 改造要点

| 文件 | 改动 | 说明 |
|------|------|------|
| `packages/server/src/agent/tools/execute-sql.ts` | 修改 `details` 返回值 | 在 `details` 中增加 `columns` 和 `rows` 字段 |
| `packages/server/src/ws/chat-handler.ts` | 修改 `tool_result` 转发 | 对 `execute_sql` 的结果，将完整 `columns` + `rows` 加入转发数据 |
| `packages/web/src/hooks/useAgentStream.ts` | 修改 `processWsEvent` | 处理 `tool_result` 时，若数据结构匹配则填充 `message.tableData` |
| `packages/web/src/components/Chat/MessageItem.tsx` | 增加 `ChartView` | 在 `TableResult` 下方/旁边渲染图表区域 |
| 新增 `packages/web/src/components/Chat/ChartView.tsx` | 新组件 | 接收 `TableData`，推断图表类型，渲染可切换的图表 |
| 新增 `packages/web/src/utils/chart-inference.ts` | 新工具函数 | 根据数据特征推断推荐图表类型 |

---

## 4. 图表类型推断规则

系统根据返回数据的列特征自动推断最佳图表类型。推断逻辑优先级：

### 4.1 推断决策树

```
数据行数 = 0 → 不展示图表
数据行数 = 1 → 展示 KPI 卡片（关键数值 + 环比箭头）

数据行数 ≥ 2:
  ├─ 存在日期列 + 数值列 → 折线图 / 面积图（趋势）
  ├─ 存在分类列（≤20个唯一值）+ 数值列:
  │     ├─ 唯一值 ≤ 8 → 饼图（占比）
  │     └─ 唯一值 > 8 → 柱形图（对比）
  ├─ 存在2个数值列 + 0-1个分类列 → 散点图（相关性）
  └─ 仅数值列（无分类/日期） → 柱形图（对比各列）
```

### 4.2 列类型识别规则

| 类型 | 识别方式 | 用途 |
|------|----------|------|
| 日期列 | 列值匹配 `YYYY-MM-DD` / `YYYY/MM/DD` / Unix timestamp；或列名含 date/time/month/year/年/月/日 | X 轴 |
| 数值列 | 列值全部可转为数字（排除日期列） | Y 轴 |
| 分类列 | 非日期、非数值的列；或数值列唯一值 ≤ 20 且行数 > 唯一值 | 分组 / 颜色 |

### 4.3 推荐图表类型枚举

```typescript
type ChartType =
  | "line"        // 折线图：时序趋势
  | "area"        // 面积图：时序趋势（强调量级）
  | "bar"         // 柱形图：分类对比
  | "pie"         // 饼图：分类占比
  | "scatter"     // 散点图：相关性分析
  | "kpi_card"    // KPI 卡片：单行单值
```

---

## 5. 功能设计

### 5.1 ChartView 组件

位置：`packages/web/src/components/Chat/ChartView.tsx`

**输入**：`TableData`（columns + rows + executionTime）

**布局**：
```
┌──────────────────────────────────────────────────────┐
│ [📊 折线图] [📊 柱形图] [📊 饼图] [📊 面积图] ...  │  ← 图表类型切换栏
│  (系统推荐类型高亮, 其余灰色可选)                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│              [Recharts 图表渲染区域]                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ X 轴: [日期 ▾]   Y 轴: [金额, 数量 ▾]               │  ← 轴字段选择（可选高级功能）
└──────────────────────────────────────────────────────┘
```

**行为**：
1. 组件首次渲染时，调用 `inferChartType(data)` 自动推断推荐图表类型
2. 默认展示推荐类型，推荐类型在切换栏中高亮标记
3. 用户点击其他类型可手动切换，切换后图表平滑过渡
4. 图表区域在 `TableResult` 上方或下方渲染（见 5.2 交互设计）

### 5.2 交互设计

#### 5.2.1 图表展示位置

在 `MessageItem` 中，图表紧跟在 `TableResult` 下方渲染：

```
消息布局：
  [步骤指示器]
  [结果摘要卡片]
  [SQL 代码块]
  [数据表格]
  [可视化图表]    ← 新增
  [反馈按钮]
  [文本回复]
```

#### 5.2.2 图表/表格视图切换

提供 Tab 切换，让用户在「表格」「图表」之间快速切换，而非同时展示两者占用过多纵向空间：

```
┌────────────────────────────────────────┐
│ [📋 表格] [📊 图表]                    │  ← Tab 切换
├────────────────────────────────────────┤
│                                        │
│  (当前选中 Tab 对应的内容区域)           │
│                                        │
└────────────────────────────────────────┘
```

- **默认**：当推断出有意义的图表时，默认展示「图表」Tab
- 用户可随时切回「表格」查看精确数值
- 图表 Tab 内仍提供图表类型切换

#### 5.2.3 无图表场景

以下场景不展示图表区域：
- 结果为空（0 行）
- 所有列均为文本且无法量化
- 单行单列（仅一个值，用 KPI 卡片更合适）

#### 5.2.4 数据量限制

- 图表最多渲染 **100 条数据**（超出部分取前 100 行，并提示「仅展示前 100 条」）
- 饼图最多展示 **10 个分片**（超出时合并为「其他」）

### 5.3 图表样式规范

图表颜色使用 DataNova 设计系统的 CSS 变量，确保视觉一致性：

| 元素 | 颜色 | 变量 |
|------|------|------|
| 主色 | 靛蓝 | `--primary: #4f46e5` |
| 辅色 1 | 天蓝 | `--info: #0ea5e9` |
| 辅色 2 | 琥珀 | `--highlight: #f59e0b` |
| 辅色 3 | 翠绿 | `--success: #059669` |
| 辅色 4 | 玫红 | `--error: #dc2626` |
| 网格线 | 浅灰 | `--hairline: #e2e8f0` |
| 轴标签 | 钢灰 | `--steel: #64748b` |
| 提示框背景 | 白底 | `--surface: #ffffff` |
| 提示框边框 | 浅边 | `--hairline: #e2e8f0` |

多系列颜色调色板（按顺序使用）：
```typescript
const CHART_COLORS = [
  '#4f46e5', // primary - 靛蓝
  '#0ea5e9', // info - 天蓝
  '#f59e0b', // highlight - 琥珀
  '#059669', // success - 翠绿
  '#dc2626', // error - 玫红
  '#8b5cf6', // 紫罗兰
  '#ec4899', // 粉红
  '#14b8a6', // 青绿
];
```

### 5.4 各图表类型详细设计

#### 柱形图 (Bar Chart)

**适用场景**：分类数据的数值对比
**配置**：
- X 轴：分类列（自动取第一个非数值列）
- Y 轴：数值列（可多系列）
- 柱形圆角：4px
- 柱间距：4px
- 支持横向柱形图（当分类名称较长时自动切换）
- Hover 显示 Tooltip（分类名 + 数值）

#### 折线图 (Line Chart)

**适用场景**：时序趋势、连续数值变化
**配置**：
- X 轴：日期列
- Y 轴：数值列（可多系列，每条线不同颜色）
- 线宽：2px
- 数据点：小圆点 (r=3)，hover 时放大 (r=5)
- 支持面积填充（半透明，15% 透明度）
- Grid 显示水平参考线

#### 饼图 (Pie Chart)

**适用场景**：分类占比、构成分析
**配置**：
- 内环/外环：支持环形图 (Donut)，内径 60%
- 扇区边框：白色 2px（视觉分隔）
- 标签：分类名 + 百分比
- Hover 扇区突出偏移 8px
- 超过 10 个分类时合并尾部为「其他」

#### 面积图 (Area Chart)

**适用场景**：时序趋势且需强调量级
**配置**：
- 与折线图类似，但填充面积
- 填充透明度 20%
- 支持堆叠面积图（多系列时）

#### 散点图 (Scatter Chart)

**适用场景**：两个数值变量之间的相关性
**配置**：
- X 轴：第一个数值列
- Y 轴：第二个数值列
- 点大小：r=4
- 支持按分类列着色
- Hover 显示 Tooltip（X 值 + Y 值 + 分类）

#### KPI 卡片 (KPI Card)

**适用场景**：单行结果的关键数值展示
**配置**：
- 大号数字显示（text-3xl, font-mono）
- 数值下方显示列名
- 若有环比数据，显示箭头 + 百分比

---

## 6. 可视化触发场景

### 6.1 场景一：聊天查询后自动展示（核心场景）

**触发条件**：`execute_sql` 工具成功返回结果
**展示逻辑**：
1. Agent 执行 SQL 后，结构化数据通过 `tool_result` 事件到达前端
2. 前端根据数据特征自动推断图表类型
3. 在消息中展示「表格/图表」切换 Tab，默认显示推荐图表

**示例**：
- 用户问：「上个月每天的销售趋势」 → 自动推荐折线图
- 用户问：「各部门的预算占比」 → 自动推荐饼图
- 用户问：「各产品线的收入对比」 → 自动推荐柱形图

### 6.2 场景二：历史查询结果可视化

**触发条件**：用户在「查询历史」页面查看已执行的 SQL 结果
**展示逻辑**：
1. 查询历史列表增加「可视化」按钮
2. 点击后重新执行 SQL（或读取缓存结果），展示图表视图
3. 也可直接在查询历史行内展示小型缩略图 (sparkline)

### 6.3 场景三：定时查询执行结果可视化

**触发条件**：定时查询执行完成后，查看执行结果
**展示逻辑**：
1. 在执行历史记录中，增加趋势图表
2. 对于长期运行的定时查询，展示结果随时间变化的折线图

### 6.4 场景四：指标管理测试结果可视化

**触发条件**：用户在指标管理中点击「测试」按钮
**展示逻辑**：
1. 测试结果目前仅展示表格，增加图表视图
2. 帮助用户直观验证指标 SQL 是否正确

### 6.5 场景五：数据字典数据概览

**触发条件**：用户在数据字典浏览某张表时
**展示逻辑**：
1. 表详情页展示数据分布概览图
2. 枚举类型字段展示饼图，数值字段展示直方图

> **优先级**：场景一（P0 必须）> 场景二（P1 重要）> 场景四（P2 有则更好）> 场景三/五（P3 远期）

---

## 7. 实施计划

### Phase 1: 核心能力（P0）

**目标**：聊天查询后自动生成图表

| 任务 | 说明 | 预估 |
|------|------|------|
| 安装 Recharts | `npm install recharts` | 0.5h |
| 改造 execute-sql.ts | details 中增加 columns + rows | 1h |
| 改造 chat-handler.ts | tool_result 转发中增加结构化数据 | 1h |
| 改造 useAgentStream.ts | processWsEvent 中填充 tableData | 1h |
| 新增 chart-inference.ts | 图表类型推断逻辑 | 2h |
| 新增 ChartView.tsx | 图表渲染组件（支持 bar/line/pie/area/scatter/kpi_card） | 4h |
| 改造 MessageItem.tsx | 集成表格/图表切换 Tab | 2h |
| 样式调优 | 与设计系统对齐 | 1h |
| **合计** | | **~12.5h** |

### Phase 2: 增强体验（P1）

| 任务 | 说明 | 预估 |
|------|------|------|
| 查询历史可视化 | 历史记录点击可视化按钮 | 3h |
| 轴字段选择器 | 用户可手动切换 X/Y 轴字段 | 2h |
| 图表导出 | 导出为 PNG / SVG | 1h |
| 暗色主题适配 | 图表颜色跟随暗色模式 | 1h |
| **合计** | | **~7h** |

### Phase 3: 高级能力（P2-P3）

| 任务 | 说明 | 预估 |
|------|------|------|
| 指标测试结果可视化 | P2 | 2h |
| 定时查询趋势图 | P3 | 3h |
| 数据字典分布图 | P3 | 3h |
| 交互式下钻 | 点击图表扇区/柱形进一步查询 | 4h |
| AI 主动推荐图表 | Agent 在回复中建议可视化 | 2h |

---

## 8. 技术实现细节

### 8.1 execute-sql.ts 改造

当前 `details` 返回：
```typescript
details: {
  rowCount: rows.length,
  executionTime: result.executionTime,
  validationWarnings: largeTableWarning ? [largeTableWarning] : [],
}
```

改造后增加结构化数据：
```typescript
details: {
  rowCount: rows.length,
  executionTime: result.executionTime,
  validationWarnings: largeTableWarning ? [largeTableWarning] : [],
  columns: columns,           // 新增
  rows: rows.slice(0, 100),   // 新增，限制 100 行避免 WebSocket 消息过大
}
```

### 8.2 useAgentStream.ts 改造

在 `tool_result` 事件处理中增加：
```typescript
case "tool_result": {
  // ... 现有逻辑 ...
  const details = event.details as any;
  const tableData = (details?.columns && details?.rows)
    ? {
        columns: details.columns as string[],
        rows: details.rows as Record<string, unknown>[],
        executionTime: details.executionTime as number,
      }
    : undefined;

  return {
    ...currentAssistantMessage,
    steps,
    tableData,  // 填充
  };
}
```

### 8.3 ChartView 组件核心结构

```typescript
interface ChartViewProps {
  data: TableData;
}

export default function ChartView({ data }: ChartViewProps) {
  const [chartType, setChartType] = useState<ChartType | null>(null);
  const inference = useMemo(() => inferChartType(data), [data]);

  // 首次渲染使用推荐类型
  useEffect(() => {
    setChartType(inference.recommended);
  }, [inference]);

  if (!chartType) return null;

  return (
    <div className="...">
      {/* 图表类型切换栏 */}
      <ChartTypeSwitcher
        current={chartType}
        recommended={inference.recommended}
        available={inference.available}
        onChange={setChartType}
      />
      {/* 图表渲染区域 */}
      {chartType === "bar" && <BarChart data={data} config={inference} />}
      {chartType === "line" && <LineChart data={data} config={inference} />}
      {chartType === "pie" && <PieChart data={data} config={inference} />}
      {/* ... */}
    </div>
  );
}
```

### 8.4 chart-inference.ts 推断逻辑伪码

```typescript
interface ChartInference {
  recommended: ChartType;
  available: ChartType[];    // 可选的其他图表类型
  xColumn: string;           // 推荐的 X 轴字段
  yColumns: string[];        // 推荐的 Y 轴字段
  categoryColumn?: string;   // 分类字段
}

function inferChartType(data: TableData): ChartInference {
  const { columns, rows } = data;

  // 1. 识别列类型
  const dateCols = columns.filter(c => isDateColumn(rows, c));
  const numericCols = columns.filter(c => isNumericColumn(rows, c) && !dateCols.includes(c));
  const categoryCols = columns.filter(c => !dateCols.includes(c) && !numericCols.includes(c));

  // 2. 单行结果 → KPI 卡片
  if (rows.length === 1) return { recommended: "kpi_card", ... };

  // 3. 有日期列 + 数值列 → 折线图
  if (dateCols.length > 0 && numericCols.length > 0) {
    return {
      recommended: "line",
      available: ["line", "area", "bar"],
      xColumn: dateCols[0],
      yColumns: numericCols,
    };
  }

  // 4. 有分类列 + 数值列
  if (categoryCols.length > 0 && numericCols.length > 0) {
    const uniqueValues = getUniqueValues(rows, categoryCols[0]);
    if (uniqueValues.length <= 8) {
      return {
        recommended: "pie",
        available: ["pie", "bar"],
        xColumn: categoryCols[0],
        yColumns: numericCols,
        categoryColumn: categoryCols[0],
      };
    }
    return {
      recommended: "bar",
      available: ["bar", "pie"],
      xColumn: categoryCols[0],
      yColumns: numericCols,
      categoryColumn: categoryCols[0],
    };
  }

  // 5. 两个数值列 → 散点图
  if (numericCols.length >= 2 && categoryCols.length === 0) {
    return {
      recommended: "scatter",
      available: ["scatter", "bar"],
      xColumn: numericCols[0],
      yColumns: [numericCols[1]],
    };
  }

  // 6. 兜底 → 柱形图
  return { recommended: "bar", available: ["bar"], ... };
}
```

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 结构化数据增大 WebSocket 消息体积 | 100行 × 10列 ≈ 5-10 KB，可接受 | 限制最多 100 行数据进入 chartData |
| 图表推断错误（如日期列误识别） | 图表类型不匹配，用户体验差 | 用户可手动切换图表类型；推断算法持续优化 |
| Recharts 与 React 19 兼容性 | 社区已有 Recharts 2.x 支持 React 19 的案例 | 安装前验证 peer dependency |
| 大数据量图表渲染卡顿 | 1000+ 行数据时 Recharts SVG 渲染变慢 | 限制图表最多 100 行；超大数据提示用户 |
| 暗色模式适配 | 图表颜色需跟随主题 | 使用 CSS 变量读取当前主题色 |

---

## 10. 验收标准

### P0 验收

- [ ] 用户在聊天中执行 SQL 查询后，若结果包含可量化的数据，自动展示图表
- [ ] 图表类型自动推断正确率 ≥ 80%（日期→折线，分类≤8→饼图，分类>8→柱形图）
- [ ] 用户可手动切换为其他图表类型（至少支持柱形/折线/饼图/面积图）
- [ ] 用户可在「表格」和「图表」视图之间切换
- [ ] 图表 Hover 显示 Tooltip
- [ ] 图表颜色与 DataNova 设计系统一致
- [ ] 无数据/纯文本结果不展示图表区域

### P1 验收

- [ ] 查询历史页面支持可视化查看
- [ ] 用户可手动选择 X/Y 轴字段
- [ ] 图表可导出为 PNG

### P2+ 验收

- [ ] 指标测试结果支持图表展示
- [ ] 定时查询执行历史支持趋势图
- [ ] 点击图表扇区/柱形可下钻查询
