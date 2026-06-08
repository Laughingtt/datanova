import { useState } from "react";
import AlertConfig from "./AlertConfig";
import { scheduledApi, type ScheduledQuery } from "../../api/client";

interface AlertCondition {
  metric_column: string;
  condition: "above" | "below" | "change_above" | "change_below";
  threshold: string;
}

interface ScheduledFormProps {
  datasourceId: string;
  query?: ScheduledQuery | null;
  onSave: () => void;
  onCancel: () => void;
}

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
];

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "First of month at midnight", value: "0 0 1 * *" },
];

function describeCron(expr: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === expr);
  if (preset) return preset.label;

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Invalid cron expression";

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const pieces: string[] = [];

  if (minute === "*" && hour === "*") {
    pieces.push("Every minute");
  } else if (hour === "*") {
    pieces.push(`Every hour at minute ${minute}`);
  } else if (hour.startsWith("*/")) {
    pieces.push(`Every ${hour.slice(2)} hours at minute ${minute}`);
  } else if (dayOfWeek !== "*") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayIdx = parseInt(dayOfWeek, 10);
    pieces.push(`Every ${days[dayIdx] ?? `day-of-week ${dayOfWeek}`} at ${hour}:${minute.padStart(2, "0")}`);
  } else if (dayOfMonth !== "*") {
    pieces.push(`On day ${dayOfMonth} of each month at ${hour}:${minute.padStart(2, "0")}`);
  } else {
    pieces.push(`At ${hour}:${minute.padStart(2, "0")} every day`);
  }

  return pieces.join(", ");
}

export default function ScheduledForm({ datasourceId, query, onSave, onCancel }: ScheduledFormProps) {
  const isEdit = !!query;
  const [name, setName] = useState(query?.name ?? "");
  const [description, setDescription] = useState(query?.description ?? "");
  const [sql, setSql] = useState(query?.sql ?? "");
  const [cronExpression, setCronExpression] = useState(query?.cron_expression ?? "0 * * * *");
  const [timezone, setTimezone] = useState(query?.timezone ?? "UTC");
  const [alertConditions, setAlertConditions] = useState<AlertCondition[]>(() => {
    if (query?.alert_conditions) {
      try {
        return JSON.parse(query.alert_conditions);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI SQL generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingSql, setGeneratingSql] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateSql = async () => {
    if (!aiPrompt.trim()) return;
    setGeneratingSql(true);
    setAiError(null);
    try {
      const result = await scheduledApi.generateSql(datasourceId, aiPrompt.trim());
      setSql(result.sql);
    } catch (err) {
      setAiError((err as Error).message ?? "Failed to generate SQL");
    } finally {
      setGeneratingSql(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !sql.trim() || !cronExpression.trim()) {
      setError("Name, SQL, and cron expression are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        sql: sql.trim(),
        cron_expression: cronExpression.trim(),
        timezone,
        alert_conditions: alertConditions.length > 0
          ? JSON.stringify(alertConditions)
          : null,
      };

      if (isEdit && query) {
        await scheduledApi.update(datasourceId, query.id, data);
      } else {
        await scheduledApi.create(datasourceId, { ...data, enabled: 1 });
      }
      onSave();
    } catch (err: any) {
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-cream space-y-5">
      <h3 className="font-display text-heading-4 text-[var(--ink)]">
        {isEdit ? "Edit Scheduled Query" : "New Scheduled Query"}
      </h3>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Daily Revenue Check"
          className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* AI SQL Generation */}
      <div className="p-4 rounded-lg border border-dashed border-[var(--primary)]/40 bg-[var(--primary-soft)]/50">
        <label className="block text-sm font-medium text-[var(--ink)] mb-2 flex items-center gap-2">
          <span>🤖</span> AI SQL Generation
        </label>
        <p className="text-xs text-[var(--steel)] mb-2">
          Describe the query in natural language and AI will generate SQL for you
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleGenerateSql(); } }}
            placeholder="e.g., Show daily revenue for the last 30 days grouped by region"
            className="flex-1 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
            disabled={generatingSql}
          />
          <button
            type="button"
            onClick={handleGenerateSql}
            disabled={generatingSql || !aiPrompt.trim()}
            className="btn-primary text-sm whitespace-nowrap disabled:opacity-40"
          >
            {generatingSql ? "Generating..." : "Generate SQL"}
          </button>
        </div>
        {aiError && (
          <p className="text-xs text-[var(--error)] mt-2">{aiError}</p>
        )}
      </div>

      {/* SQL */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">SQL Query</label>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="SELECT ... FROM ..."
          rows={6}
          className="w-full px-3 py-2 text-sm font-mono bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)] resize-y"
        />
      </div>

      {/* Cron + Presets */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Schedule (Cron)</label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          placeholder="0 * * * *"
          className="w-full px-3 py-2 text-sm font-mono bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
        />
        <p className="text-xs text-[var(--primary-text)] mt-1">
          {describeCron(cronExpression)}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setCronExpression(preset.value)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                cronExpression === preset.value
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]"
                  : "border-[var(--hairline)] text-[var(--steel)] hover:border-[var(--primary)]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] focus:outline-none focus:border-[var(--primary)]"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Alert Conditions */}
      <AlertConfig conditions={alertConditions} onChange={setAlertConditions} />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving..." : isEdit ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}
