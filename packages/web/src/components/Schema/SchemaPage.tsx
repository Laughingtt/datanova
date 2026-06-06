import { useState, useEffect, useCallback } from "react";
import SchemaTree from "./SchemaTree";
import SchemaEnhancement from "./SchemaEnhancement";
import { useAppStore } from "../../stores/app";
import { schemasApi, type SchemaResponse } from "../../api/client";

export default function SchemaPage() {
  const { selectedDatasourceId } = useAppStore();
  const [mode, setMode] = useState<"annotate" | "enhance">("annotate");
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  const loadTableNames = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setTablesLoading(true);
    try {
      const result: SchemaResponse = await schemasApi.get(selectedDatasourceId);
      setTableNames(result.schema.tables.map((t) => t.table.name));
    } catch (err) {
      console.error("Failed to load table names:", err);
      setTableNames([]);
    } finally {
      setTablesLoading(false);
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    if (mode === "enhance") loadTableNames();
  }, [mode, loadTableNames]);

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      {/* Sunset stripe top accent */}
      <div className="sunset-stripe" />

      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="font-display text-heading-2 text-[var(--ink)]">Schema Annotations</h2>
          <p className="text-body-sm text-[var(--slate)] mt-1">
            Add business context to your database schema for better AI understanding
          </p>
        </div>

        {!selectedDatasourceId ? (
          <div className="card-cream text-center py-16">
            <p className="text-sm text-[var(--on-cream)]">Select a datasource first</p>
            <p className="text-xs text-[var(--slate)] mt-2">
              Go to Datasources page and select one to annotate its schema
            </p>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-[var(--hairline)]">
              <button
                onClick={() => setMode("annotate")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  mode === "annotate"
                    ? "border-[var(--primary)] text-[var(--primary-text)]"
                    : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
                }`}
              >
                Manual Annotate
              </button>
              <button
                onClick={() => setMode("enhance")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  mode === "enhance"
                    ? "border-[var(--primary)] text-[var(--primary-text)]"
                    : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
                }`}
              >
                Enhance
              </button>
            </div>

            {mode === "annotate" ? (
              <SchemaTree />
            ) : tablesLoading ? (
              <p className="text-sm text-[var(--steel)]">Loading tables...</p>
            ) : (
              <SchemaEnhancement
                datasourceId={selectedDatasourceId}
                tables={tableNames}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}