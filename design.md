# DataNova 前端设计规范（Design System）

> 本文件是 DataNova 前端唯一的设计基线。整体视觉语言对齐开源项目
> [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 的 shadcn「base-nova」风格：
> 纯白画布、近黑文字、柔和蓝色主色、细边框卡片、紧凑控件、克制动效。
>
> 新增页面 / 组件前请先读本文件；涉及颜色、圆角、间距、动效时**只使用本文定义的 token 与组件类**，
> 不要在业务代码里写死十六进制色值或自创样式体系。

---

## 1. 设计原则

| 原则 | 说明 |
|---|---|
| **白色画布** | 页面背景永远是纯白，层级靠 1px 边框和极浅中性色区分，不靠大面积色块。 |
| **一个主色** | 蓝色 `--primary` 只用于「当前可执行的主要动作」、选中态和关键数据，一屏内尽量只有一个实心主按钮。 |
| **细边框 + 小阴影** | 卡片 = 白底 + `1px --border` + `--shadow-xs`；阴影只做轻微托起，不做厚重投影。 |
| **紧凑控件** | 按钮、输入框、下拉统一 `h-8`；圆角 `rounded-lg`（≈0.8rem），卡片 `rounded-xl`。 |
| **中性优先** | 装饰性颜色只出现在图标、徽标、图表、语义状态中；正文与结构一律中性灰阶。 |
| **动效克制** | 100–400ms，位移不超过 12px；只用于入场、展开、反馈，不炫技；尊重 `prefers-reduced-motion`。 |
| **全中文界面** | 所有面向用户的文案使用简体中文；SQL、表名、字段名、聚合函数等专业标识保留英文。 |

---

## 2. 字体 Typography

### 2.1 字体族

| 用途 | 字体栈 | CSS |
|---|---|---|
| 正文 / 标题 / 界面 | **Public Sans** → 系统字体 → 中文字体 | `font-family: "Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif` |
| 代码 / SQL / 数字列 | **Geist Mono** → 系统等宽字体 | `font-mono`（`"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace`） |

- 全局基准字号 `14px`，行高 `1.5`；body 使用 `antialiased`。
- 标题字重 `600`，字距 `-0.011em`（`h1`–`h6` 统一）。
- 代码块、SQL、ID、阈值、时间等用 `font-mono`。

### 2.2 字号阶梯（Tailwind `fontSize`）

| Token | 字号 / 行高 | 典型用途 |
|---|---|---|
| `text-xs` (12px) | 12 / 16 | 元信息、徽标、卡片副标题、表头 |
| `text-sm` (14px) | 14 / 20 | **界面默认**：按钮、输入、正文、导航 |
| `text-base` (16px) | 16 / 24 | 长文段落（少用） |
| `text-lg` (18px) | 18 / 28 | 分区标题 |
| `text-xl` (20px) | 20 / 28 | 卡片大数字、弹窗标题 |
| `text-2xl` (24px) | 24 / 32 | **页面主标题**（`h2`） |
| `text-3xl` (30px) | 30 / 36 | 欢迎页 / 品牌区（少用） |

扩展 token：`text-caption`（13px）、`text-micro`（11px）；以及配置中的 `heading-*`、`body-*`、`display-*`（营销页使用）。

### 2.3 层级写法

```tsx
<h2 className="text-2xl font-semibold text-[var(--foreground)]">指标管理</h2>
<p  className="text-sm text-[var(--muted-foreground)] mt-1">定义业务指标、维度和语义模型</p>
<span className="text-xs text-[var(--muted-foreground)]">3 条记录</span>
```

- 一级标题：`text-2xl font-semibold`
- 二级 / 卡片标题：`text-sm font-semibold`（必要时 `font-body`）
- 正文：`text-sm`
- 辅助文字：`text-xs text-[var(--muted-foreground)]`

---

## 3. 色彩 Colors

所有颜色定义在 `packages/web/src/styles/globals.css` 的 `:root`（亮色）与 `.dark`（暗色），
并在 `tailwind.config.js` 中映射为 Tailwind 颜色，**业务代码只引用变量**。

### 3.1 核心表面与文字

| Token | 亮色值 | 用途 |
|---|---|---|
| `--background` | `#ffffff` | 页面画布 |
| `--foreground` | `#0a0a0a` | 主文字 |
| `--card` / `--popover` | `#ffffff` | 卡片、浮层 |
| `--muted` | `#f5f5f5` | 次级底色、标签轨道、悬停底色 |
| `--muted-foreground` | `#606060` | 次要文字（≥ 14px 时使用） |
| `--border` / `--input` | `#e8e8e8` | 分隔线、边框、输入框描边 |
| `--ring` | `#42a6ff` | 聚焦光环 |
| `--sidebar` | `#fcfcfc` | 侧边栏底色 |

辅助文字灰阶（保留的语义别名）：`--ink #0a0a0a`、`--charcoal #404040`、`--slate #525252`、
`--steel #606060`、`--stone #8f8f8f`。**正文不要用 `--stone`**（对比度不足），仅用于极小的元信息。

### 3.2 主色与蓝色阶

| Token | 值 | 用途 |
|---|---|---|
| `--primary` | `#3ea4ec` | 主按钮、选中态、关键数据 |
| `--primary-deep` | `#2b8fd4` | 悬停 / 深一档 |
| `--primary-strong` | `#1a7ec3` | 按下 / 强调文字 |
| `--primary-soft` | `#e8f4fd` | 选中背景、浅蓝底 |
| `--primary-text` | `#0276ea` | 蓝色链接文字（保证对比度） |
| `--accent-100…700` | `#dceffb → #2b8fd4` | 图表次级色、渐变端点（少用） |

### 3.3 语义色

| Token | 亮色值 | 浅底 | 用途 |
|---|---|---|---|
| `--success` | `#009966` | `--success-soft #e6f5f0` | 成功、已发布、启用 |
| `--warning` | `#d08700` | `--warning-soft #fbf3e6` | 警告、草稿、待处理 |
| `--error` | `#e7000b` | `--error-soft #fde8e9` | 错误、失败、危险操作 |
| `--info` | `#0084d1` | `--info-soft #e6f3fb` | 提示、信息 |
| `--highlight` | `#f59e0b` | `--highlight-soft #fffbeb` | 收藏、重点标记 |

语义色永远「深色文字 + 极浅同色底」组合（见 `.badge-soft`），禁止大面积饱和填充。

### 3.4 图表色板

`--chart-1…5`：`#35a9ff`、`#00a9b3`、`#9095e8`、`#d068d8`、`#20b46b`。
统一由 `utils/chart-inference.ts` 的 `CHART_COLORS` 输出；坐标轴 `--muted-foreground`，
网格线 `--border`，Tooltip 使用 `--popover` + `--border` + `--shadow-2`。

### 3.5 使用规范

- 颜色一律通过 CSS 变量 / Tailwind token 引用：

```tsx
// ✅
<div className="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]" />
<div className="text-[var(--muted-foreground)]" />

// ❌ 硬编码
<div className="bg-white text-[#0a0a0a] border border-[#e8e8e8]" />
```

- **Tailwind 3 注意**：不要对 CSS 变量使用透明度修饰符（`bg-[var(--muted)]/40` 不会产出任何 CSS）。
  需要透明度时使用 `color-mix`：

```tsx
// ✅
<div className="bg-[color-mix(in_srgb,var(--muted)_40%,transparent)]" />
<div className="ring-[color-mix(in_srgb,var(--ring)_40%,transparent)]" />
```

---

## 4. 背景与表面 Backgrounds

| 区域 | 规则 |
|---|---|
| 应用画布 | `--background` 纯白，无渐变、无纹理、无装饰条 |
| 侧边栏 | `--sidebar`（`#fcfcfc`），右侧 `1px --sidebar-border` |
| 顶栏 | 白底，底部 `1px --border`，高 `48px`（`h-12`），全宽 |
| 卡片 / 面板 | `--card` 白底 + `1px --border` + `--shadow-xs` |
| 浮层（下拉 / 弹窗） | `--popover` + `1px --border` + `--shadow-3` |
| 代码块 | `--surface-code`（深色）或 `--muted` 浅底 + `font-mono` |
| 空状态容器 | 透明底 + `border-dashed border-[var(--border)] rounded-xl` |
| 遮罩 | `rgba(0,0,0,.32)` + 轻 `backdrop-blur`，仅用于 dialog / drawer |

不使用：
- 大面积渐变背景、噪点纹理、插画背景；
- 旧的品牌渐变条（原 `.sunset-stripe` 已删除）；
- 纯色大色块铺底。

---

## 5. 圆角、阴影、间距

### 5.1 圆角（`--radius: 1rem`）

| Tailwind | 计算值 | 用途 |
|---|---|---|
| `rounded-md` | 0.8rem | 菜单项、小标签、图表切换按钮 |
| `rounded-lg` | 1rem | **按钮、输入框、下拉、tab 轨道** |
| `rounded-xl` | 1.4rem | **卡片、弹窗、表格容器** |
| `rounded-full` | 9999px | 徽标、头像、状态点 |

### 5.2 阴影

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(10,10,10,.05)` | 卡片、按钮默认 |
| `--shadow-2` | `0 4px 12px rgba(10,10,10,.06)` | 卡片悬停、下拉 |
| `--shadow-3` | `0 12px 32px -8px rgba(10,10,10,.14)` | 弹窗、Popover |
| `--shadow-glow` | `0 0 0 3px rgba(66,166,255,.28)` | 聚焦光环 |

### 5.3 间距

- 采用 4px 基准：`gap-1 (4) / gap-2 (8) / gap-3 (12) / gap-4 (16) / gap-5 (20) / gap-6 (24) / gap-8 (32)`。
- 页面内容：`px-8 py-8`，最大宽度 `max-w-[1400px] mx-auto`。
- 卡片内边距：`p-4`（`.card-base` 默认）或 `p-5`（信息密集卡片）。
- 表单字段纵向间距 `space-y-4`；字段标签与控件间距 `mb-1.5`。
- 列表项：`px-4 py-3`；表格单元格：`px-4 py-3`。

---

## 6. 组件规范 Components

> 以下类均定义在 `globals.css` 的 `@layer components`，直接使用，不要重复实现。

### 6.1 按钮

| 类 | 外观 | 使用场景 |
|---|---|---|
| `.btn-primary` | 实心 `--primary` 白字 | 页面唯一主操作（保存、执行、创建） |
| `.btn-secondary` | 白底 + `--border` 描边 | 次要操作、工具栏、AI 辅助动作 |
| `.btn-ghost` | 透明底，悬停 `--muted` | 图标按钮、行内操作、取消 |
| `.btn-danger` | `--error` 10% 浅底 + 红字 | 删除、移除、危险确认 |
| `.btn-dark` | 中性灰底 + 蓝字 | New API 风格 pill（少用） |

通用规格：`h-8 px-2.5 rounded-lg text-sm font-medium gap-1.5`；
悬停 `150ms`，按下 `translateY(1px)`，聚焦 `3px` 蓝色 ring，禁用 `opacity .5`。

```tsx
<button className="btn-primary">执行查询</button>
<button className="btn-secondary"><Icon /> AI 推荐指标</button>
<button className="btn-ghost text-xs">刷新</button>
<button className="btn-danger text-xs">移除</button>
```

规则：
- 一屏 / 一个区块内**最多一个** `.btn-primary`。
- 图标按钮使用 `p-1 rounded-md hover:bg-[var(--muted)]`，并加 `title`（中文）。
- 按钮文案 2–6 个汉字，动词开头（保存、新增、刷新、导出）。

### 6.2 输入与表单

- 控件：`.input-field`（`h-8 rounded-lg`，1px `--input` 描边，聚焦蓝色 ring）。
- 提示气泡 / 组合输入区：`.input-well`（`focus-within` 生效）。
- 字段标签：`.label-mono`（`text-sm font-medium`，**不要大写、不要字距**）。
- 占位符：`--muted-foreground`，中文提示；SQL 示例可用英文。
- 多行输入：在 `.input-field` 基础上 `h-auto py-2 resize-y`。
- 下拉：原生 `select` + `.input-field`，右侧自绘 chevron（`pointer-events-none`）。
- 复选框 / 单选：`accent` 使用 `--primary`，尺寸 14–16px。

```tsx
<label className="label-mono">显示名称</label>
<input className="input-field" placeholder="例如：成交总额" />
```

### 6.3 卡片

```tsx
<div className="card-base">…</div>
```

- 标准卡片：白底、1px 边框、`rounded-xl`、`p-4`、`--shadow-xs`。
- 可交互卡片：`hover:shadow-2 transition-shadow`，可选 `hover:border-[var(--hairline-strong)]`。
- 列表选中项：`bg-[var(--accent)]`（浅蓝）+ 无边框，**不要**用蓝色描边。
- 指标 / 统计卡（`.stat-card`）：上方 `size-9 rounded-lg` 图标 chip，下方数值 `text-2xl font-semibold`，说明 `text-xs`。
- 卡片内分区标题：`text-sm font-semibold mb-3/4`。

### 6.4 标签页 Tabs

```tsx
<div className="tabs-track">
  <button className="tab-trigger" data-active={active === "metrics"}>指标</button>
  <button className="tab-trigger" data-active={active === "dimensions"}>维度</button>
</div>
```

- 轨道 `--muted` + `p-[3px]` + `rounded-lg`；激活项白底 + `--shadow-xs` + `rounded-md`。
- 切换用 `data-active="true"`（不是 `.active`），便于无障碍与测试。
- 顶部频道页签（智能问数 / 指标开发）同用此结构。
- 页面级导航不要用下划线 tab，统一使用「药丸」轨道。

### 6.5 徽标 Badge

```tsx
<span className="badge-soft bg-[var(--success-soft)] text-[var(--success)]">已发布</span>
<span className="badge-soft bg-[var(--warning-soft)] text-[var(--warning)]">草稿</span>
<span className="badge-soft bg-[var(--muted)] text-[var(--muted-foreground)]">MySQL</span>
```

- 高度 20px，`rounded-full`，`text-xs font-medium`，透明边框。
- 只使用语义浅底 + 深色文字；禁止实心高饱和徽标。

### 6.6 表格

- 容器：`rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--card)]`。
- 表头：`text-xs text-[var(--muted-foreground)] bg-[var(--muted)]` 或白底 + 底部边框；**不要**大写。
- 行：`border-b border-[var(--border)] last:border-0`，悬停 `hover:bg-[var(--muted)]`。
- 单元格：`px-4 py-3 text-sm`；数值右对齐并用 `font-mono`。
- 空表：使用虚线空状态，而不是空 `<tbody>`。

### 6.7 弹窗 / 抽屉

- 遮罩：`bg-black/32 backdrop-blur-[2px]`，点击可关闭。
- 弹窗：`bg-[var(--popover)] rounded-xl border border-[var(--border)] shadow-[var(--shadow-3)] ring-1 ring-[color-mix(in_srgb,var(--foreground)_8%,transparent)]`，`p-6`，最大宽 `560px`。
- 标题 `text-xl font-semibold`，描述 `text-sm text-[var(--muted-foreground)]`。
- 底部操作右对齐：次要键 `.btn-secondary` / 取消 `.btn-ghost`，主操作 `.btn-primary`。
- 侧边抽屉（如定时查询）：右侧 `width: 520px`，白底，左侧 1px 边框，顶部标题 + 关闭。

### 6.8 空状态

```tsx
<div className="border border-dashed border-[var(--border)] rounded-xl p-8 text-center">
  <div className="size-10 rounded-lg bg-[var(--muted)] flex items-center justify-center mx-auto mb-3">
    <svg className="h-5 w-5 text-[var(--muted-foreground)]" … />
  </div>
  <p className="text-sm font-medium text-[var(--foreground)]">暂无收藏报表</p>
  <p className="text-xs text-[var(--muted-foreground)] mt-1">点击「添加收藏」或从热门查询中收藏</p>
