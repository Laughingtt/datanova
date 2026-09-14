import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getAgentTrace } from "../../store.js";

const InferAgentChainParams = Type.Object({
  trace_id: Type.String({ description: "The agent trace ID to reconstruct the decision chain for" }),
  focus: Type.Optional(
    Type.String({ description: "Optional aspect to focus the reconstruction on, e.g. 'why execute_sql failed', 'why semantic layer was skipped'" })
  ),
});

type InferAgentChainParams = Static<typeof InferAgentChainParams>;

interface ChainStep {
  turn: number;
  thinking: string;
  tool: string;
  args_summary: string;
  result_summary: string;
  is_error: boolean;
}

/**
 * Build the prompt sent to the LLM to reconstruct an agent's full decision
 * chain from a recorded trace. The prompt gives the model the user question,
 * per-tool rationale, args, and outcomes, and asks for a structured narrative
 * explaining each decision point.
 */
function buildChainReconstructionPrompt(
  trace: {
    user_question: string;
    agent_type: string;
    datasource_name: string;
    thinking_summary: string;
    decision_rationale: string;
    final_sql: string | null;
    self_corrected: number;
    tool_details: string;
  },
  steps: ChainStep[],
  focus?: string,
): string {
  const stepsBlock = steps.map((s, i) => {
    const why = s.thinking.trim() || "（无明确推理记录）";
    return `【步骤 ${i + 1} · Turn ${s.turn}】
- 工具: ${s.tool}
- 抉择理由(why): ${why}
- 输入参数: ${s.args_summary || "—"}
- 执行结果: ${s.result_summary}
- 是否失败: ${s.is_error ? "是" : "否"}`;
  }).join("\n\n");

  const focusLine = focus ? `\n管理员特别关注：${focus}\n` : "";

  return `你是一名 Agent 链路审计员。下面是一条 ${trace.agent_type} Agent 处理用户问题时的完整决策追踪记录。你的任务是反推并重构这条 Agent 链路：解释每一步抉择点（为什么选这个工具、期望得到什么、实际结果如何、是否驱动了下一步或触发自修复），最终给出链路是否合理的判断。

用户问题: ${trace.user_question}
数据源: ${trace.datasource_name || "—"}
最终执行的 SQL: ${trace.final_sql || "无"}
是否发生自修复: ${trace.self_corrected === 1 ? "是" : "否"}
${focusLine}
链路综述(系统已合成):
${trace.decision_rationale || "（无）"}

整体思考摘要:
${trace.thinking_summary || "（无）"}

逐步骤明细:
${stepsBlock}

请输出严格 JSON（不要 markdown 代码块），结构如下：
{
  "chain_summary": "用 2-4 句话概述整条链路的走向与目的",
  "decision_points": [
    {
      "step": 1,
      "tool": "工具名",
      "rationale": "解释这一步为什么选择该工具，基于哪些信息",
      "expected": "调用前期望得到什么",
      "actual": "实际得到了什么结果",
      "drove_next": "这一步如何驱动了下一步决策，或为空字符串"
    }
  ],
  "self_correction_analysis": "若发生自修复，解释触发点与修复路径；否则说明无需修复",
  "chain_verdict": "合理 | 基本合理 | 存在缺陷",
  "verdict_reason": "判断依据",
  "improvement_suggestions": ["可选的改进建议1", "改进建议2"]
}`;
}

/**
 * Core reconstruction logic, exported so the HTTP route
 * (`/api/agent-traces/:id/infer-chain`) can call it directly without going
 * through the agent tool wrapper. Returns a structured result object.
 */
