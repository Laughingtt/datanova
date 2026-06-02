import { useState } from "react";
import type { CreateDatasourceInput, ConnectionTestResult } from "../../api/client";
import { datasourcesApi } from "../../api/client";

interface DatasourceFormProps {
  onSave: () => void;
  onCancel: () => void;
}

export default function DatasourceForm({ onSave, onCancel }: DatasourceFormProps) {
  const [form, setForm] = useState<CreateDatasourceInput>({
    name: "",
    host: "",
    port: 3306,
    database: "",
    user: "",
    password: "",
    enabled: true,
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof CreateDatasourceInput, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
    setError(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      // Create a temporary datasource to test, then delete
      const ds = await datasourcesApi.create(form);
      const result = await datasourcesApi.test(ds.id);
      setTestResult(result);
      // Delete the temporary datasource
      await datasourcesApi.delete(ds.id);
    } catch (err) {
      const e = err as Error;
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await datasourcesApi.create(form);
      onSave();
    } catch (err) {
      const e = err as Error;
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-8">
      <h2 className="font-display text-card-heading text-ink mb-6">Add Datasource</h2>

      {error && (
        <div className="mb-4 p-3 bg-error-red/10 border border-error-red/20 rounded-xs text-error-red text-caption">
          {error}
        </div>
      )}

      {testResult && (
        <div
          className={`mb-4 p-3 rounded-xs text-caption ${
            testResult.success
              ? "bg-pale-green-wash border border-deep-green/20 text-deep-green"
              : "bg-error-red/10 border border-error-red/20 text-error-red"
          }`}
        >
          {testResult.success ? "Connection successful!" : `Connection failed: ${testResult.error}`}
        </div>
      )}

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mono-label block mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="input-field"
            placeholder="Production MySQL"
            required
          />
        </div>

        {/* Host & Port */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="mono-label block mb-1">Host</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => handleChange("host", e.target.value)}
              className="input-field"
              placeholder="db.example.com"
              required
            />
          </div>
          <div>
            <label className="mono-label block mb-1">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => handleChange("port", parseInt(e.target.value, 10))}
              className="input-field"
              required
            />
          </div>
        </div>

        {/* Database */}
        <div>
          <label className="mono-label block mb-1">Database</label>
          <input
            type="text"
            value={form.database}
            onChange={(e) => handleChange("database", e.target.value)}
            className="input-field"
            placeholder="mydb"
            required
          />
        </div>

        {/* User & Password */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mono-label block mb-1">User</label>
            <input
              type="text"
              value={form.user}
              onChange={(e) => handleChange("user", e.target.value)}
              className="input-field"
              placeholder="readonly"
              required
            />
          </div>
          <div>
            <label className="mono-label block mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-8">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving..." : "Save Datasource"}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !form.host || !form.port || !form.database || !form.user || !form.password}
          className="btn-secondary"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
