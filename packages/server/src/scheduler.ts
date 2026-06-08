import nodeCron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { listScheduledQueries, listDatasources, updateScheduledQuery, createAlert, createExecutionHistory, listExecutionHistory } from "./store.js";
import { executeSql } from "./mysql/executor.js";

const scheduledTasks = new Map<string, ScheduledTask>();
const abortControllers = new Map<string, AbortController>();

export function registerScheduledQuery(sq: {
  id: string;
  cron_expression: string;
  sql: string;
  datasource_id: string;
  enabled: number;
  alert_conditions: string | null;
  timezone?: string;
}): void {
  if (!sq.enabled) return;
  if (scheduledTasks.has(sq.id)) return;

  const timezone = sq.timezone || "UTC";
  const task = nodeCron.schedule(sq.cron_expression, async () => {
    await executeScheduledQuery(sq.id, sq.datasource_id, sq.sql, sq.alert_conditions);
  }, { timezone });

  scheduledTasks.set(sq.id, task);
}

export function unregisterScheduledQuery(id: string): void {
  const task = scheduledTasks.get(id);
  if (task) {
    task.stop();
    scheduledTasks.delete(id);
  }
  const ac = abortControllers.get(id);
  if (ac) {
    ac.abort();
    abortControllers.delete(id);
  }
}

export async function executeScheduledQuery(
  queryId: string,
  datasourceId: string,
  sql: string,
  alertConditionsJson: string | null
): Promise<void> {
  const ac = new AbortController();
  abortControllers.set(queryId, ac);
  const startTime = Date.now();

  try {
    const result = await executeSql(datasourceId, sql, { timeout: 30000, rowLimit: 100 });
    const executionTime = Date.now() - startTime;

    const summary = JSON.stringify({
      rowCount: result.rowCount,
      executionTime: result.executionTime,
      columns: result.columns,
      sampleRows: result.rows.slice(0, 5),
    });

    updateScheduledQuery(queryId, {
      last_run_at: new Date().toISOString(),
      last_run_status: "success",
      last_run_result: summary,
    });

    createExecutionHistory({
      scheduled_query_id: queryId,
      executed_at: new Date().toISOString(),
      status: "success",
      result_summary: summary,
      execution_time_ms: executionTime,
      row_count: result.rowCount,
    });

    if (alertConditionsJson) {
      checkAlertConditions(queryId, result, alertConditionsJson);
    }
  } catch (err) {
    const executionTime = Date.now() - startTime;
    const errorSummary = JSON.stringify({ error: (err as Error).message });

    updateScheduledQuery(queryId, {
      last_run_at: new Date().toISOString(),
      last_run_status: "error",
      last_run_result: errorSummary,
    });

    createExecutionHistory({
      scheduled_query_id: queryId,
      executed_at: new Date().toISOString(),
      status: "error",
      result_summary: errorSummary,
      execution_time_ms: executionTime,
      row_count: null,
    });
  } finally {
    abortControllers.delete(queryId);
  }
}

function checkAlertConditions(
  queryId: string,
  result: { columns: string[]; rows: Record<string, unknown>[] },
  alertConditionsJson: string
): void {
  try {
    const conditions = JSON.parse(alertConditionsJson) as Array<{
      metric_column: string;
      condition: "above" | "below" | "change_above" | "change_below";
      threshold: number;
    }>;

    for (const cond of conditions) {
      if (result.rows.length === 0) continue;
      const firstRow = result.rows[0];
      const value = Number(firstRow[cond.metric_column]);
      if (isNaN(value)) continue;

      switch (cond.condition) {
        case "above":
          if (value > cond.threshold) {
            createAlert({
              scheduled_query_id: queryId,
              severity: value > cond.threshold * 1.5 ? "critical" : "warning",
              condition_triggered: `${cond.metric_column} above ${cond.threshold}`,
              actual_value: String(value),
              threshold: String(cond.threshold),
            });
          }
          break;
        case "below":
          if (value < cond.threshold) {
            createAlert({
              scheduled_query_id: queryId,
              severity: value < cond.threshold * 0.5 ? "critical" : "warning",
              condition_triggered: `${cond.metric_column} below ${cond.threshold}`,
              actual_value: String(value),
              threshold: String(cond.threshold),
            });
          }
          break;
        case "change_above": {
          // Compare with previous successful execution
          const prevHistory = listExecutionHistory(queryId, 2);
          const prevSuccess = prevHistory.find(h => h.status === "success");
          if (prevSuccess && prevSuccess.result_summary) {
            try {
              const prevSummary = JSON.parse(prevSuccess.result_summary);
              const prevRows = prevSummary.sampleRows as Record<string, unknown>[] | undefined;
              if (prevRows && prevRows.length > 0) {
                const prevValue = Number(prevRows[0][cond.metric_column]);
                if (!isNaN(prevValue) && prevValue !== 0) {
                  const pctChange = ((value - prevValue) / Math.abs(prevValue)) * 100;
                  if (pctChange > cond.threshold) {
                    createAlert({
                      scheduled_query_id: queryId,
                      severity: pctChange > cond.threshold * 2 ? "critical" : "warning",
                      condition_triggered: `${cond.metric_column} increased by ${pctChange.toFixed(1)}% (threshold: ${cond.threshold}%)`,
                      actual_value: String(Math.round(pctChange * 10) / 10) + "%",
                      threshold: String(cond.threshold) + "%",
                    });
                  }
                }
              }
            } catch { /* skip if previous result can't be parsed */ }
          }
          break;
        }
        case "change_below": {
          // Compare with previous successful execution
          const prevHistory = listExecutionHistory(queryId, 2);
          const prevSuccess = prevHistory.find(h => h.status === "success");
          if (prevSuccess && prevSuccess.result_summary) {
            try {
              const prevSummary = JSON.parse(prevSuccess.result_summary);
              const prevRows = prevSummary.sampleRows as Record<string, unknown>[] | undefined;
              if (prevRows && prevRows.length > 0) {
                const prevValue = Number(prevRows[0][cond.metric_column]);
                if (!isNaN(prevValue) && prevValue !== 0) {
                  const pctChange = ((value - prevValue) / Math.abs(prevValue)) * 100;
                  if (pctChange < -cond.threshold) {
                    createAlert({
                      scheduled_query_id: queryId,
                      severity: Math.abs(pctChange) > cond.threshold * 2 ? "critical" : "warning",
                      condition_triggered: `${cond.metric_column} decreased by ${Math.abs(pctChange).toFixed(1)}% (threshold: ${cond.threshold}%)`,
                      actual_value: String(Math.round(pctChange * 10) / 10) + "%",
                      threshold: String(cond.threshold) + "%",
                    });
                  }
                }
              }
            } catch { /* skip if previous result can't be parsed */ }
          }
          break;
        }
      }
    }
  } catch { /* skip invalid alert conditions */ }
}

/** Load all enabled scheduled queries and register their cron jobs. */
export function startScheduler(): void {
  for (const ds of listDatasources()) {
    const queries = listScheduledQueries(ds.id);
    for (const sq of queries) {
      if (sq.enabled) {
        registerScheduledQuery(sq);
      }
    }
  }
  console.log(`Scheduler started: ${scheduledTasks.size} jobs registered`);
}

export function stopScheduler(): void {
  for (const [id] of scheduledTasks) {
    const ac = abortControllers.get(id);
    if (ac) ac.abort();
    const task = scheduledTasks.get(id);
    if (task) task.stop();
  }
  scheduledTasks.clear();
  abortControllers.clear();
}