export async function inferAgentChain(
  traceId: string,
  focus?: string,
): Promise<{
  reconstructed: boolean;
  reason?: string;
  trace_id?: string;
  step_count?: number;
  llm_model?: string;
  chain?: unknown;
  text?: string;
  isError?: boolean;
}> {
  const trace = getAgentTrace(traceId);
  if (!trace) {
    return {
      reconstructed: false,
      reason: "trace_not_found",
      isError: true,
      text: `未找到 trace_id=${traceId} 的追踪记录。请确认 ID 正确。`,
    };
  }

  let steps: ChainStep[] = [];
  try { steps = JSON.parse(trace.tool_details) as ChainStep[]; } catch { steps = []; }

  if (steps.length === 0) {
    const fallback = {
      chain_summary: `该追踪无逐步骤明细。用户问题："${trace.user_question}"，最终 SQL：${trace.final_sql ?? "无"}。`,
      decision_points: [],
      self_correction_analysis: trace.self_corrected === 1 ? "记录显示发生过自修复，但缺少逐步骤明细，无法定位触发点。" : "未发生自修复。",
      chain_verdict: "信息不足",
      verdict_reason: "tool_details 为空，无法反推完整链路。",
      improvement_suggestions: ["确认该 trace 的会话已开启 thinking 记录"],
    };
    return {
      reconstructed: false,
      reason: "no_tool_details",
      trace_id: traceId,
      chain: fallback,
      text: JSON.stringify(fallback, null, 2),
    };
  }

  const prompt = buildChainReconstructionPrompt(trace, steps, focus);
  const reconstruction = await callLlmForChain(prompt);

  return {
    reconstructed: true,
    trace_id: traceId,
    step_count: steps.length,
    llm_model: reconstruction.model,
    chain: reconstruction.parsed ?? null,
    text: reconstruction.text,
  };
}

/**
 * Administrator tool — reconstructs a full agent decision chain from a recorded
 * trace. Given a trace_id, it loads the trace's per-tool rationale, args, and
 * outcomes, sends them to an LLM, and returns a structured narrative explaining
 * each decision point: why each tool was chosen, what was expected, what
 * actually happened, and whether the chain is sound.
 *
 * This is the "管理员能否根据功能 Agent 追踪推断出 Agent 链路" capability:
 * an auditor agent uses this tool to derive the decision chain from the
 * function agent's recorded behavior.
 */
export function createInferAgentChainTool(): AgentTool<typeof InferAgentChainParams, { reconstructed: boolean }> {
  return {
    name: "infer_agent_chain",
    description: `Reconstruct an agent's full decision chain from a recorded agent trace.

Given a trace_id, this tool reads the trace's per-tool rationale (why each tool was chosen), input args, and execution outcomes, then uses an LLM to produce a structured narrative explaining the entire decision path — each decision point's rationale, expectation, actual result, and how it drove the next step.

Use this as an administrator auditor to understand WHY a function agent (query / metric_dev) took the path it did, whether self-correction was triggered, and whether the chain is sound. Returns structured JSON: chain_summary, decision_points[], self_correction_analysis, chain_verdict, verdict_reason, improvement_suggestions[].`,
    label: "Infer Agent Chain",
    parameters: InferAgentChainParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as InferAgentChainParams;
      try {
        const result = await inferAgentChain(typedParams.trace_id, typedParams.focus);
        return {
          content: [{ type: "text", text: result.text ?? "" }],
          details: {
            reconstructed: result.reconstructed,
            trace_id: result.trace_id,
            step_count: result.step_count,
            llm_model: result.llm_model,
            chain: result.chain,
          },
          isError: result.isError === true,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `链路反推失败: ${(err as Error).message}` }],
          details: { reconstructed: false, reason: "exception" },
          isError: true,
        };
      }
    },
  };
}

/**
 * Call the LLM to reconstruct the chain. Uses ANTHROPIC_API_KEY (falls back to
 * DEEPSEEK_API_KEY) via direct fetch — same pattern as scheduled.ts generate-sql.
 * Returns the raw text and a best-effort parsed JSON object.
 */
async function callLlmForChain(prompt: string): Promise<{ text: string; parsed: unknown; model: string }> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  let text = "";
  let model = "";

  if (anthropicKey) {
    const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    model = process.env.DATANOVA_MODEL || "claude-sonnet-5";
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }
    const result = await response.json() as any;
    text = (result.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
  } else if (deepseekKey) {
    const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
    }
    const result = await response.json() as any;
    text = (result.choices?.[0]?.message?.content ?? "").trim();
  } else {
    // No LLM available — return a deterministic synthesis from the trace's own
    // decision_rationale so the tool degrades gracefully rather than erroring.
    model = "none";
    text = JSON.stringify({
      chain_summary: "未配置 LLM API Key，以下为基于 trace 字段的确定性反推。",
      decision_points: [],
      self_correction_analysis: "无 LLM，无法深度分析。",
      chain_verdict: "信息受限",
      verdict_reason: "未配置 ANTHROPIC_API_KEY / DEEPSEEK_API_KEY",
      improvement_suggestions: ["配置 LLM API Key 以启用完整链路反推"],
    }, null, 2);
  }

  // Strip markdown fences if the model wrapped the JSON.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(cleaned); } catch { parsed = null; }

  return { text: cleaned, parsed, model };
}
