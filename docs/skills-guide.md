# Claude Code Skills 使用指南

本文档记录了项目中已安装的所有 Claude Code Skills，包括用途说明和使用方式。

## 什么是 Skills

Skills 是 Claude Code 的扩展能力模块，通过 `.agents/skills/` 目录下的 `SKILL.md` 文件定义。Claude 会根据对话内容自动匹配并激活相关技能，也可以通过 `/skill-name` 手动调用。

## 安装来源

| 来源 | 安装命令 |
|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `npx skills@latest add mattpocock/skills` |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `npx skills add https://github.com/Leonxlnx/taste-skill` |

---

## 技能分类索引

### 🎨 UI / 设计类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **design-taste-frontend** | `/design-taste-frontend` | 反模板化前端设计，适用于落地页、作品集、重设计项目。自动推断设计方向，审计先行 |
| **design-taste-frontend-v1** | `/design-taste-frontend-v1` | v1 版本，仅用于需要向后兼容的场景 |
| **brandkit** | `/brandkit` | 高端品牌视觉生成：品牌指南板、Logo 系统、视觉世界展示。支持极简/电影感/编辑风/暗黑科技/奢华等风格 |
| **high-end-visual-design** | `/high-end-visual-design` | 高端视觉设计规范：字体、间距、阴影、卡片结构、动画，让网站看起来昂贵而非廉价 |
| **minimalist-ui** | `/minimalist-ui` | 极简编辑风格界面：暖色单色调、排版对比、扁平 bento 网格、柔和粉彩，无渐变无重阴影 |
| **industrial-brutalist-ui** | `/industrial-brutalist-ui` | 工业粗野主义：瑞士印刷排版 + 军事终端美学，刚性网格、极端字号对比、模拟退化效果 |
| **gpt-taste** | `/gpt-taste` | 精英 UX/UI + GSAP 动效工程：Python 驱动随机布局、AIDA 页面结构、宽编辑排版、无缝 bento 网格 |
| **stitch-design-taste** | `/stitch-design-taste` | Google Stitch 语义设计系统：生成 DESIGN.md，强制高端反通用 UI 标准 |
| **redesign-existing-projects** | `/redesign-existing-projects` | 升级现有网站/应用至高端品质：审计当前设计、识别通用 AI 模式、应用高端设计标准 |
| **frontend-ui-engineering** | `/frontend-ui-engineering` | 生产级 UI 构建：组件、布局、状态管理，输出需要看起来是生产级而非 AI 生成 |

### 🖼️ 图像生成类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **imagegen-frontend-web** | `/imagegen-frontend-web` | Web 端设计参考图生成：每个 section 单独一张图，强制构图多样性，适用于落地页和营销站 |
| **imagegen-frontend-mobile** | `/imagegen-frontend-mobile` | 移动端设计参考图生成：iOS/Android 屏幕概念和流程，iPhone 模型框内展示 |
| **image-to-code** | `/image-to-code` | 图像转代码：先生成设计图，深度分析后实现匹配的网站代码 |

### 🏗️ 架构 / 设计类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **codebase-design** | `/codebase-design` | 深度模块设计词汇表：设计/改进模块接口、寻找深化机会、决定接缝位置、提高可测试性 |
| **design-an-interface** | `/design-an-interface` | 并行子代理生成多个截然不同的接口设计方案，比较模块形状 |
| **domain-modeling** | `/domain-modeling` | 构建和精炼项目领域模型：确定领域术语、统一语言、记录架构决策 |
| **ubiquitous-language** | `/ubiquitous-language` | 提取 DDD 风格的统一语言词汇表，标记歧义并建议规范术语，保存到 UBIQUITOUS_LANGUAGE.md |
| **improve-codebase-architecture** | `/improve-codebase-architecture` | 扫描代码库寻找深化机会，生成可视化 HTML 报告，然后逐个深入讨论 |
| **setup-ts-deep-modules** | `/setup-ts-deep-modules` | 配置 dependency-cruiser，使每个 TypeScript 包成为深度模块 |

### 🐛 调试 / 质量类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **diagnosing-bugs** | `/diagnosing-bugs` | 硬 Bug 和性能回归的诊断循环：系统化根因分析，而非猜测 |
| **debugging-and-error-recovery** | `/debugging-and-error-recovery` | 系统化根因调试指南：测试失败、构建中断、行为异常时使用 |
| **code-review** | `/code-review` | 双轴代码审查：Standards（编码规范）+ Spec（需求匹配），并行子代理运行 |
| **code-review-and-quality** | `/code-review-and-quality` | 多轴代码审查：合并前评估代码质量，适用于自己/其他代理/人类写的代码 |
| **performance-optimization** | `/performance-optimization` | 应用性能优化：性能需求、回归怀疑、Core Web Vitals 或加载时间改进 |
| **qa** | `/qa` | 交互式 QA 会话：用户对话式报告 Bug，代理自动搜索代码库并创建 GitHub Issue |

### 🧪 测试 / TDD 类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **tdd** | `/tdd` | 测试驱动开发：红-绿-重构循环，功能开发或 Bug 修复均可使用 |
| **scaffold-exercises** | `/scaffold-exercises` | 创建练习目录结构：章节、问题、解决方案、解释器，通过 lint 检查 |
| **migrate-to-shoehorn** | `/migrate-to-shoehorn` | 将测试文件中的 `as` 类型断言迁移到 @total-typescript/shoehorn |