</div>
```

- 结构：虚线容器 → 40px 中性图标 chip → 主文案 → 辅助说明 → 可选操作。
- 图标只用中性灰，不使用彩色插画。
- 统一组件：`components/common/EmptyState.tsx`。

### 6.9 导航壳 Layout

- 顶栏：高 `48px`，全宽白底，左侧边栏折叠按钮 + 品牌，右侧全局搜索（`⌘K`）、状态灯。
- 侧边栏：宽 `208px`（可折叠至 0），底色 `--sidebar`，分组标题 `text-xs --stone`，
  导航项 `h-8 rounded-lg px-3 text-sm`，悬停 `--sidebar-hover`，选中 `--sidebar-active` + `--sidebar-accent-foreground`。
- 快捷键 `Ctrl/Cmd + B` 折叠侧边栏。
- 内容区独立滚动，页面容器 `h-full overflow-auto bg-[var(--background)]`。

### 6.10 对话界面

- 用户消息：`--user-bubble` 中性浅灰圆角气泡，右对齐，无阴影。
- 助手消息：透明底、无边框，直接排版（markdown）。
- SQL 块：深色 `--surface-code` 或浅灰底 + `font-mono text-xs`，支持复制。
- 工具步骤：左侧时间线，`--border` 连接线，节点 `size-6` 中性 chip。
- 数据结果：表格 / 图表二选一，使用 `.tabs-track` 切换（表格 / 图表）。
- 输入区：`.input-well`，底部提示「Enter 发送 · Shift+Enter 换行」，发送按钮 `size-8 rounded-lg bg-[var(--primary)]`。

---

## 7. 动效与交互 Motion

所有动效封装在 `packages/web/src/utils/gsap-presets.ts` 与 `hooks/useGsapAnimations.ts`，统一参数：

### 7.1 时长与缓动

```ts
EASE = { smooth: "power2.out", snappy: "power3.out", entrance: "power2.out", exit: "power2.in", … }
DUR  = { instant: .15, fast: .25, normal: .4, slow: .6, modal: .3, collapse: .3, stagger: .06, countUp: 1.2 }
```

- 交互反馈（悬停、按下、聚焦）：`150ms`，使用 CSS `transition`。
- 入场：`400ms`，`power2.out`，位移 `8–12px` + 透明度。
- 退场：`250–300ms`，`power2.in`。
- 弹窗：`300ms`，缩放 `0.98 → 1` + 位移 `8px`。
- 列表 stagger：每项 `60ms`，最多 8 项后不再递增。
- 数字滚动（`countUp`）：`1.2s`。

### 7.2 常用效果

| 名称 | 实现 | 说明 |
|---|---|---|
| 页面入场 | `.animate-in`（CSS keyframes） | 透明度 + 上移 12px + 轻微 blur，`450ms` |
| 延迟阶梯 | `.delay-1…4`（80ms 递增） | 卡片依次出现 |
| 骨架屏 | `.shimmer-bg` / `.skeleton-shimmer` | 1.8s 循环渐变 |
| 展开 / 收起 | `useCollapseAnimation` | 高度 + 透明度，`300ms` |
| 下拉菜单 | `useDropdownAnimation` | `autoAlpha + y(-4) + scaleY(.95)` |
| 按钮按压 | CSS `active:translate-y-px` / `useButtonPress` | 位移 1px |
| 数字滚动 | `useCountUp` / `countUp()` | 从 0 到目标值 |

### 7.3 无障碍与降级

- 必须检查 `prefers-reduced-motion`：动画时长置 0、直接渲染最终状态。
- **重要**：`countUp` 在 reduced-motion 下必须直接写入最终数字（否则会停留在占位的 `0`）。
- 所有纯动画元素加 `aria-hidden`；加载态提供可读文字。
- 焦点可见：`focus-visible` 使用 3px `--ring` 半透明光环，不允许 `outline: none` 且无替代。

### 7.4 禁止

- 弹跳 / 旋转超过 2 圈的装饰动画；
- 自动播放的循环动画（骨架屏除外）；
- 超过 600ms 的界面过渡；
- 用动效替代加载反馈。

---

## 8. 图表 Visualization

- 使用 Recharts，统一封装在 `components/ChartRenderers.tsx`，聊天结果与看板共用。
- 色板：`CHART_COLORS`（`--chart-1…5` + `--accent-300/400/500`）。
- 折线 / 面积：`strokeWidth 2`，无点（`dot={false}`，悬停显示）。
- 网格：仅横向 `--border` 虚线；坐标轴无轴线，仅保留 `text-[10px] --muted-foreground` 标签。
- Tooltip：白底、1px 边框、`rounded-md`、`--shadow-2`、`text-xs`。
- 饼图：环形（`innerRadius`），扇区间白描边 `--card`，图例在底部。
- KPI / 趋势柱：柱子使用 `--primary`，底盘 `--muted`，高度用百分比时**必须放在 `relative flex-1` 容器内绝对定位**，避免撑破卡片。
- 图表卡片：`.card-base`；切换器使用 `.tabs-track` + `.tab-trigger`（饼图 / 柱状图）。

---

## 9. 页面布局模式

### 9.1 标准管理页（数据源、指标、技能、历史）

```
页面标题（text-2xl） + 一句话说明          右侧主操作（1 个 btn-primary）
─────────────────────────────────────────────────────────────
[筛选 / 分类侧栏 240–280px]  |  [列表 + 详情 双栏]
```

- 左列表：`w-[280px] shrink-0`，列表项卡片 `rounded-xl`，选中 `bg-accent`。
- 右详情：`.card-base`，标题 + 表单 / 内容。
- 列表与详情之间 `gap-6`。

### 9.2 数据概览 / 洞察

```
标题 + 状态摘要
[统计卡 ×3/4，grid-cols-3/4 gap-5]
[趋势图 card]  [状态卡 card]
[最近查询表格 card]
```

- 统计卡等宽，`text-2xl` 数字 + `text-xs` 说明。
- 趋势图与右侧状态卡同高（grid 行拉伸）。

### 9.3 对话页

```
[会话侧栏 240px] | [频道页签 + 数据源/模型选择器]
                 | [消息流 flex-1]
                 | [输入框 固定底部]
