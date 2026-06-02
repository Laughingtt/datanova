import fs from "node:fs";
import path from "node:path";
import { SKILLS_DIR, ANNOTATIONS_DIR } from "../config.js";
import { getAnnotations } from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";
import type { Skill } from "@earendil-works/pi-agent-core";

export interface SkillFile {
  name: string;
  path: string;
  content: string;
}

/**
 * List all skill files from the skills/ and annotations/ directories.
 */
export function listSkillFiles(): SkillFile[] {
  const skills: SkillFile[] = [];

  for (const dir of [SKILLS_DIR, ANNOTATIONS_DIR]) {
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dir, entry.name, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, "utf-8");
          skills.push({
            name: entry.name,
            path: skillPath,
            content,
          });
        }
      }
    }
  }

  return skills;
}

/**
 * Get the content of a specific skill.
 */
export function getSkillContent(name: string): string | null {
  // Check skills dir first
  const skillPath = path.join(SKILLS_DIR, name, "SKILL.md");
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, "utf-8");
  }

  // Check annotations dir
  const annotationPath = path.join(ANNOTATIONS_DIR, name, "SKILL.md");
  if (fs.existsSync(annotationPath)) {
    return fs.readFileSync(annotationPath, "utf-8");
  }

  return null;
}

/**
 * Save a skill (create or update).
 */
export function saveSkill(name: string, content: string): SkillFile {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const skillPath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillPath, content, "utf-8");

  return { name, path: skillPath, content };
}

/**
 * Delete a skill.
 */
export function deleteSkill(name: string): boolean {
  const skillDir = path.join(SKILLS_DIR, name);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
    return true;
  }

  const annotationDir = path.join(ANNOTATIONS_DIR, name);
  if (fs.existsSync(annotationDir)) {
    fs.rmSync(annotationDir, { recursive: true, force: true });
    return true;
  }

  return false;
}

/**
 * Auto-generate a SKILL.md from schema annotations for a datasource.
 */
export async function generateAnnotationSkill(datasourceId: string, datasourceName: string): Promise<SkillFile | null> {
  const annotations = getAnnotations(datasourceId);

  if (annotations.length === 0) {
    return null;
  }

  // Group annotations by table
  const tableAnnotations = new Map<string, Map<string, string>>();

  for (const ann of annotations) {
    if (!tableAnnotations.has(ann.table_name)) {
      tableAnnotations.set(ann.table_name, new Map());
    }

    if (ann.field_name) {
      tableAnnotations.get(ann.table_name)!.set(ann.field_name, ann.annotation);
    } else {
      // Table-level annotation stored with empty key
      tableAnnotations.get(ann.table_name)!.set("", ann.annotation);
    }
  }

  // Build SKILL.md content
  const lines: string[] = [];
  lines.push(`# ${datasourceName} Schema Annotations`);
  lines.push("");
  lines.push("This skill provides business context for the database schema.");
  lines.push("");
  lines.push("## Business Context");
  lines.push("");

  for (const [tableName, fields] of tableAnnotations) {
    const tableDesc = fields.get("");
    lines.push(`### ${tableName}`);
    if (tableDesc) {
      lines.push(`- **Table Description**: ${tableDesc}`);
    }

    for (const [fieldName, annotation] of fields) {
      if (fieldName === "") continue;
      lines.push(`- **${fieldName}**: ${annotation}`);
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const skillName = `${datasourceName}-annotations`;

  // Save to annotations dir
  const skillDir = path.join(ANNOTATIONS_DIR, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const skillPath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillPath, content, "utf-8");

  return { name: skillName, path: skillPath, content };
}

/**
 * Load all skills as pi Skill objects.
 */
export function loadAllSkills(): Skill[] {
  const skillFiles = listSkillFiles();

  return skillFiles.map((sf) => {
    // Extract description from first heading or first line
    const lines = sf.content.split("\n");
    const firstHeading = lines.find((l) => l.startsWith("# "));
    const description = firstHeading
      ? firstHeading.replace(/^# /, "").trim()
      : sf.name;

    return {
      name: sf.name,
      description,
      content: sf.content,
      filePath: sf.path,
    };
  });
}
