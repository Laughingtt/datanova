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