```

- 输入区与消息流之间 1px 分隔线。
- 空对话展示 `EmptyState`（图标 + 标题 + 说明），不显示欢迎大图。

### 9.4 自助分析

```
[最近查询侧栏 240px] | [工具栏：数据源 / 模型 / 定时查询]
                    | [SQL 编辑器 card]
                    | [结果区：表格 / 图表 / 空状态]
```

---

## 10. 文案与可访问性

- **全中文**：按钮、标题、占位符、空状态、错误提示、`title` / `aria-label`。
  例外：SQL、表名、字段名、`SUM/AVG/COUNT`、`MySQL`、`Agent Trace` 等专有名词。
- 术语统一：
  - 数据源 / Schema 标注 / 指标管理 / 查询技能 / 语义层目录 / SQL 历史 / 数据洞察 / Agent 追踪
  - 指标类型：原子指标、单表聚合、衍生指标、复合指标
  - 状态：草稿、已发布、已弃用、已启用、未启用
- 按钮文案：动词 + 对象（「新建对话」「添加数据源」「保存并执行」）。
- 数字使用 `toLocaleString()`（`1,284`），百分比保留 1 位小数。
- 对比度：正文 ≥ 4.5:1；`--muted-foreground` 只用于 ≥ 12px 的辅助信息。
- 图标按钮必须有 `title` 或 `aria-label`；表单控件必须有 `<label>`。
- 键盘可达：所有交互元素可聚焦，弹窗支持 `Esc` 关闭，焦点环不可移除。

---

## 11. 实现约定（工程侧）

| 约定 | 说明 |
|---|---|
| 设计 token 入口 | `packages/web/src/styles/globals.css` |
| Tailwind 映射 | `packages/web/tailwind.config.js` |
| 通用组件类 | `.btn-*`、`.card-base`、`.stat-card`、`.tabs-track/.tab-trigger`、`.badge-soft`、`.input-field`、`.input-well`、`.label-mono`、`.bubble-*`、`.animate-in`、`.shimmer-bg` |
| 动效工具 | `utils/gsap-presets.ts`、`hooks/useGsapAnimations.ts` |
| 图表 | `components/ChartRenderers.tsx`、`utils/chart-inference.ts` |
| 布局壳 | `components/Layout.tsx`、`App.tsx` |
| 空状态 | `components/common/EmptyState.tsx` |
| 图标 | 内联 SVG（Heroicons 线性风格），`strokeWidth 1.5`，默认 `h-4 w-4` / `h-5 w-5`，颜色继承 `currentColor` |
| 前端端到端测试 | 使用 `agent-browser` skill（CDP），不使用 Playwright / Puppeteer |

### 11.1 新增组件检查清单

- [ ] 颜色全部来自 CSS 变量 / Tailwind token，无硬编码十六进制
- [ ] 控件高度 `h-8`，圆角 `rounded-lg`；卡片 `rounded-xl`
- [ ] 一屏仅一个 `.btn-primary`
- [ ] 文案中文，技术标识除外
- [ ] 悬停 / 聚焦 / 按下 / 禁用四态齐全
- [ ] `prefers-reduced-motion` 有降级
- [ ] 空状态使用虚线 + 中性图标 chip
- [ ] 深色模式（`.dark`）下变量自动生效
- [ ] 不使用 `bg-[var(--x)]/40` 这类无效透明度写法
- [ ] 通过 `npx tsc --noEmit`

---

## 12. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-21 | 建立设计基线：全站替换为 New API（shadcn base-nova）视觉语言，统一字体、色彩、圆角、阴影、按钮、标签页、卡片、弹窗、空状态与动效；新增本文件。 |
