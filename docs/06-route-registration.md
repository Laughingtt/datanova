# 路由注册与 API 设计

> 本文档详解服务端的入口文件、路由注册方式和 API 设计模式。

---

## 一、入口文件

`packages/server/src/index.ts` 是服务端的入口，启动时执行：

```
① ensureDataDirs()          — 创建 data/ 目录结构
② 复制示例 Skill             — bill-query → data/skills/
③ 创建 Hono 实例
④ CORS 中间件               — /api/* 路径
⑤ 注册 REST API 路由         — 见下表
⑥ 注册 WebSocket             — /ws/chat
⑦ 启动 HTTP Server           — 默认 :3000
⑧ startScheduler()          — 启动定时查询
⑨ 注册优雅关闭               — SIGTERM/SIGINT
```

### 路由注册方式

Hono 支持两种注册方式：

```typescript
// 方式 1：直接注册（路径前缀在路由文件中没定义）
app.route("/api/datasources", datasourcesRoutes);
// → datasourcesRoutes 里的 "/" = /api/datasources/

// 方式 2：函数返回（路径前缀在路由文件内部定义）
app.route("/", createSemanticRoutes());
// → createSemanticRoutes 内部定义了完整路径如 /api/datasources/:dsId/metrics
```

---

## 二、完整路由表

### 数据源（datasources.ts）

| 方法 | 路径 | Handler | 说明 |
|---|---|---|---|
| GET | `/api/datasources` | listDatasources() | 列出所有数据源（密码脱敏） |
| GET | `/api/datasources/:id` | getDatasource(id) | 获取单个数据源 |
| POST | `/api/datasources` | createDatasource() | 创建（先测试连接） |
| PUT | `/api/datasources/:id` | updateDatasource() | 更新（连接变更时重新测试） |
| DELETE | `/api/datasources/:id` | deleteDatasource() | 删除（先关闭连接池） |
| POST | `/api/datasources/:id/test` | testConnection() | 测试连接 |

### Schema 与注解（schemas.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/schemas/:dsId` | 获取 Schema + 注解 |
| PUT | `/api/schemas/:dsId/annotations` | Upsert 注解（触发 Skill 刷新） |
| PUT | `/api/schemas/:dsId/annotations/:id/confirm` | 确认草稿注解 |
| DELETE | `/api/schemas/:dsId/annotations/:id` | 删除注解 |
| POST | `/api/schemas/:dsId/ai-annotate` | AI 自动注解 |
| GET | `/api/schemas/:dsId/schema-prompt-preview` | 预览 Schema Prompt |
| GET | `/api/schemas/:dsId/table-query-examples` | 查询示例列表 |
| POST | `/api/schemas/:dsId/table-query-examples` | 创建查询示例 |
| PUT | `/api/schemas/:dsId/table-query-examples/:id` | 更新查询示例 |
| DELETE | `/api/schemas/:dsId/table-query-examples/:id` | 删除查询示例 |

### 语义层（semantic.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/metrics` | 指标列表 |
| POST | `/api/datasources/:dsId/metrics` | 创建指标 |
| PUT | `/api/datasources/:dsId/metrics/:id` | 更新指标 |
| DELETE | `/api/datasources/:dsId/metrics/:id` | 删除指标 |
| POST | `/api/datasources/:dsId/metrics/:id/test` | 测试指标 SQL |
| GET | `/api/datasources/:dsId/dimensions` | 维度列表 |
| POST | `/api/datasources/:dsId/dimensions` | 创建维度 |
| PUT | `/api/datasources/:dsId/dimensions/:id` | 更新维度 |
| DELETE | `/api/datasources/:dsId/dimensions/:id` | 删除维度 |
| GET | `/api/datasources/:dsId/models` | 模型列表 |
| POST | `/api/datasources/:dsId/models` | 创建模型 |
| PUT | `/api/datasources/:dsId/models/:id` | 更新模型 |
| DELETE | `/api/datasources/:dsId/models/:id` | 删除模型 |
| POST | `/api/datasources/:dsId/ai-suggest-semantic` | AI 推荐语义层 |

### 对话（conversations.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/conversations` | 对话列表（支持 ?datasourceId=） |
| POST | `/api/conversations` | 创建对话 |
| PUT | `/api/conversations/:id/title` | 更新标题 |
| DELETE | `/api/conversations/:id` | 删除对话 |

### 反馈（index.ts 内联）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/conversations/:convId/messages/:msgId/feedback` | 提交查询反馈 |

### Skills（skills.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/skills` | Skill 列表 |
| GET | `/api/skills/:name` | Skill 内容 |
| PUT | `/api/skills/:name` | 保存/更新 Skill |
| DELETE | `/api/skills/:name` | 删除 Skill |

### 模型（models.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/models` | 可用 LLM 模型（只返回有 API Key 的 Provider） |

### 定时查询（scheduled.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/scheduled-queries` | 定时查询列表 |
| POST | `/api/datasources/:dsId/scheduled-queries` | 创建 |
| PUT | `/api/datasources/:dsId/scheduled-queries/:id` | 更新 |
| DELETE | `/api/datasources/:dsId/scheduled-queries/:id` | 删除 |
| POST | `/api/datasources/:dsId/scheduled-queries/:id/execute` | 手动执行 |
| GET | `/api/datasources/:dsId/scheduled-queries/:id/history` | 执行历史 |
| GET | `/api/datasources/:dsId/query-alerts` | 告警列表 |

### 数据字典（dictionary.ts）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/dictionary/search?q=` | 搜索表/列/指标/维度 |
| GET | `/api/datasources/:dsId/dictionary/tables/:name` | 表详情 |
| GET | `/api/datasources/:dsId/dictionary/recent-changes` | 最近变更 |

### 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | `{ status: "ok", version: "0.1.0" }` |

---

## 三、API 设计模式

### 请求格式

所有 REST API 使用 JSON：

```
Content-Type: application/json
```

### 响应格式

成功：直接返回数据

```json
// GET /api/datasources
[
  { "id": "xxx", "name": "销售数据库", "host": "192.168.1.100", ... }
]

// POST /api/datasources
{ "id": "xxx", "name": "销售数据库", ... }  (201 Created)
```

错误：

```json
{ "error": "Connection test failed: ..." }
```

HTTP 状态码：
- `200` — 成功
- `201` — 创建成功
- `400` — 参数错误
- `404` — 资源不存在
- `409` — 冲突（如名称重复）
- `500` — 服务端错误

### 密码安全

- **GET** 数据源列表时不返回密码，只返回 `hasPassword: true`
- 创建/更新时通过请求体传入密码，存入 SQLite 前加密
- 连接 MySQL 时从 SQLite 读取并解密

### 注解变更的副作用

当注解被创建/更新/删除/确认时，自动触发：

```typescript
// schemas.ts
await generateAnnotationSkill(datasourceId, ds.name);  // 重新生成 SKILL.md
refreshHarnessesForDatasource(datasourceId);           // 刷新所有活跃会话
```

---

## 四、Vite 代理配置

开发环境下，前端（:5173）通过 Vite 代理转发请求到后端（:3000）：

```typescript
// vite.config.ts (简化)
{
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
}
```

生产环境下，设置 `VITE_API_URL` 环境变量指向实际后端地址。
