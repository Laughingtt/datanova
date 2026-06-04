import { useState } from "react";
import type { Datasource } from "../../api/client";
import { datasourcesApi } from "../../api/client";

interface DatasourceFormProps {
  datasource?: Datasource | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function DatasourceForm({ datasource, onSave, onCancel }: DatasourceFormProps) {
  const [name, setName] = useState(datasource?.name ?? "");
  const [host, setHost] = useState(datasource?.host ?? "127.0.0.1");
  const [port, setPort] = useState(String(datasource?.port ?? 3306));
  const [database, setDatabase] = useState(datasource?.database ?? "");
  const [user, setUser] = useState(datasource?.user ?? "root");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!datasource;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        host,
        port: parseInt(port, 10),
        database,
        user,
        ...(password ? { password } : { password: "" }),
      };

      if (isEdit && datasource) {
        await datasourcesApi.update(datasource.id, payload);
      } else {
        await datasourcesApi.create(payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h3 className="font-display text-heading-4 text-[var(--ink)]">
        {isEdit ? "Edit Datasource" : "Add Datasource"}
      </h3>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label-mono">Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-database" />
        </div>
        <div>
          <label className="label-mono">Database</label>
          <input className="input-field" value={database} onChange={(e) => setDatabase(e.target.value)} required placeholder="mydb" />
        </div>
        <div>
          <label className="label-mono">Host</label>
          <input className="input-field" value={host} onChange={(e) => setHost(e.target.value)} required placeholder="127.0.0.1" />
        </div>
        <div>
          <label className="label-mono">Port</label>
          <input className="input-field" value={port} onChange={(e) => setPort(e.target.value)} required placeholder="3306" />
        </div>
        <div>
          <label className="label-mono">User</label>
          <input className="input-field" value={user} onChange={(e) => setUser(e.target.value)} required placeholder="root" />
        </div>
        <div>
          <label className="label-mono">Password</label>
          <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEdit ? "Leave blank to keep" : ""} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-dark" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Update" : "Create"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}