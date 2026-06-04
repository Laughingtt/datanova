import SchemaTree from "./SchemaTree";
import { useAppStore } from "../../stores/app";

export default function SchemaPage() {
  const { selectedDatasourceId } = useAppStore();

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
          <SchemaTree />
        )}
      </div>
    </div>
  );
}