# 查询技能模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "业务知识" module with a "查询技能" module that stores actionable query skills per scenario, generates SKILL.md files for Agent consumption, and supports AI-powered skill generation.

**Architecture:** New `query_skill` table replaces `business_knowledge`. Each enabled skill generates an independent `qs-{skillId}/SKILL.md` file loaded by pi-agent-core's Skill mechanism. AI generation uses DeepSeek API (same pattern as semantic layer suggestions). Frontend is a three-column layout: domain filter → skill list → skill editor.

**Tech Stack:** Hono (routes), better-sqlite3 (store), DeepSeek API (AI generation), React + Zustand (frontend), pi-agent-core Skill mechanism (Agent integration)

---

## File Structure

### Backend — New Files
- `packages/server/src/agent/skill-formatter.ts` — Format QuerySkill → SKILL.md content, sync to filesystem
- `packages/server/src/routes/query-skills.ts` — CRUD + AI generate + preview routes

### Backend — Modified Files
- `packages/server/src/types.ts` — Add `QuerySkill` type, remove `BusinessKnowledge`/`KnowledgeCategory`
- `packages/server/src/store.ts` — Add `query_skill` table + CRUD, remove `business_knowledge` table + CRUD
- `packages/server/src/agent/prompt-builder.ts` — Update skill instructions (`bk-` → `qs-`), add query skill priority in Agent call chain
- `packages/server/src/agent/tools/read-skill.ts` — Update description text (`bk-` → `qs-`)
- `packages/server/src/index.ts` — Register `createQuerySkillRoutes()`, remove `createBusinessKnowledgeRoutes()`

### Backend — Deleted Files
- `packages/server/src/routes/business-knowledge.ts`
- `packages/server/src/agent/knowledge-formatter.ts`

### Frontend — New Files
- `packages/web/src/components/QuerySkills/QuerySkillsPage.tsx` — Main page (3-column layout)
- `packages/web/src/components/QuerySkills/SkillForm.tsx` — Skill editor form
- `packages/web/src/components/QuerySkills/AIGenerateDialog.tsx` — AI generation dialog

### Frontend — Modified Files
- `packages/web/src/api/client.ts` — Add `querySkillApi`, remove `businessKnowledgeApi`
- `packages/web/src/stores/app.ts` — `AppView` type: `businessKnowledge` → `querySkills`
- `packages/web/src/App.tsx` — Import `QuerySkillsPage`, update view rendering
- `packages/web/src/components/Sidebar.tsx` — "业务知识" → "查询技能", icon update
- `packages/web/src/components/Layout.tsx` — navItems update

### Frontend — Deleted Files
- `packages/web/src/components/BusinessKnowledge/` (entire directory)

---

### Task 1: Backend Types & Store — QuerySkill data model

**Files:**
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Add QuerySkill type to types.ts**

Add after the `BusinessKnowledge` type definition (line ~256), then delete the `BusinessKnowledge` and `KnowledgeCategory` types:

```typescript
// ==================== Query Skills ====================

export interface CoreTableEntry {
  table: string;
  purpose: string;
}

export interface QuerySkill {
  id: string;
  datasource_id: string;
  domain: string;
  name: string;
  trigger_keywords: string; // JSON array of strings
  business_context: string;
  core_tables: string; // JSON array of CoreTableEntry objects
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
  enabled: number; // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

Delete the `KnowledgeCategory` type alias and the `BusinessKnowledge` interface.

- [ ] **Step 2: Update store.ts imports**

In `packages/server/src/store.ts`, change the import line to use `QuerySkill` instead of `BusinessKnowledge`/`KnowledgeCategory`:

```typescript
import type { Datasource, SchemaAnnotation, Conversation, StoredMessage, TableQueryExample, QueryFeedback, QueryExample, SemanticMetric, SemanticDimension, SemanticModel, ScheduledQuery, QueryAlert, QueryExecutionHistory, SqlQueryHistory, QueryBookmark, QuerySkill } from "./types.js";
```

- [ ] **Step 3: Replace business_knowledge table with query_skill table in initTables()**

In `initTables()`, replace the `business_knowledge` CREATE TABLE block (lines ~394-412) with:

```typescript
  // Query Skills table (replaces business_knowledge)
  database.exec(`
    CREATE TABLE IF NOT EXISTS query_skill (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_keywords TEXT NOT NULL DEFAULT '[]',
      business_context TEXT NOT NULL DEFAULT '',
      core_tables TEXT NOT NULL DEFAULT '[]',
      join_path TEXT NOT NULL DEFAULT '',
      query_steps TEXT NOT NULL DEFAULT '',
      example_sql TEXT NOT NULL DEFAULT '',
      caveats TEXT NOT NULL DEFAULT '',
      common_issues TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_skill_datasource
    ON query_skill(datasource_id)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_skill_domain
    ON query_skill(datasource_id, domain)
  `);
```

- [ ] **Step 4: Replace business_knowledge CRUD functions with query_skill CRUD**

Replace the entire "Business Knowledge CRUD" section (lines ~1381-1464) with:

```typescript
// ==================== Query Skill CRUD ====================

export function listQuerySkills(datasourceId: string, domain?: string): QuerySkill[] {
  if (domain) {
    return getDb().prepare(`
      SELECT * FROM query_skill
      WHERE datasource_id = ? AND domain = ?
      ORDER BY sort_order, created_at
    `).all(datasourceId, domain) as QuerySkill[];
  }
  return getDb().prepare(`
    SELECT * FROM query_skill
    WHERE datasource_id = ?
    ORDER BY domain, sort_order, created_at
  `).all(datasourceId) as QuerySkill[];
}

export function getQuerySkill(id: string): QuerySkill | undefined {
  return getDb().prepare(`SELECT * FROM query_skill WHERE id = ?`).get(id) as QuerySkill | undefined;
}

export function createQuerySkill(input: {
  datasource_id: string;
  domain: string;
  name: string;
  trigger_keywords?: string;
  business_context?: string;
  core_tables?: string;
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
  enabled?: number;
  sort_order?: number;
}): QuerySkill {
  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO query_skill (id, datasource_id, domain, name, trigger_keywords, business_context, core_tables, join_path, query_steps, example_sql, caveats, common_issues, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    input.datasource_id,
    input.domain,
    input.name,
    input.trigger_keywords ?? "[]",
    input.business_context ?? "",
    input.core_tables ?? "[]",
    input.join_path ?? "",
    input.query_steps ?? "",
    input.example_sql ?? "",
    input.caveats ?? "",
    input.common_issues ?? "",
    input.enabled ?? 1,
    input.sort_order ?? 0,
  );
  return getQuerySkill(id)!;
}

