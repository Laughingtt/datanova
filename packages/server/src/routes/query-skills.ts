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

  // Preview the formatted prompt text that the AI will see
  // NOTE: Must be before /:id route to avoid "preview" being captured as :id
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
  // NOTE: Must be before /:id route
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
  // NOTE: Must be before /:id route
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
      trigger_keywords: typeof body.trigger_keywords === "string" ? body.trigger_keywords : JSON.stringify(body.trigger_keywords ?? []),
      business_context: body.business_context,
      core_tables: typeof body.core_tables === "string" ? body.core_tables : JSON.stringify(body.core_tables ?? []),
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
      trigger_keywords: body.trigger_keywords !== undefined
        ? (typeof body.trigger_keywords === "string" ? body.trigger_keywords : JSON.stringify(body.trigger_keywords))
        : undefined,
      business_context: body.business_context,
      core_tables: body.core_tables !== undefined
        ? (typeof body.core_tables === "string" ? body.core_tables : JSON.stringify(body.core_tables))
        : undefined,
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

  return app;
}