### 📋 规划 / 任务类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **planning-and-task-breakdown** | `/planning-and-task-breakdown` | 将工作拆分为有序任务：需求明确后拆分为可实施的任务，估算范围，识别并行工作 |
| **spec-driven-development** | `/spec-driven-development` | 先写规格再编码：新项目/功能/重大变更时，需求不清晰或模糊时使用 |
| **prototype** | `/prototype` | 构建一次性原型验证设计问题：状态模型、逻辑、UI 外观探索 |
| **wayfinder** | `/wayfinder` | 规划大型工作：将工作映射为决策票据，逐个解决直到路径清晰 |
| **to-spec**to-spec** | `/to-spec` | 将当前对话合成为规格文档，发布到项目 Issue 跟踪器 |
| **to-tickets** | `/to-tickets` | 将计划/规格/对话拆分为追踪子弹票据，声明阻塞关系 |
| **request-refactor-plan** | `/request-refactor-plan` | 通过用户访谈创建详细重构计划，拆分为安全增量步骤，提交为 GitHub Issue |
| **implement** | `/implement` | 根据规格或票据实施工作 |

### 🔥 审问 / 访谈类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **grilling** | `/grilling` | 无情审问：压力测试计划、决策或想法 |
| **grill-me** | `/grill-me` | 无情访谈：锐化计划或设计 |
| **grill-with-docs** | `/grill-with-docs` | 无情访谈 + 文档：审问同时创建 ADR 和词汇表 |
| **batch-grill-me** | `/batch-grill-me` | 批量审问：一次性提出所有前沿问题，逐轮进行 |
| **interview-me** | `/interview-me` | 提取用户真正需求：一次一个问题访谈，直到 ~95% 确信底层意图 |
| **loop-me** | `/loop-me` | 审问工作流规格：针对要构建的工作流进行规格审问 |
| **to-questionnaire** | `/to-questionnaire` | 将无法完全回答的决策转为问卷，让其他人填写 |

### 🔀 Git / 工具类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **resolving-merge-conflicts** | `/resolving-merge-conflicts` | 解决进行中的 git merge/rebase 冲突 |
| **git-guardrails-claude-code** | `/git-guardrails-claude-code` | 设置 Claude Code hooks 阻止危险 git 命令（push、reset --hard、clean、branch -D 等） |
| **setup-pre-commit** | `/setup-pre-commit` | 设置 Husky pre-commit hooks：lint-staged (Prettier)、类型检查、测试 |
| **full-output-enforcement** | `/full-output-enforcement` | 强制完整输出：覆盖 LLM 截断行为，禁止占位符模式，处理 token 限制分割 |

### 📝 写作 / 文档类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **research** | `/research` | 调查研究：针对高可信度一手资料研究问题，将发现保存为 Markdown 文件 |
| **edit-article** | `/edit-article` | 编辑改进文章：重构章节、提高清晰度、精炼文字 |
| **writing-beats** | `/writing-beats` | 写作-利用：将原始素材组装为节奏旅程，每个术语在使用前先定义 |
| **writing-fragments** | `/writing-fragments` | 写作-探索：挖掘原始片段，暂无结构 |
| **writing-shape** | `/writing-shape` | 写作-利用：将原始素材逐段塑造成文章 |
| **obsidian-vault** | `/obsidian-vault` | 搜索、创建和管理 Obsidian 笔记：wikilinks 和索引笔记 |

### 🔄 协作 / 交接类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **handoff** | `/handoff` | 将当前对话压缩为交接文档，供另一个代理接手 |
| **claude-handoff** | `/claude-handoff` | 将当前对话交接给新的后台代理，立即继续工作 |
| **triage** | `/triage` | Issue 和外部 PR 状态机流转：分类、验证、审问、编写代理就绪简报 |
| **teach** | `/teach` | 在工作区内教授用户新技能或概念 |

### 🛠️ 项目设置类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **setup-matt-pocock-skills** | `/setup-matt-pocock-skills` | 配置工程技能：设置 Issue 跟踪器、分类标签词汇、领域文档布局。首次使用前运行一次 |
| **wizard** | `/wizard` | 生成交互式 bash 向导：引导人类完成手动流程（第三方设置、一次性迁移等） |
| **writing-great-skills** | `/writing-great-skills` | 编写优秀技能的参考：让技能可预测的词汇和原则 |

### 🗺️ 导航类

| 技能 | 调用方式 | 说明 |
|---|---|---|
| **ask-matt** | `/ask-matt` | 技能路由器：询问哪个技能或流程适合你的情况 |

---

## 使用方式

### 1. 自动激活

Claude 会根据对话内容自动匹配并激活相关技能。例如：
- 说 "debug this" → 自动激活 `diagnosing-bugs`
- 说 "review this code" → 自动激活 `code-review`
- 说 "design a landing page" → 自动激活 `design-taste-frontend`

### 2. 手动调用

在对话中输入 `/技能名` 直接调用，例如：
```
/tdd
/grilling
/research
```

### 3. 管理技能

```bash
# 列出所有技能
npx skills list

# 安装新技能包
npx skills add <github-url>

# 移除技能
npx skills remove <skill-name>
```

---

## 推荐使用场景（DataNova 项目）

| 场景 | 推荐技能 |
|---|---|
| 新功能开发 | `spec-driven-development` → `tdd` → `implement` |
| Bug 调试 | `diagnosing-bugs` |
| 代码审查 | `code-review` |
| UI 重设计 | `design-taste-frontend` 或 `redesign-existing-projects` |
| 需求不清晰 | `interview-me` 或 `grilling` |
| 大型重构 | `request-refactor-plan` → `to-tickets` |
| 性能优化 | `performance-optimization` |
| 合并冲突 | `resolving-merge-conflicts` |
