import { useState } from "react";
import DatasourceList from "./DatasourceList";
import DatasourceForm from "./DatasourceForm";

export default function DatasourcePage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-hairline">
        <div>
          <h2 className="font-display text-section-heading text-ink">Datasources</h2>
          <p className="text-caption text-muted-slate mt-1">
            Configure MySQL database connections
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            Add Datasource
          </button>
        )}
      </div>

      {/* Content */}
      {showForm ? (
        <DatasourceForm
          onSave={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <DatasourceList />
      )}
    </div>
  );
}