export function updateQuerySkill(id: string, input: {
  domain?: string;
  name?: string;
  trigger_keywords?: string;
  business_context?: string;
  core_tables?: string;
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
  enabled?: number;
  sort_order?: number;
}): QuerySkill | undefined {
  const existing = getQuerySkill(id);
  if (!existing) return undefined;

  const updates: string[] = [];
  const values: any[] = [];

  if (input.domain !== undefined) { updates.push("domain = ?"); values.push(input.domain); }
  if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
  if (input.trigger_keywords !== undefined) { updates.push("trigger_keywords = ?"); values.push(input.trigger_keywords); }
  if (input.business_context !== undefined) { updates.push("business_context = ?"); values.push(input.business_context); }
  if (input.core_tables !== undefined) { updates.push("core_tables = ?"); values.push(input.core_tables); }
  if (input.join_path !== undefined) { updates.push("join_path = ?"); values.push(input.join_path); }
  if (input.query_steps !== undefined) { updates.push("query_steps = ?"); values.push(input.query_steps); }
  if (input.example_sql !== undefined) { updates.push("example_sql = ?"); values.push(input.example_sql); }
  if (input.caveats !== undefined) { updates.push("caveats = ?"); values.push(input.caveats); }
  if (input.common_issues !== undefined) { updates.push("common_issues = ?"); values.push(input.common_issues); }
  if (input.enabled !== undefined) { updates.push("enabled = ?"); values.push(input.enabled); }
  if (input.sort_order !== undefined) { updates.push("sort_order = ?"); values.push(input.sort_order); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  getDb().prepare(`UPDATE query_skill SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getQuerySkill(id);
}

export function deleteQuerySkill(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM query_skill WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function listEnabledQuerySkills(datasourceId: string): QuerySkill[] {
  return getDb().prepare(`
    SELECT * FROM query_skill
    WHERE datasource_id = ? AND enabled = 1
    ORDER BY domain, sort_order, created_at
  `).all(datasourceId) as QuerySkill[];
}

export function listQuerySkillDomains(datasourceId: string): string[] {
  const rows = getDb().prepare(`
    SELECT DISTINCT domain FROM query_skill
    WHERE datasource_id = ?
    ORDER BY domain
  `).all(datasourceId) as { domain: string }[];
  return rows.map(r => r.domain);
}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | head -30`

Expected: Errors only in files that still reference `BusinessKnowledge`/`KnowledgeCategory` (business-knowledge.ts, knowledge-formatter.ts, index.ts) — these will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/store.ts
git commit -m "feat: replace business_knowledge with query_skill data model"
```

---

### Task 2: Backend — Skill Formatter

**Files:**
- Create: `packages/server/src/agent/skill-formatter.ts`
- Delete: `packages/server/src/agent/knowledge-formatter.ts`

- [ ] **Step 1: Create skill-formatter.ts**

Create `packages/server/src/agent/skill-formatter.ts`:

```typescript
import type { QuerySkill, CoreTableEntry } from "../types.js";
import path from "node:path";
import fs from "node:fs";
import { SKILLS_DIR } from "../config.js";

/**
 * Format a QuerySkill into SKILL.md markdown body.
 */
function formatSkillBody(skill: QuerySkill): string {
  const lines: string[] = [];

  lines.push(`**业务域**: ${skill.domain}`);

  // Trigger keywords
  let keywords: string[] = [];
  try { keywords = JSON.parse(skill.trigger_keywords) as string[]; } catch { keywords = []; }
  if (keywords.length > 0) {
    lines.push(`**触发关键词**: ${keywords.join(", ")}`);
  }

  lines.push("");

  // Business context
  if (skill.business_context) {
    lines.push("## 业务背景");
    lines.push(skill.business_context);
    lines.push("");
  }

  // Core tables
  let coreTables: CoreTableEntry[] = [];
  try { coreTables = JSON.parse(skill.core_tables) as CoreTableEntry[]; } catch { coreTables = []; }
  if (coreTables.length > 0) {
    lines.push("## 核心表");
    for (const ct of coreTables) {
      lines.push(`- **${ct.table}**: ${ct.purpose}`);
    }
    lines.push("");
  }

  // Join path
  if (skill.join_path) {
    lines.push("## 关联路径");
    lines.push(skill.join_path);
    lines.push("");
  }

  // Query steps
  if (skill.query_steps) {
    lines.push("## 查询步骤");
    lines.push(skill.query_steps);
    lines.push("");
  }

  // Example SQL
  if (skill.example_sql) {
    lines.push("## 示例SQL");
    lines.push("```sql");
    lines.push(skill.example_sql);
    lines.push("```");
    lines.push("");
  }

  // Caveats
  if (skill.caveats) {
    lines.push("## 注意事项");
    lines.push(skill.caveats);
    lines.push("");
  }

  // Common issues
  if (skill.common_issues) {
    lines.push("## 常见问题");
    lines.push(skill.common_issues);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Generate a Skill description (one-line summary) for a QuerySkill.
 * Used as the `description` field in the Skill object for System Prompt injection.
 */
export function generateQuerySkillDescription(skill: QuerySkill): string {
  return `${skill.domain}: ${skill.name}`;
}

/**
 * Get the SKILL.md directory name for a query skill.
 */
export function getQuerySkillDir(skillId: string): string {
  return `qs-${skillId}`;
}

/**
 * Sync a single query skill to its SKILL.md file.
 * If the skill is disabled or has missing required fields, remove the SKILL.md.
 */
export function syncQuerySkillSkill(skill: QuerySkill): void {
  const skillDirName = getQuerySkillDir(skill.id);
  const skillDir = path.join(SKILLS_DIR, skillDirName);
  const skillPath = path.join(skillDir, "SKILL.md");

  // Remove if disabled or missing required fields
  if (!skill.enabled || !skill.name || !skill.query_steps) {
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    return;
  }

  // Ensure directory exists
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const description = generateQuerySkillDescription(skill);
  const body = formatSkillBody(skill);

  const content = `---
name: ${skillDirName}
description: ${description}
---

# ${skill.name}

${body}
`;

  fs.writeFileSync(skillPath, content, "utf-8");
}

/**
 * Remove a query skill's SKILL.md directory.
 */
export function removeQuerySkillSkill(skillId: string): void {
  const skillDirName = getQuerySkillDir(skillId);
  const skillDir = path.join(SKILLS_DIR, skillDirName);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

/**
 * Sync all enabled query skills for a datasource.
 * Removes SKILL.md files for skills that no longer exist or are disabled.
 */
export function syncAllQuerySkillSkills(datasourceId: string, skills: QuerySkill[]): void {
  // Get existing qs-* directories for this datasource
  const existingDirs: string[] = [];
  if (fs.existsSync(SKILLS_DIR)) {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("qs-")) {
        existingDirs.push(entry.name);
      }
    }
  }

  // Track which skill dirs should exist
  const activeSkillDirs = new Set<string>();
  for (const skill of skills) {
    if (skill.enabled && skill.datasource_id === datasourceId) {
      syncQuerySkillSkill(skill);
      activeSkillDirs.add(getQuerySkillDir(skill.id));
    }
  }

  // Remove dirs for skills that no longer exist or are disabled
  // We can only clean up skills belonging to this datasource
  const skillIds = new Set(skills.map(s => s.id));
  for (const dir of existingDirs) {
    // Extract skill ID from dir name (qs-{id})
    const skillId = dir.slice(3);
    if (skillIds.has(skillId) && !activeSkillDirs.has(dir)) {
      const skillDir = path.join(SKILLS_DIR, dir);
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  }
}

/**
 * Format a QuerySkill for the preview API.
 * Returns the full SKILL.md content that the Agent would see.
 */
export function formatQuerySkillForPreview(skill: QuerySkill): string {
  const body = formatSkillBody(skill);
  return `# ${skill.name}\n\n${body}`;
}
```

- [ ] **Step 2: Delete knowledge-formatter.ts**

Delete `packages/server/src/agent/knowledge-formatter.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/agent/skill-formatter.ts
git rm packages/server/src/agent/knowledge-formatter.ts
git commit -m "feat: add skill-formatter for QuerySkill SKILL.md generation, remove knowledge-formatter"
```

---

### Task 3: Backend — Query Skills Routes

**Files:**
- Create: `packages/server/src/routes/query-skills.ts`
- Delete: `packages/server/src/routes/business-knowledge.ts`

- [ ] **Step 1: Create query-skills.ts**

Create `packages/server/src/routes/query-skills.ts`:

```typescript
import { Hono } from "hono";
import {
  listQuerySkills,
  getQuerySkill,
  createQuerySkill,
  updateQuerySkill,
  deleteQuerySkill,
  listEnabledQuerySkills,
  listQuerySkillDomains,
  getDatasource,
} from "../store.js";
import {
  generateQuerySkillDescription,
  syncQuerySkillSkill,
  removeQuerySkillSkill,
  syncAllQuerySkillSkills,
  formatQuerySkillForPreview,
  getQuerySkillDir,
} from "../agent/skill-formatter.js";
import { refreshHarnessesForDatasource } from "../agent/harness-factory.js";
import { discoverSchema } from "../mysql/discovery.js";

/**
 * Helper: after any query skill mutation, sync SKILL.md files
 * and refresh any active harnesses so they pick up the new skill list.
 */
function syncAfterMutation(datasourceId: string): void {
  const allSkills = listQuerySkills(datasourceId);
  const enabledSkills = allSkills.filter((s) => s.enabled);
  syncAllQuerySkillSkills(datasourceId, enabledSkills);
  refreshHarnessesForDatasource(datasourceId);
}

export function createQuerySkillRoutes(): Hono {
  const app = new Hono();

  // List all query skills for a datasource
  app.get("/api/datasources/:dsId/query-skills", (c) => {
    const dsId = c.req.param("dsId");
    const domain = c.req.query("domain");
    return c.json(listQuerySkills(dsId, domain));
  });

  // List distinct domains for a datasource
  app.get("/api/datasources/:dsId/query-skills/domains", (c) => {
    const dsId = c.req.param("dsId");
    return c.json(listQuerySkillDomains(dsId));
  });

  // Get a single query skill
  app.get("/api/datasources/:dsId/query-skills/:id", (c) => {
    const id = c.req.param("id");
    const skill = getQuerySkill(id);
    if (!skill) return c.json({ error: "Not found" }, 404);
    return c.json(skill);
  });

  // Create a new query skill
  app.post("/api/datasources/:dsId/query-skills", async (c) => {
    const dsId = c.req.param("dsId");
    const body = await c.req.json();

    if (!body.domain || !body.name) {
      return c.json({ error: "domain and name are required" }, 400);
    }

    const skill = createQuerySkill({
      datasource_id: dsId,
      domain: body.domain,
      name: body.name,
      trigger_keywords: body.trigger_keywords,
      business_context: body.business_context,
      core_tables: body.core_tables,
      join_path: body.join_path,
      query_steps: body.query_steps,
      example_sql: body.example_sql,
      caveats: body.caveats,
      common_issues: body.common_issues,
      enabled: body.enabled ?? 1,
      sort_order: body.sort_order ?? 0,
    });

    syncAfterMutation(dsId);
    return c.json(skill, 201);
  });

  // Update a query skill
  app.put("/api/datasources/:dsId/query-skills/:id", async (c) => {
    const dsId = c.req.param("dsId");
    const id = c.req.param("id");
    const body = await c.req.json();

    const existing = getQuerySkill(id);
    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }

    const updated = updateQuerySkill(id, {
      domain: body.domain,
      name: body.name,
      trigger_keywords: body.trigger_keywords,
      business_context: body.business_context,
      core_tables: body.core_tables,
      join_path: body.join_path,
      query_steps: body.query_steps,
      example_sql: body.example_sql,
      caveats: body.caveats,
      common_issues: body.common_issues,
      enabled: body.enabled,
      sort_order: body.sort_order,
    });

    syncAfterMutation(dsId);
    return updated ? c.json(updated) : c.json({ error: "Update failed" }, 500);
  });

  // Delete a query skill
  app.delete("/api/datasources/:dsId/query-skills/:id", (c) => {
    const dsId = c.req.param("dsId");
    const id = c.req.param("id");
    const success = deleteQuerySkill(id);

    if (success) {
      removeQuerySkillSkill(id);
      syncAfterMutation(dsId);
    }
    return success ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  // Toggle enable/disable
  app.put("/api/datasources/:dsId/query-skills/:id/toggle", (c) => {
    const dsId = c.req.param("dsId");
    const id = c.req.param("id");
    const existing = getQuerySkill(id);
    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }
    const updated = updateQuerySkill(id, { enabled: existing.enabled ? 0 : 1 });

    syncAfterMutation(dsId);
    return updated ? c.json(updated) : c.json({ error: "Toggle failed" }, 500);
  });

  // Preview the formatted prompt text that the AI will see
  app.get("/api/datasources/:dsId/query-skills/preview", (c) => {
    const dsId = c.req.param("dsId");
    const enabledSkills = listEnabledQuerySkills(dsId);

    if (enabledSkills.length === 0) {
      return c.json({ skills: [] });
    }

    const previewItems = enabledSkills.map((skill) => ({
      skillId: skill.id,
      skillDir: getQuerySkillDir(skill.id),
      skillName: skill.name,
      skillSummary: generateQuerySkillDescription(skill),
      skillFullContent: formatQuerySkillForPreview(skill),
    }));

    return c.json({ skills: previewItems });
  });

  // AI generate a single query skill
  app.post("/api/datasources/:dsId/query-skills/generate", async (c) => {
    const dsId = c.req.param("dsId");
    try {
      const body = await c.req.json();
      const domain: string = body.domain || "";
      const scenario: string = body.scenario || "";

      if (!domain || !scenario) {
        return c.json({ error: "domain and scenario are required" }, 400);
      }

      const schemaInfo = await discoverSchema(dsId);
      const tablesSummary = schemaInfo.tables.map((t: any) => ({
        name: t.table.name,
        comment: t.table.comment || "",
        columns: t.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          comment: col.comment || "",
          isPrimaryKey: col.isPrimaryKey,
        })),
        foreignKeys: t.foreignKeys.map((fk: any) =>
          fk.columnName + " -> " + fk.referencedTable + "." + fk.referencedColumn
        ),
      }));

      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable." }, 500);
      }

      const prompt = `你是一个资深数据分析师，正在为以下数据库编写查询技能攻略。

数据库 Schema:
${JSON.stringify(tablesSummary, null, 2)}

业务域: ${domain}
场景描述: ${scenario}

请生成一个完整的查询技能，包含以下字段（输出 JSON 格式，不要 markdown 代码块）：
1. name: 技能名称（简洁明确，如"客户账单明细查询"）
2. trigger_keywords: 触发关键词数组（3-5个，用户提到这些词时应激活此技能）
3. business_context: 业务背景（2-3句话说明这个场景的业务含义）
4. core_tables: 核心表列表数组，每项包含 table（表名）和 purpose（用途说明），按查询优先级排序
5. join_path: 关联路径（表之间的 JOIN 关系，用箭头表示）
6. query_steps: 查询步骤（1.2.3.分步骤说明查询逻辑）
7. example_sql: 示例SQL（一个完整的、可执行的SQL，带中文注释）
8. caveats: 注意事项（数据质量、字段含义、常见陷阱）
9. common_issues: 常见问题（用户可能遇到的典型问题和处理方式）

所有文本字段使用简体中文。输出纯 JSON，不要 markdown 格式。`;

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + deepseekKey,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: "You are a data analyst expert. Always respond with valid JSON only, no markdown. All text fields must be in Simplified Chinese.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: "DeepSeek API error: " + response.status + " - " + errText }, 500);
      }

      const data = (await response.json()) as any;
      const rawContent = data.choices?.[0]?.message?.content || "";
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      let skillData: any;
      try {
        skillData = JSON.parse(jsonStr);
      } catch {
        return c.json({ error: "Failed to parse AI response", raw: rawContent }, 500);
      }

      // Add domain from user input
      skillData.domain = domain;

      return c.json({ skill: skillData });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // AI batch generate query skills for a domain
  app.post("/api/datasources/:dsId/query-skills/generate-batch", async (c) => {
    const dsId = c.req.param("dsId");
    try {
      const body = await c.req.json();
      const domain: string = body.domain || "";

      if (!domain) {
        return c.json({ error: "domain is required" }, 400);
      }

      const schemaInfo = await discoverSchema(dsId);
      const tablesSummary = schemaInfo.tables.map((t: any) => ({
        name: t.table.name,
        comment: t.table.comment || "",
        columns: t.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          comment: col.comment || "",
          isPrimaryKey: col.isPrimaryKey,
        })),
        foreignKeys: t.foreignKeys.map((fk: any) =>
          fk.columnName + " -> " + fk.referencedTable + "." + fk.referencedColumn
        ),
      }));

      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: "DeepSeek API key not configured." }, 500);
      }

      const prompt = `你是一个资深数据分析师，正在为以下数据库编写查询技能攻略。

数据库 Schema:
${JSON.stringify(tablesSummary, null, 2)}

业务域: ${domain}

请识别该业务域下的3-5个典型查询场景，为每个场景生成一个完整的查询技能。

每个技能包含以下字段：
1. name: 技能名称（简洁明确）
2. trigger_keywords: 触发关键词数组（3-5个）
3. business_context: 业务背景（2-3句话）
4. core_tables: 核心表列表数组，每项包含 table 和 purpose
5. join_path: 关联路径
6. query_steps: 查询步骤
7. example_sql: 示例SQL（带中文注释）
8. caveats: 注意事项
9. common_issues: 常见问题

输出 JSON 数组，每个元素是一个技能对象。所有文本使用简体中文。不要 markdown 格式。`;

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + deepseekKey,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: "You are a data analyst expert. Always respond with valid JSON only, no markdown. All text fields must be in Simplified Chinese.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 8192,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: "DeepSeek API error: " + response.status + " - " + errText }, 500);
      }

      const data = (await response.json()) as any;
      const rawContent = data.choices?.[0]?.message?.content || "";
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      let skillsData: any[];
      try {
        const parsed = JSON.parse(jsonStr);
        skillsData = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return c.json({ error: "Failed to parse AI response", raw: rawContent }, 500);
      }

      // Add domain from user input to each skill
      for (const skill of skillsData) {
        skill.domain = domain;
      }

      return c.json({ skills: skillsData });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}
