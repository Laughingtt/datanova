# DataNova 项目文档

本目录收录 DataNova 项目的核心技术文档：架构、PiAgent 框架、数据工具、API、前端与设计规范。

---

## 文档目录

| # | 文件 | 简介 | 适合人群 |
|---|---|---|---|
| 1 | [01-architecture-overview.md](./01-architecture-overview.md) | 项目架构总览：技术栈、目录结构、数据流、模块依赖关系 | 新加入项目的开发者 |
| 2 | [02-pi-agent-internals.md](./02-pi-agent-internals.md) | PiAgent 框架内部机制：Agent Loop、事件系统、Hook、消息队列、LLM 调度 | 需要扩展 Agent 框架的开发者 |
| 3 | [03-tools-and-data.md](./03-tools-and-data.md) | 内置工具清单、数据源、SQL 查询流程、历史示例同步、语义层构建、注解存储 | 需要修改或扩展工具的开发者 |
| 4 | [04-agent-integration.md](./04-agent-integration.md) | Agent 集成实战：WebSocket 协议、工具定义模板、Skills 机制、查询 SQL 上下文注入、路由 | 需要对接 PiAgent 子能力的开发者 |
| 5 | [05-types-and-data-model.md](./05-types-and-data-model.md) | 后端类型定义 + SQLite 表结构 + 领域模型 + 表关系 + 流水优化详解 | 需要扩展数据模型的开发者 |
| 6 | [06-route-registration.md](./06-route-registration.md) | 路由注册方式：内置 API 路由表、Hono 实例化、自定义路由、API 模式与 Vite 代理 | 需要新增 API 的开发者 |
| 7 | [07-frontend-components.md](./07-frontend-components.md) | 前端组件、Zustand 状态管理、CSS 变量体系、动效 | 前端开发者 |

## 补充文档

| 文件 | 简介 |
|---|---|
| [DESIGN.md](./DESIGN.md) | UI 视觉设计规范 |
| [skills-guide.md](./skills-guide.md) | Skills（SKILL.md）编写与维护指南 |

## 历史归档（spec/plan）

| 目录 | 简介 |
|---|---|
| [superpowers/specs/](./superpowers/specs/) | 历史阶段架构设计稿 |
| [superpowers/plans/](./superpowers/plans/) | 历史阶段实施计划 |

---

## 阅读顺序建议

1. 先看 [01-architecture-overview.md](./01-architecture-overview.md) —— 了解项目在做什么
2. 再看 [05-types-and-data-model.md](./05-types-and-data-model.md) —— 了解数据模型
3. 然后看 [06-route-registration.md](./06-route-registration.md) —— 了解 API 层
4. 接着看 [07-frontend-components.md](./07-frontend-components.md) —— 了解前端架构
5. 再看 [04-agent-integration.md](./04-agent-integration.md) —— 了解 Agent 集成方式
6. 看 [03-tools-and-data.md](./03-tools-and-data.md) —— 了解 6 个工具怎么做
7. 最后看 [02-pi-agent-internals.md](./02-pi-agent-internals.md) —— 了解最底层原理

---

## 相关资源

- [CLAUDE.md](../CLAUDE.md) —— 给开发者的 AI 协作指南
- [.env.example](../.env.example) —— 环境变量模板
- [packages/server/src/index.ts](../packages/server/src/index.ts) —— 后端入口
- [packages/web/src/App.tsx](../packages/web/src/App.tsx) —— 前端入口