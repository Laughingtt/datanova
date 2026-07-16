import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, Skill } from "@earendil-works/pi-agent-core";
import { formatSkillInvocation } from "@earendil-works/pi-agent-core";

const ReadSkillParams = Type.Object({
  skill_name: Type.String({
    description: "The name of the skill to read. Must match one of the available skills listed in the system prompt.",
  }),
});

type ReadSkillParams = Static<typeof ReadSkillParams>;

/**
 * Create the read_skill tool for progressive skill loading.
 *
 * Uses the SDK's formatSkillInvocation() to format the full skill content
 * when the Agent requests it. Skills are looked up from the resources.skills
 * array that was loaded at harness creation time.
 *
 * For query skills (qs- prefix), the tool loads fresh content
 * from the database to ensure the latest query strategies are applied.
 */
export function createReadSkillTool(getSkills: () => Skill[]): AgentTool<typeof ReadSkillParams, { loaded: boolean }> {
  return {
    name: "read_skill",
    description: `Read the full content of a skill when your task matches its description.

The system prompt lists available skills with their names and short descriptions. When a user's question relates to a skill's domain, call this tool to load the full skill instructions.

For query skills (names starting with "qs-"), the tool loads the full query strategy including core tables, join paths, query steps, example SQL, caveats, and common issues. Apply these when writing SQL queries.

Example: if a skill named "qs-abc123" has description "账单: 客户账单明细查询", and the user asks about 账单/billing, call read_skill with skill_name="qs-abc123".`,
    label: "Read Skill",
    parameters: ReadSkillParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as ReadSkillParams;
      const skillName = typedParams.skill_name;

      try {
        const skills = getSkills();
        const skill = skills.find((s) => s.name === skillName);

        if (!skill) {
          const skillList = skills.map((s) => `  - ${s.name}: ${s.description}`).join("\n");
          return {
            content: [{ type: "text" as const, text: `Skill "${skillName}" not found.\n\nAvailable skills:\n${skillList}` }],
            details: { loaded: false },
          };
        }

        // Use SDK's formatSkillInvocation to format the full content
        const formatted = formatSkillInvocation(skill);

        return {
          content: [{ type: "text" as const, text: formatted }],
          details: { loaded: true, skill_name: skillName },
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error reading skill "${skillName}": ${error.message}` }],
          details: { loaded: false },
          isError: true,
        };
      }
    },
  };
}