```

- [ ] **Step 2: Delete business-knowledge.ts**

Delete `packages/server/src/routes/business-knowledge.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/query-skills.ts
git rm packages/server/src/routes/business-knowledge.ts
git commit -m "feat: add query-skills routes with CRUD + AI generation, remove business-knowledge routes"
```

---

### Task 4: Backend — Wire up routes & update Agent integration

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/agent/prompt-builder.ts`
- Modify: `packages/server/src/agent/tools/read-skill.ts`

- [ ] **Step 1: Update index.ts — swap route registration**

In `packages/server/src/index.ts`:

Replace the import:
```typescript
import { createBusinessKnowledgeRoutes } from "./routes/business-knowledge.js";
```
With:
```typescript
import { createQuerySkillRoutes } from "./routes/query-skills.js";
```

Replace the route registration:
```typescript
app.route("/", createBusinessKnowledgeRoutes());
```
With:
```typescript
app.route("/", createQuerySkillRoutes());
```

- [ ] **Step 2: Update prompt-builder.ts — skill instructions**

In `packages/server/src/agent/prompt-builder.ts`, find the "Skill Usage" section (around line 153-163) and replace the entire block:

Replace:
```
## Skill Usage

The available skills listed above contain specialized business knowledge. When a user's question relates to a skill's domain:
1. Call the \`read_skill\` tool with the skill's name to load its full content
2. Apply the loaded business knowledge when writing SQL queries
3. Business knowledge skills (names starting with "bk-") contain domain-specific terminology, query rules, table join guidance, data quality notes, and analysis patterns

For example, if a skill named "bk-xxx" has description "账单统计流水: 术语定义3条, 查询规则2条", and the user asks about 账单/billing, call read_skill(skill_name="bk-xxx", datasource_id="...") to load the full knowledge.
```

