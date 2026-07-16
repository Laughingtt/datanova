## 概述

DataNova 是一款 AI 驱动的 SQL 数据查询助手，采用专业、数据导向的 UI 设计。设计体系以靛蓝/紫色（Indigo/Purple）为主色调，搭配深色侧边栏、浅色内容区域，界面语言为简体中文。

**核心特征：**
- 靛蓝/紫色主色调（--primary: #4f46e5），专业数据工具风格
- 深色侧边栏（近黑色背景）+ 浅色内容区域的双栏布局
- 分栏布局模式：左侧列表 + 右侧详情/表单
- 详情面板顶部使用 `sunset-stripe` 渐变装饰条
- 全界面简体中文
- SQL 代码块使用深色背景 + 等宽字体

## 色彩体系

### 主色（靛蓝/紫色）

| Token | 用途 |
|---|---|
| `--primary` | 主品牌色（Indigo 600, #4f46e5），用于主按钮、活跃状态、品牌标识 |
| `--primary-soft` | 浅靛蓝背景，用于柔和高亮 |
| `--primary-deep` | 深靛蓝，用于按下状态 |
| `--primary-glow` | 靛蓝辉光效果 |
| `--primary-text` | 主色背景上的文字色 |

### 强调色阶

| Token | 用途 |
|---|---|
| `--accent-100` 至 `--accent-700` | 7 级强调色阶，用于渐变、图表、装饰元素 |
| `--highlight` | 明亮高亮色 |
| `--highlight-soft` | 柔和高亮背景 |

### 表面色

| Token | 用途 |
|---|---|
| `--canvas` | 页面主背景（浅色） |
| `--surface` | 卡片/面板背景 |
| `--surface-raised` | 提升层级的表面 |
| `--surface-code` | 深色代码块背景 |

### 文字色

| Token | 用途 |
|---|---|
| `--ink` | 主要文字（近黑色） |
| `--ink-tint` | 略浅的主要文字 |
| `--charcoal` | 强调文字 |
| `--slate` | 次要文字 |
| `--steel` | 三级文字、说明文字 |
| `--stone` | 柔和标签 |
| `--muted` | 禁用/占位符文字 |
| `--on-dark` | 深色表面上的白色文字 |
| `--on-dark-muted` | 深色表面上降低透明度的白色文字 |
| `--on-surface` | 表面背景上的文字 |

### 侧边栏色

| Token | 用途 |
|---|---|
| `--sidebar-bg` | 近黑色背景 |
| `--sidebar-hover` | 悬停时的白色半透明叠加 |
| `--sidebar-active` | 活跃项的更亮白色叠加 |

### 边框色

| Token | 用途 |
|---|---|
| `--hairline` | 1px 分割线/边框色 |

### 语义色

| Token | 用途 |
|---|---|
| `--success` | 绿色，成功状态 |
| `--warning` | 琥珀色，警告状态 |
| `--error` | 红色，错误状态 |
| `--info` | 蓝色，信息状态 |
| `--info-soft` | 浅蓝色，信息背景 |

### 阴影

| Token | 用途 |
|---|---|
| `--shadow-1` | 微弱阴影 |
| `--shadow-2` | 中等阴影 |
| `--shadow-3` | 较重阴影 |
| `--shadow-glow` | 辉光阴影效果 |

### 圆角

| Token | 用途 |
|---|---|
| `--radius-sm` | 小圆角 |
| `--radius-md` | 中圆角 |
| `--radius-lg` | 大圆角 |
| `--radius-xl` | 超大圆角 |

### 过渡

| Token | 用途 |
|---|---|
| `--transition-fast` | 快速过渡 |
| `--transition-base` | 基础过渡 |
| `--transition-slow` | 慢速过渡 |

## 排版

### 字体

**Inter**（UI 字体）：用于所有界面文字，包括标题、正文、按钮、标签。
- 回退栈：`ui-sans-serif, system-ui, -apple-system, sans-serif`

**等宽字体**（代码）：用于 SQL 代码块和数据展示。
- 回退栈：系统等宽字体栈

### 排版原则

- 所有 UI 文字使用简体中文
- 代码块使用深色背景（`--surface-code`）+ 等宽字体
- 正文保持良好的行高以确保可读性
- 标题层级通过字重和字号区分，不依赖颜色

## 布局

### 整体结构

```
+------------------+----------------------------------------+
|                  |                                        |
|   侧边栏 (280px)  |           主内容区域                     |
|   深色背景        |           浅色背景                       |
|   白色文字        |           全高                           |
|                  |                                        |
+------------------+----------------------------------------+
```

