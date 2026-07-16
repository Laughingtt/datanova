# DataNova 数据洞察页面 + 收藏报表

## 概述

新增「数据洞察」页面，作为预置 BI 报表展示页。系统自动挑选高频查询，实时执行并图表化展示。同时支持用户收藏 SQL 为报表。

## 页面结构

```
┌─────────────────────────────────────────────────────┐
│  数据洞察                      [数据源选择器 ▼]       │
├──────────────┬──────────────┬───────────────────────┤
│ 📊 总查询次数 │ ✅ 成功率     │ 🔥 最热表              │
├──────────────┴──────────────┴───────────────────────┤
│  ⭐ 收藏报表 (N 张)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 图表卡片  │ │ 图表卡片  │ │ 图表卡片  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│  🔥 热门查询 (最多 10 张)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 图表卡片  │ │ 图表卡片  │ │ 图表卡片  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────┘
```

## 数据流

1. 页面加载 → GET stats（统计栏）
2. → GET bookmarks → 逐个执行 SQL → 图表
3. → GET top-queries → 逐个执行 SQL → 图表

## 图表类型自动选择

| 数据特征 | 图表类型 |
|----------|---------|
| 日期列 + 1个数值列 | 面积图 |
| 日期列 + 多个数值列 | 多线折线图 |
| 分类列 + 数值 (< 8) | 柱状图 |
| 分类列 + 数值 (≥ 8) | 横向柱状图 |
| 分类 + 占比型 | 环形饼图 |
| 其他 | 表格 |

## 收藏功能

- 入口1: 洞察页面热门卡片 ⭐ 按钮
- 入口2: SQL 历史页每行 ⭐ 按钮
- 入口3: 收藏区顶部「+ 添加收藏」弹窗

## 数据库新增表

```sql
CREATE TABLE query_bookmarks (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sql TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/datasources/:dsId/insights/stats | 查询统计 |
| GET | /api/datasources/:dsId/insights/top-queries | 高频 SQL |
| POST | /api/datasources/:dsId/insights/execute | 执行 SQL |
| GET | /api/datasources/:dsId/bookmarks | 收藏列表 |
| POST | /api/datasources/:dsId/bookmarks | 添加收藏 |
| DELETE | /api/datasources/:dsId/bookmarks/:id | 删除收藏 |
| POST | /api/datasources/:dsId/bookmarks/:id/execute | 执行收藏SQL |

## 文件清单

### 后端
- `packages/server/src/routes/insights.ts` (新建)
- `packages/server/src/routes/bookmarks.ts` (新建)
- `packages/server/src/store.ts` (修改)
- `packages/server/src/index.ts` (修改)

### 前端
- `packages/web/src/components/Insights/InsightsPage.tsx` (新建)
- `packages/web/src/components/Insights/ChartCard.tsx` (新建)
- `packages/web/src/components/Insights/StatsBar.tsx` (新建)
- `packages/web/src/components/Insights/BookmarkDialog.tsx` (新建)
- `packages/web/src/App.tsx` (修改)
- `packages/web/src/stores/app.ts` (修改)
- `packages/web/src/components/Layout.tsx` (修改)
- `packages/web/src/api/client.ts` (修改)
- `packages/web/src/components/History/QueryHistoryPage.tsx` (修改)

### 文档
- `CLAUDE.md` (修改)
- `README.md` (修改)