With:
```
## Skill Usage

The available skills listed above contain query skills — actionable knowledge about how to query specific business domains. When a user's question relates to a skill's domain:
1. Call the \`read_skill\` tool with the skill's name to load its full content
2. Apply the loaded query skill when writing SQL queries — follow the core tables, join paths, query steps, and caveats
3. Query skills (names starting with "qs-") contain domain-specific query strategies: core tables, join paths, query steps, example SQL, caveats, and common issues

When a user asks a data question, follow this priority:
1. Call lookup_semantic_layer first to check if pre-defined metrics match
   → If matched: use semantic layer SQL, can append WHERE/GROUP BY
   → If not matched: proceed to step 2
2. Check available skills (qs-* in the skill list above) for domain match
   → If matched: call read_skill to load the full query strategy, then follow it
   → If not matched: proceed to step 3
3. Call lookup_examples to find similar past queries as Few-Shot reference
   → If matched: reference past queries
   → If not matched: generate SQL from scratch using discover_schema

For example, if a skill named "qs-abc123" has description "账单: 客户账单明细查询", and the user asks about 客户账单/billing details, call read_skill(skill_name="qs-abc123") to load the full query strategy.
```

- [ ] **Step 3: Update read-skill.ts — description text**

In `packages/server/src/agent/tools/read-skill.ts`, update the tool description:

Replace:
```
For business knowledge skills (names starting with "bk-"), the tool loads the latest business rules, terminology, and constraints. Apply these when writing SQL queries.

Example: if a skill named "bk-xxx" has description "账单统计流水: 术语定义3条, 查询规则2条", and the user asks about 账单/billing, call read_skill with skill_name="bk-xxx".
```