### 侧边栏

- 固定宽度 280px
- 近黑色背景（`--sidebar-bg`）
- 白色/70% 透明度文字
- 8 个导航项，带 emoji 图标
- 悬停：白色/10% 透明度背景叠加
- 活跃项：左侧边框强调色（border-coral）、白色文字、bg-white/10 背景

### 分栏布局模式

多个页面采用统一的分栏布局：

```
+-------------------+-------------------+
|     列表面板       |    详情/表单面板    |
|     (左侧)        |     (右侧)        |
+-------------------+-------------------+
```

使用此模式的页面：
- DatasourcePage（数据源页）
- SchemaPage（模式页）
- MetricsPage（指标页）

### 详情面板装饰

详情面板顶部使用 `sunset-stripe` 渐变装饰条，作为视觉标识元素。

### 页面约定

- 新页面遵循分栏布局：左侧列表面板 + 右侧详情/表单面板
- 详情面板顶部有彩色装饰条
- 表单使用垂直堆叠，间距一致
- 仪表盘为默认着陆页（view: "dashboard"）

## 组件

### 按钮

**主按钮（button-primary）** — 靛蓝背景，白色文字。
- 背景 `--primary`，文字白色，圆角 `--radius-md`

**次按钮（button-secondary）** — 描边样式。
- 透明背景，`--hairline-strong` 边框，圆角 `--radius-md`

### 卡片与容器

**基础卡片** — 标准内容卡片。
- 背景 `--surface`，边框 `--hairline`，圆角 `--radius-lg`

### 聊天组件

**用户消息气泡** — 用户发送的消息。
- 背景 `--user-bubble`

**助手消息块** — AI 助手的回复。
- 背景 `--assistant-bg`，边框 `--assistant-border`

**SQL 代码块** — SQL 查询展示。
- 深色背景 `--surface-code`，等宽字体

### 数据展示

**数据表格** — 基于 TanStack Table 的标准表格样式。

**图表** — 基于 Recharts，通过 `ChartRenderers.tsx` 共享渲染逻辑，用于聊天结果和仪表盘。

### 导航

**侧边栏导航项** — 深色背景上的导航链接。
- 默认：白色/70% 文字
- 悬停：白色/10% 背景叠加
- 活跃：左侧边框强调色、白色文字、bg-white/10 背景

## 页面层级

```
App.tsx (视图切换器)
  ├── OnboardingWizard (未完成引导时显示)
  └── Layout.tsx
        ├── Sidebar.tsx (导航项，全中文)
        └── 视图页面:
              Dashboard/DashboardPage.tsx
              Chat/ChatWindow.tsx
              Datasource/DatasourcePage.tsx
              Schema/SchemaPage.tsx
              Metrics/MetricsPage.tsx
              Analysis/AnalysisPage.tsx
              Scheduled/ScheduledPage.tsx
              Dictionary/DictionaryPage.tsx
              History/QueryHistoryPage.tsx
              Insights/InsightsPage.tsx
              Reports/ (报表组件)
              Onboarding/OnboardingWizard.tsx
```

### 视图类型

AppView 类型定义：`"dashboard" | "chat" | "datasources" | "schemas" | "metrics" | "analysis" | "dictionary" | "queryHistory" | "insights"`

默认视图：`"dashboard"`

## 设计原则

### 应该做的

- 保持 `--primary`（靛蓝色）用于主按钮、活跃状态和品牌标识
- 新页面使用分栏布局（左侧列表 + 右侧详情）
- 详情面板顶部使用 `sunset-stripe` 渐变装饰条
- 所有新增 UI 文字使用简体中文
- 卡片使用 `--surface` 背景 + `--hairline` 边框 + `--radius-lg` 圆角
- SQL 代码块使用深色背景 `--surface-code` + 等宽字体
- 图表使用 `ChartRenderers.tsx` 共享组件保持一致性

### 不应该做的

- 不要使用与靛蓝/紫色主色调冲突的强调色
- 不要在侧边栏使用浅色背景（保持深色一致性）
- 不要在非代码场景使用等宽字体
- 不要在 UI 文字中使用英文（保持全中文）
- 不要在卡片上使用过重的阴影（保持扁平专业风格）
- 不要偏离分栏布局模式（保持页面间一致性）

## 已知不足

- 深色模式尚未定义完整的 token 值
- 动画/过渡时间未系统化提取，建议悬停/聚焦状态使用 150-200ms ease
- 表单验证成功状态未显式定义
- 响应式断点策略未文档化
