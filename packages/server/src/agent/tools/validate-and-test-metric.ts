import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { validateSqlViaExplain, executeSql } from "../../mysql/executor.js";
import { normalizeSql } from "./sql-normalize.js";

const ValidateAndTestMetricParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  sql: Type.String({ description: "待验证的SQL语句" }),
  metric_type: Type.String({ description: "指标类型: atomic | derived | compound" }),
});

type ValidateAndTestMetricParams = Static<typeof ValidateAndTestMetricParams>;

interface ValidationError {
  step: string;
  message: string;
  suggestion?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  test_result?: {
    row_count: number;
    sample_rows: any[];
    column_types: Record<string, string>;
    null_ratios: Record<string, number>;
    warnings: string[];
  };
}

export function createValidateAndTestMetricTool(): AgentTool<typeof ValidateAndTestMetricParams, ValidationResult> {
  return {
    name: "validate_and_test_metric",
    description: `验证指标SQL的正确性。执行以下检查：
1. 语法验证 — EXPLAIN检查SQL语法
2. 执行测试 — 执行SQL + LIMIT 10获取样本数据
3. 结果分析 — 行数、空值比例、数值范围等合理性检查

返回验证报告，包含错误详情和修复建议。`,
    label: "验证测试指标SQL",
    parameters: ValidateAndTestMetricParams,
    execute: async (_toolCallId: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }>; details: ValidationResult }> => {
      const typedParams = params as ValidateAndTestMetricParams;
      // Normalize SQL — fix keyword粘连 (e.g. "revenueFROM" → "revenue FROM")
      const sql = normalizeSql(typedParams.sql);
      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Step 1: 语法验证
      const explainResult = await validateSqlViaExplain(typedParams.datasource_id, sql);
      if (!explainResult.valid) {
        errors.push({
          step: "语法验证",
          message: `SQL语法错误: ${explainResult.error}`,
          suggestion: "请检查SQL语法，确保表名、字段名、函数名正确",
        });
        const result: ValidationResult = { valid: false, errors };
        return {
          content: [{ type: "text", text: `SQL验证失败:\n${JSON.stringify(result, null, 2)}` }],
          details: result,
        };
      }

      // Step 2: 执行测试
      let testRows: any[] = [];
      let columnTypes: Record<string, string> = {};
      let nullRatios: Record<string, number> = {};
      let rowCount = 0;

      try {
        const testSql = sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
        const execResult = await executeSql(typedParams.datasource_id, testSql, { timeout: 10000, rowLimit: 10 });
        testRows = execResult.rows || [];
        rowCount = testRows.length;

        if (testRows.length > 0) {
          columnTypes = Object.fromEntries(
            Object.keys(testRows[0]).map(k => [k, typeof testRows[0][k]])
          );
          // 计算空值比例
          for (const col of Object.keys(testRows[0])) {
            const nullCount = testRows.filter(r => r[col] === null || r[col] === undefined || r[col] === '').length;
            nullRatios[col] = Math.round((nullCount / testRows.length) * 100) / 100;
          }
        }
      } catch (err) {
        errors.push({
          step: "执行测试",
          message: `SQL执行错误: ${(err as Error).message}`,
          suggestion: "请检查SQL逻辑，可能是字段名错误或JOIN条件有误",
        });
        const result: ValidationResult = { valid: false, errors };
        return {
          content: [{ type: "text", text: `SQL执行失败:\n${JSON.stringify(result, null, 2)}` }],
          details: result,
        };
      }

      // Step 3: 结果合理性检查
      if (rowCount === 0) {
        warnings.push("查询返回0行数据，可能WHERE条件过于严格或SQL逻辑有误");
      }

      for (const [col, ratio] of Object.entries(nullRatios)) {
        if (ratio > 0.5) {
          warnings.push(`列 "${col}" 空值比例 ${Math.round(ratio * 100)}%，可能JOIN条件遗漏或数据质量问题`);
        }
      }

      // 数值范围检查
      for (const col of Object.keys(columnTypes)) {
        if (columnTypes[col] === "number") {
          const values = testRows.map(r => r[col]).filter(v => v !== null && v !== undefined) as number[];
          if (values.length > 0) {
            const hasNegative = values.some(v => v < 0);
            const maxVal = Math.max(...values);
            if (hasNegative && !sql.toLowerCase().includes("difference") && !sql.toLowerCase().includes("change")) {
              warnings.push(`列 "${col}" 包含负数值(${Math.min(...values)})，请确认业务逻辑是否允许`);
            }
            if (maxVal > 1e12) {
              warnings.push(`列 "${col}" 包含极大值(${maxVal})，请确认聚合逻辑是否正确`);
            }
          }
        }
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        test_result: {
          row_count: rowCount,
          sample_rows: testRows.slice(0, 3),
          column_types: columnTypes,
          null_ratios: nullRatios,
          warnings,
        },
      };

      const summary = errors.length === 0
        ? `✅ 验证通过！返回${rowCount}行数据${warnings.length > 0 ? `，${warnings.length}个警告` : ""}`
        : `❌ 验证失败，${errors.length}个错误`;

      return {
        content: [{ type: "text", text: `${summary}\n${JSON.stringify(result, null, 2)}` }],
        details: result,
      };
    },
  };
}