With:
```
For query skills (names starting with "qs-"), the tool loads the full query strategy including core tables, join paths, query steps, example SQL, caveats, and common issues. Apply these when writing SQL queries.

Example: if a skill named "qs-abc123" has description "账单: 客户账单明细查询", and the user asks about 账单/billing, call read_skill with skill_name="qs-abc123".
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | head -30`

Expected: No errors related to business-knowledge or knowledge-formatter. Fix any remaining references.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/index.ts packages/server/src/agent/prompt-builder.ts packages/server/src/agent/tools/read-skill.ts
git commit -m "feat: wire up query-skills routes, update Agent skill instructions and read_skill description"
```

---

### Task 5: Frontend — API Client & Store

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/stores/app.ts`

- [ ] **Step 1: Add QuerySkill types and API to client.ts**

In `packages/web/src/api/client.ts`, replace the entire "Business Knowledge" section (lines ~603-642) with:

```typescript
// ==================== Query Skills ====================

export interface CoreTableEntry {
  table: string;
  purpose: string;
}

export interface QuerySkill {
  id: string;
  datasource_id: string;
  domain: string;
  name: string;
  trigger_keywords: string; // JSON array
  business_context: string;
  core_tables: string; // JSON array of CoreTableEntry
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuerySkillDraft {
  domain: string;
  name: string;
  trigger_keywords?: string[];
  business_context?: string;
  core_tables?: CoreTableEntry[];
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
}

export const querySkillApi = {
  list: (dsId: string, domain?: string) =>
    request<QuerySkill[]>(`/api/datasources/${dsId}/query-skills${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`),
  get: (dsId: string, id: string) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}`),
  domains: (dsId: string) =>
    request<string[]>(`/api/datasources/${dsId}/query-skills/domains`),
  create: (dsId: string, data: QuerySkillDraft & { enabled?: number; sort_order?: number }) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (dsId: string, id: string, data: Partial<QuerySkillDraft> & { enabled?: number; sort_order?: number }) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/query-skills/${id}`, {
      method: "DELETE",
    }),
  toggle: (dsId: string, id: string) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}/toggle`, {
      method: "PUT",
    }),
  preview: (dsId: string) =>
    request<{ skills: Array<{ skillId: string; skillDir: string; skillName: string; skillSummary: string; skillFullContent: string }> }>(`/api/datasources/${dsId}/query-skills/preview`),
  generate: (dsId: string, data: { domain: string; scenario: string }) =>
    request<{ skill: QuerySkillDraft }>(`/api/datasources/${dsId}/query-skills/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateBatch: (dsId: string, data: { domain: string }) =>
    request<{ skills: QuerySkillDraft[] }>(`/api/datasources/${dsId}/query-skills/generate-batch`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
```

- [ ] **Step 2: Update AppView type in stores/app.ts**

In `packages/web/src/stores/app.ts`, change:

```typescript
export type AppView = "dashboard" | "chat" | "datasources" | "schemas" | "metrics" | "analysis" | "dictionary" | "queryHistory" | "insights" | "businessKnowledge";
```

To:

```typescript
export type AppView = "dashboard" | "chat" | "datasources" | "schemas" | "metrics" | "analysis" | "dictionary" | "queryHistory" | "insights" | "querySkills";
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/stores/app.ts
git commit -m "feat: add querySkillApi, update AppView type from businessKnowledge to querySkills"
```

---

### Task 6: Frontend — QuerySkillsPage

**Files:**
- Create: `packages/web/src/components/QuerySkills/QuerySkillsPage.tsx`

- [ ] **Step 1: Create QuerySkillsPage.tsx**

Create `packages/web/src/components/QuerySkills/QuerySkillsPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { querySkillApi, type QuerySkill } from "../../api/client";
import SkillForm from "./SkillForm";
import AIGenerateDialog from "./AIGenerateDialog";

export default function QuerySkillsPage() {
  const { selectedDatasourceId } = useAppStore();
  const dsId = selectedDatasourceId!;

  // State
  const [selectedDomain, setSelectedDomain] = useState<string>("__all__");
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<QuerySkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<QuerySkill | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ skills: Array<{ skillId: string; skillDir: string; skillName: string; skillSummary: string; skillFullContent: string }> } | null>(null);

  // Load domains
  const loadDomains = useCallback(async () => {
    if (!dsId) return;
    try {
      const list = await querySkillApi.domains(dsId);
      setDomains(list);
    } catch { setDomains([]); }
  }, [dsId]);

  // Load skills
  const loadSkills = useCallback(async () => {
    if (!dsId) return;
    setLoading(true);
    try {
      const domain = selectedDomain === "__all__" ? undefined : selectedDomain;
      const list = await querySkillApi.list(dsId, domain);
      setSkills(list);
    } catch { setSkills([]); }
    finally { setLoading(false); }
  }, [dsId, selectedDomain]);

  useEffect(() => { loadDomains(); loadSkills(); }, [loadDomains, loadSkills]);

  // Reset selection when domain changes
  useEffect(() => {
    setSelectedSkill(null);
    setShowForm(false);
  }, [selectedDomain]);

  // Toggle skill enabled/disabled
  const handleToggle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await querySkillApi.toggle(dsId, id);
      loadSkills();
    } catch (err) { console.error("Toggle failed:", err); }
  };

  // Delete skill
  const handleDelete = async () => {
    setSelectedSkill(null);
    setShowForm(false);
    loadSkills();
    loadDomains();
  };

  // Save callback
  const handleSave = () => {
    setSelectedSkill(null);
    setShowForm(false);
    loadSkills();
    loadDomains();
  };

  // Cancel form
  const handleCancel = () => {
    setSelectedSkill(null);
    setShowForm(false);
  };

  // Select skill for editing
  const handleSelectSkill = (skill: QuerySkill) => {
    setSelectedSkill(skill);
    setShowForm(true);
  };

  // Create new skill
  const handleCreate = () => {
    setSelectedSkill(null);
    setShowForm(true);
  };

  // AI generate callback — skill data returned from dialog
  const handleAIGenerated = (skillData: any) => {
    setSelectedSkill(null);
    setShowForm(true);
    // The AIGenerateDialog will pass the generated data to SkillForm via a ref or state
    // For simplicity, we'll store it in a state that SkillForm reads
    setAIGeneratedData(skillData);
  };
  const [aiGeneratedData, setAIGeneratedData] = useState<any>(null);

  // Preview AI perspective
  const handlePreview = async () => {
    if (!dsId) return;
    setPreviewLoading(true);
    try {
      const result = await querySkillApi.preview(dsId);
      setPreviewData(result);
      setShowPreview(true);
    } catch (err) {
      setPreviewData({ skills: [] });
      setShowPreview(true);
    } finally { setPreviewLoading(false); }
  };

  // Get trigger keywords as array
  const getKeywords = (skill: QuerySkill): string[] => {
    try { return JSON.parse(skill.trigger_keywords) as string[]; } catch { return []; }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-heading-2 text-[var(--ink)]">查询技能</h2>
              <p className="text-body-sm text-[var(--slate)] mt-1">
                让 AI 掌握你的业务查询经验，提升复杂查询准确度
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handlePreview} disabled={previewLoading} className="btn-secondary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {previewLoading ? "加载中..." : "预览 AI 视角"}
              </button>
              <button onClick={() => setShowAIDialog(true)} className="btn-secondary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                AI 生成
              </button>
              <button onClick={handleCreate} className="btn-primary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增技能
              </button>
            </div>
          </div>
        </div>

        {/* Content: 3-column layout */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-4">
          {/* Left: Domain list (140px) */}
          <div className="w-[140px] flex-shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
              <button
                onClick={() => setSelectedDomain("__all__")}
                className={`w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm ${
                  selectedDomain === "__all__"
                    ? "bg-[var(--primary-soft)] border border-[var(--primary)] text-[var(--primary-text)]"
                    : "hover:bg-[var(--surface)] border border-transparent text-[var(--ink)]"
                }`}
              >
                📋 全部
              </button>
              {domains.map((domain) => (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(domain)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm ${
                    selectedDomain === domain
                      ? "bg-[var(--primary-soft)] border border-[var(--primary)] text-[var(--primary-text)]"
                      : "hover:bg-[var(--surface)] border border-transparent text-[var(--ink)]"
                  }`}
                >
                  🎯 {domain}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: Skill list (240px) */}
          <div className="w-[240px] flex-shrink-0 flex flex-col min-h-0">
            <div className="mb-2">
              <h4 className="text-xs font-medium text-[var(--steel)] uppercase tracking-wide">
                查询技能
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {loading ? (
                <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
              ) : skills.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--steel)]">暂无技能</p>
                  <p className="text-xs text-[var(--stone)] mt-1">
                    点击「新增技能」或「AI 生成」添加
                  </p>
                </div>
              ) : (
                skills.map((skill) => {
                  const isSelected = selectedSkill?.id === skill.id;
                  const keywords = getKeywords(skill);
                  return (
                    <div
                      key={skill.id}
                      onClick={() => handleSelectSkill(skill)}
                      className={`relative px-3 py-2.5 rounded-md transition-colors cursor-pointer group ${
                        isSelected
                          ? "bg-[var(--primary-soft)] border border-[var(--primary)]"
                          : "hover:bg-[var(--surface)] border border-transparent"
                      } ${!skill.enabled ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">
                          {skill.name}
                        </span>
                        <button
                          onClick={(e) => handleToggle(skill.id, e)}
                          className={`ml-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ${
                            skill.enabled
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--surface)] text-[var(--steel)]"
                          }`}
                          title={skill.enabled ? "点击禁用" : "点击启用"}
                        >
                          {skill.enabled ? "✓" : "○"}
                        </button>
                      </div>
                      {keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {keywords.slice(0, 3).map((kw) => (
                            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--steel)]">
                              {kw}
                            </span>
                          ))}
                          {keywords.length > 3 && (
                            <span className="text-[10px] text-[var(--steel)]">+{keywords.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Form / Detail (flex-1) */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-[var(--surface)] rounded-xl border border-[var(--hairline)]">
            {showForm ? (
              <SkillForm
                datasourceId={dsId}
                skill={selectedSkill}
                initialData={aiGeneratedData}
                onSave={handleSave}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onClearInitialData={() => setAIGeneratedData(null)}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-[var(--steel)]">
                    选择左侧技能编辑，或点击「新增技能」
                  </p>
                  <p className="text-xs text-[var(--stone)] mt-1">
                    查询技能通过 Skill 渐进式加载：摘要始终注入 System Prompt，完整内容在 Agent 需要时按需加载
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Generate Dialog */}
      {showAIDialog && (
        <AIGenerateDialog
          datasourceId={dsId}
          onGenerated={(skillData) => {
            handleAIGenerated(skillData);
            setShowAIDialog(false);
          }}
          onClose={() => setShowAIDialog(false)}
        />
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--hairline)] w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
            <div className="sunset-stripe" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
              <div>
                <h3 className="font-display text-lg text-[var(--ink)]">AI 视角预览</h3>
                <p className="text-xs text-[var(--steel)] mt-0.5">
                  查询技能通过 Skill 渐进式加载机制注入 AI
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="btn-ghost text-xs">关闭</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-6 space-y-6">
              {previewData.skills.length === 0 ? (
                <p className="text-sm text-[var(--steel)] text-center py-8">暂无启用的查询技能</p>
              ) : (
                previewData.skills.map((item, idx) => (
                  <div key={item.skillId}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold">{idx + 1}</span>
                      <h4 className="text-sm font-medium text-[var(--ink)]">{item.skillName}</h4>
                      <span className="text-[10px] text-[var(--steel)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded">{item.skillDir}</span>
                    </div>
                    <p className="text-xs text-[var(--slate)] mb-1">
                      System Prompt 摘要: <code className="text-[var(--primary)]">{item.skillSummary}</code>
                    </p>
                    <pre className="text-sm font-mono text-[var(--ink)] whitespace-pre-wrap bg-[var(--canvas)] rounded-lg p-4 border border-[var(--hairline)] max-h-[200px] overflow-auto">
                      {item.skillFullContent}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/QuerySkills/QuerySkillsPage.tsx
git commit -m "feat: add QuerySkillsPage with 3-column layout, domain filter, skill list, preview"
```

---

### Task 7: Frontend — SkillForm

**Files:**
- Create: `packages/web/src/components/QuerySkills/SkillForm.tsx`

- [ ] **Step 1: Create SkillForm.tsx**

Create `packages/web/src/components/QuerySkills/SkillForm.tsx`:

```tsx
import { useState, useEffect } from "react";
import { querySkillApi, type QuerySkill, type CoreTableEntry } from "../../api/client";

interface SkillFormProps {
  datasourceId: string;
  skill: QuerySkill | null; // null = create new
  initialData?: any | null; // AI-generated data to pre-fill
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onClearInitialData: () => void;
}

interface FormData {
  domain: string;
  name: string;
  trigger_keywords: string; // comma-separated input
  business_context: string;
  core_tables: CoreTableEntry[];
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
}

export default function SkillForm({
  datasourceId,
  skill,
  initialData,
  onSave,
  onDelete,
  onCancel,
  onClearInitialData,
}: SkillFormProps) {
  const [form, setForm] = useState<FormData>({
    domain: "",
    name: "",
    trigger_keywords: "",
    business_context: "",
    core_tables: [],
    join_path: "",
    query_steps: "",
    example_sql: "",
    caveats: "",
    common_issues: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form from skill or initialData
  useEffect(() => {
    if (skill) {
      let keywords: string[] = [];
      try { keywords = JSON.parse(skill.trigger_keywords) as string[]; } catch {}
      let coreTables: CoreTableEntry[] = [];
      try { coreTables = JSON.parse(skill.core_tables) as CoreTableEntry[]; } catch {}

      setForm({
        domain: skill.domain,
        name: skill.name,
        trigger_keywords: keywords.join(", "),
        business_context: skill.business_context,
        core_tables: coreTables,
        join_path: skill.join_path,
        query_steps: skill.query_steps,
        example_sql: skill.example_sql,
        caveats: skill.caveats,
        common_issues: skill.common_issues,
      });
    } else if (initialData) {
      let keywords: string[] = initialData.trigger_keywords || [];
      let coreTables: CoreTableEntry[] = initialData.core_tables || [];

      setForm({
        domain: initialData.domain || "",
        name: initialData.name || "",
        trigger_keywords: Array.isArray(keywords) ? keywords.join(", ") : String(keywords),
        business_context: initialData.business_context || "",
        core_tables: coreTables,
        join_path: initialData.join_path || "",
        query_steps: initialData.query_steps || "",
        example_sql: initialData.example_sql || "",
        caveats: initialData.caveats || "",
        common_issues: initialData.common_issues || "",
      });
      onClearInitialData();
    } else {
      setForm({
        domain: "",
        name: "",
        trigger_keywords: "",
        business_context: "",
        core_tables: [],
        join_path: "",
        query_steps: "",
        example_sql: "",
        caveats: "",
        common_issues: "",
      });
    }
  }, [skill, initialData]);

  const handleFieldChange = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCoreTableChange = (index: number, field: keyof CoreTableEntry, value: string) => {
    setForm((prev) => {
      const updated = [...prev.core_tables];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, core_tables: updated };
    });
  };

  const addCoreTable = () => {
    setForm((prev) => ({
      ...prev,
      core_tables: [...prev.core_tables, { table: "", purpose: "" }],
    }));
  };

  const removeCoreTable = (index: number) => {
    setForm((prev) => ({
      ...prev,
      core_tables: prev.core_tables.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    // Validate required fields
    if (!form.domain.trim()) { setError("请填写业务域"); return; }
    if (!form.name.trim()) { setError("请填写技能名称"); return; }
    if (!form.query_steps.trim()) { setError("请填写查询步骤"); return; }

    setSaving(true);
    setError(null);

    const keywords = form.trigger_keywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      domain: form.domain,
      name: form.name,
      trigger_keywords: JSON.stringify(keywords),
      business_context: form.business_context,
      core_tables: JSON.stringify(form.core_tables.filter((ct) => ct.table.trim())),
      join_path: form.join_path,
      query_steps: form.query_steps,
      example_sql: form.example_sql,
      caveats: form.caveats,
      common_issues: form.common_issues,
    };

    try {
      if (skill) {
        await querySkillApi.update(datasourceId, skill.id, payload);
      } else {
        await querySkillApi.create(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      await querySkillApi.delete(datasourceId, skill.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display text-heading-3 text-[var(--ink)]">
            {skill ? "编辑" : "新增"}查询技能
          </h3>
        </div>
        {skill && (
          <button onClick={handleDelete} disabled={deleting} className="btn-danger text-xs">
            {deleting ? "删除中..." : "删除"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Domain */}
        <div>
          <label className="label-mono mb-1.5 block">
            业务域<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            className="input-field w-full"
            value={form.domain}
            onChange={(e) => handleFieldChange("domain", e.target.value)}
            placeholder="如：账单、人力资源、库存"
          />
        </div>

        {/* Name */}
        <div>
          <label className="label-mono mb-1.5 block">
            技能名称<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            className="input-field w-full"
            value={form.name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
            placeholder="如：客户账单明细查询"
          />
        </div>

        {/* Trigger Keywords */}
        <div>
          <label className="label-mono mb-1.5 block">触发关键词</label>
          <input
            type="text"
            className="input-field w-full"
            value={form.trigger_keywords}
            onChange={(e) => handleFieldChange("trigger_keywords", e.target.value)}
            placeholder="用逗号分隔，如：账单, billing, 客户明细"
          />
          <p className="text-[10px] text-[var(--stone)] mt-1">用户提到这些词时，Agent 会自动加载此技能</p>
        </div>

        {/* Business Context */}
        <div>
          <label className="label-mono mb-1.5 block">业务背景</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.business_context}
            onChange={(e) => handleFieldChange("business_context", e.target.value)}
            placeholder="2-3句话说明这个场景的业务含义"
          />
        </div>

        {/* Core Tables */}
        <div>
          <label className="label-mono mb-1.5 block">核心表</label>
          {form.core_tables.map((ct, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                className="input-field flex-1"
                value={ct.table}
                onChange={(e) => handleCoreTableChange(idx, "table", e.target.value)}
                placeholder="表名"
              />
              <input
                type="text"
                className="input-field flex-1"
                value={ct.purpose}
                onChange={(e) => handleCoreTableChange(idx, "purpose", e.target.value)}
                placeholder="用途说明"
              />
              <button
                onClick={() => removeCoreTable(idx)}
                className="text-[var(--error)] text-xs hover:underline flex-shrink-0"
              >
                移除
              </button>
            </div>
          ))}
          <button onClick={addCoreTable} className="text-xs text-[var(--primary)] hover:underline">
            + 添加核心表
          </button>
        </div>

        {/* Join Path */}
        <div>
          <label className="label-mono mb-1.5 block">关联路径</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.join_path}
            onChange={(e) => handleFieldChange("join_path", e.target.value)}
            placeholder="如：ads_bill → dim_customer ON customer_id"
          />
        </div>

        {/* Query Steps */}
        <div>
          <label className="label-mono mb-1.5 block">
            查询步骤<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <textarea
            className="input-field w-full resize-y"
            rows={3}
            value={form.query_steps}
            onChange={(e) => handleFieldChange("query_steps", e.target.value)}
            placeholder="1.从ads_bill取客户账单汇总&#10;2.关联dim_customer取客户信息&#10;3.关联dwd_bill_detail取明细"
          />
        </div>

        {/* Example SQL */}
        <div>
          <label className="label-mono mb-1.5 block">示例SQL</label>
          <textarea
            className="input-field w-full resize-y font-mono text-xs"
            rows={5}
            value={form.example_sql}
            onChange={(e) => handleFieldChange("example_sql", e.target.value)}
            placeholder="SELECT ... FROM ... JOIN ... WHERE ..."
          />
        </div>

        {/* Caveats */}
        <div>
          <label className="label-mono mb-1.5 block">注意事项</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.caveats}
            onChange={(e) => handleFieldChange("caveats", e.target.value)}
            placeholder="数据质量、字段含义、常见陷阱"
          />
        </div>

        {/* Common Issues */}
        <div>
          <label className="label-mono mb-1.5 block">常见问题</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.common_issues}
            onChange={(e) => handleFieldChange("common_issues", e.target.value)}
            placeholder="用户可能遇到的典型问题和处理方式"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 px-3 py-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 text-[var(--error)] text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[var(--hairline)]">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel} className="btn-ghost">取消</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/QuerySkills/SkillForm.tsx
git commit -m "feat: add SkillForm with structured fields for query skill editing"
```

---

### Task 8: Frontend — AIGenerateDialog

**Files:**
- Create: `packages/web/src/components/QuerySkills/AIGenerateDialog.tsx`

- [ ] **Step 1: Create AIGenerateDialog.tsx**

Create `packages/web/src/components/QuerySkills/AIGenerateDialog.tsx`:

```tsx
import { useState } from "react";
import { querySkillApi } from "../../api/client";

interface AIGenerateDialogProps {
  datasourceId: string;
  onGenerated: (skillData: any) => void;
  onClose: () => void;
}

export default function AIGenerateDialog({
  datasourceId,
  onGenerated,
  onClose,
}: AIGenerateDialogProps) {
  const [domain, setDomain] = useState("");
  const [scenario, setScenario] = useState("");
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!domain.trim()) { setError("请填写业务域"); return; }
    if (mode === "single" && !scenario.trim()) { setError("请填写场景描述"); return; }

    setGenerating(true);
    setError(null);

    try {
      if (mode === "single") {
        const result = await querySkillApi.generate(datasourceId, {
          domain: domain.trim(),
          scenario: scenario.trim(),
        });
        onGenerated(result.skill);
      } else {
        const result = await querySkillApi.generateBatch(datasourceId, {
          domain: domain.trim(),
        });
        // For batch, pass the first skill and let user save one by one
        // Or we could auto-create all — for now, pass the array and let the page handle it
        onGenerated({ _batch: true, skills: result.skills });
      }
    } catch (err) {
      setError((err as Error).message || "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--hairline)] w-full max-w-lg mx-4">
        <div className="sunset-stripe" />
        <div className="px-6 py-4 border-b border-[var(--hairline)]">
          <h3 className="font-display text-lg text-[var(--ink)]">AI 生成查询技能</h3>
          <p className="text-xs text-[var(--steel)] mt-0.5">
            AI 分析数据库 Schema，自动生成查询技能攻略
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("single")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "single"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              单个场景
            </button>
            <button
              onClick={() => setMode("batch")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "batch"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              批量生成
            </button>
          </div>

          {/* Domain */}
          <div>
            <label className="label-mono mb-1.5 block">
              业务域<span className="text-[var(--error)] ml-0.5">*</span>
            </label>
            <input
              type="text"
              className="input-field w-full"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="如：账单、人力资源、库存"
            />
          </div>

          {/* Scenario (single mode only) */}
          {mode === "single" && (
            <div>
              <label className="label-mono mb-1.5 block">
                场景描述<span className="text-[var(--error)] ml-0.5">*</span>
              </label>
              <textarea
                className="input-field w-full resize-y"
                rows={3}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="如：查询客户的账单明细，包括账单汇总和明细流水"
              />
            </div>
          )}

          {mode === "batch" && (
            <p className="text-xs text-[var(--slate)]">
              AI 将自动识别「{domain || "该业务域"}」下的 3-5 个典型查询场景，为每个场景生成完整技能
            </p>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 text-[var(--error)] text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--hairline)]">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating ? "生成中..." : "生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/QuerySkills/AIGenerateDialog.tsx
git commit -m "feat: add AIGenerateDialog for single and batch skill generation"
```

---

### Task 9: Frontend — Wire up navigation & App.tsx

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `packages/web/src/components/Layout.tsx`
- Delete: `packages/web/src/components/BusinessKnowledge/` (entire directory)

- [ ] **Step 1: Update App.tsx**

Replace the BusinessKnowledge import:
```typescript
import BusinessKnowledgePage from "./components/BusinessKnowledge/BusinessKnowledgePage";
```
With:
```typescript
import QuerySkillsPage from "./components/QuerySkills/QuerySkillsPage";
```

Replace the businessKnowledge view rendering:
```tsx
{view === "businessKnowledge" && selectedDatasourceId && <BusinessKnowledgePage />}
{view === "businessKnowledge" && !selectedDatasourceId && (
  <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
    <div className="text-center">
      <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
      <p className="text-xs text-[var(--steel)] mt-2">
        前往数据源页面选择一个数据源以管理业务知识
      </p>
    </div>
  </div>
)}
```
With:
```tsx
{view === "querySkills" && selectedDatasourceId && <QuerySkillsPage />}
{view === "querySkills" && !selectedDatasourceId && (
  <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
    <div className="text-center">
      <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
      <p className="text-xs text-[var(--steel)] mt-2">
        前往数据源页面选择一个数据源以管理查询技能
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 2: Update Sidebar.tsx**

In `packages/web/src/components/Sidebar.tsx`, change the navItems entry:
```typescript
{ key: "businessKnowledge", label: "业务知识", icon: "🧠" },
```
To:
```typescript
{ key: "querySkills", label: "查询技能", icon: "🎯" },
```

- [ ] **Step 3: Update Layout.tsx**

In `packages/web/src/components/Layout.tsx`, change the navItems entry:
```typescript
{ key: "businessKnowledge", label: "业务知识", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
```
To:
```typescript
{ key: "querySkills", label: "查询技能", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
```

- [ ] **Step 4: Delete BusinessKnowledge directory**

```bash
rm -rf packages/web/src/components/BusinessKnowledge/
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/Sidebar.tsx packages/web/src/components/Layout.tsx
git rm -r packages/web/src/components/BusinessKnowledge/
git commit -m "feat: wire up QuerySkillsPage in navigation, remove BusinessKnowledge components"
```

---

### Task 10: TypeScript check & fix remaining issues

**Files:**
- Fix any issues found in previous tasks

- [ ] **Step 1: Run server TypeScript check**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json 2>&1 | head -40`

Expected: No errors. Fix any remaining references to `BusinessKnowledge`, `KnowledgeCategory`, `business-knowledge`, or `knowledge-formatter`.

- [ ] **Step 2: Run web TypeScript check**

Run: `npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 | head -40`

Expected: No errors. Fix any remaining references to `businessKnowledgeApi`, `BusinessKnowledge`, or `BusinessKnowledgePage`.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors in query-skills implementation"
```

---

### Task 11: End-to-end verification with agent-browser

**Files:**
- No code changes — verification only

- [ ] **Step 1: Start the dev servers**

Run: `npm run dev:server` in one terminal, `npm run dev:web` in another.

Wait for both servers to be ready (server on :3000, web on :5173).

- [ ] **Step 2: Use agent-browser to verify navigation and UI**

Use the `agent-browser` skill to open `http://localhost:5173` and verify:

1. "查询技能" appears in the sidebar with 🎯 icon
2. Clicking "查询技能" shows the QuerySkillsPage with three-column layout
3. Without a datasource selected, the page shows "请先选择一个数据源" message

- [ ] **Step 3: Use agent-browser to verify CRUD flow**

Using `agent-browser`, perform and verify:

1. Select a datasource from the sidebar
2. Click "新增技能" → the skill form appears on the right
3. Fill in: 业务域="测试域", 技能名称="测试查询技能", 查询步骤="1.查询测试表"
4. Click "保存" → the skill appears in the middle column list
5. Click the skill in the list → form shows the skill data
6. Edit the skill name → click "保存" → change persists
7. Toggle the enable/disable switch → skill state changes visually
8. Click "删除" → skill removed from list

- [ ] **Step 4: Use agent-browser to verify AI generation dialog**

Using `agent-browser`:

1. Click "AI 生成" button → dialog appears
2. Verify "单个场景" and "批量生成" toggle options are visible
3. Enter 业务域="测试" and a scenario description
4. Click "生成" (note: this will call the real DeepSeek API, so it may fail without a key — that's OK for UI verification)
5. Close the dialog

- [ ] **Step 5: Use agent-browser to verify AI perspective preview**

Using `agent-browser`:

1. Click "预览 AI 视角" button
2. Verify the preview modal shows the skill's System Prompt summary and full content
3. Close the modal

- [ ] **Step 6: Verify SKILL.md file generation on disk**

Run: `ls -la data/skills/qs-*/SKILL.md`

Expected: A SKILL.md file exists for each enabled skill. The file content should match the format defined in the spec (YAML frontmatter with name/description, followed by markdown sections).

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete query-skills module replacing business-knowledge"
```
