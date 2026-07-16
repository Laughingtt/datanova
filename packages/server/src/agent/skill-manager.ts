import fs from "node:fs";
import path from "node:path";
import { SKILLS_DIR } from "../config.js";
import type { Skill } from "@earendil-works/pi-agent-core";

export interface SkillFile {
  name: string;
  path: string;
  content: string;
}

/**
 * List all skill files from the skills/ directory.
 */
export function listSkillFiles(): SkillFile[] {
  const skills: SkillFile[] = [];

  for (const dir of [SKILLS_DIR]) {
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
  const skillPath = path.join(SKILLS_DIR, name, "SKILL.md");
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, "utf-8");
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

  return false;
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Returns { frontmatter, body } or null if no valid frontmatter.
 */
function parseFrontmatter(rawContent: string): { frontmatter: Record<string, string>; body: string } | null {
  const normalized = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) return null;

  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) return null;

  const yamlString = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 4).trim();

  // Simple YAML parsing for flat key: value pairs
  const frontmatter: Record<string, string> = {};
  for (const line of yamlString.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Load all skills as pi Skill objects.
 *
 * Reads SKILL.md files with YAML frontmatter (name, description).
 * Falls back to directory name as name and first heading as description
 * for SKILL.md files without frontmatter.
 */
export function loadAllSkills(): Skill[] {
  const skillFiles = listSkillFiles();

  return skillFiles.map((sf) => {
    const parsed = parseFrontmatter(sf.content);

    if (parsed?.frontmatter.name && parsed?.frontmatter.description) {
      // SKILL.md with valid frontmatter — use it directly
      return {
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        content: parsed.body,
        filePath: sf.path,
      };
    }

    // Fallback: extract description from first heading
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
