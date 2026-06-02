import SchemaTree from "./SchemaTree";
import { useAppStore } from "../../stores/app";

export default function SchemaPage() {
  const { selectedDatasourceId } = useAppStore();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-hairline">
        <div>
          <h2 className="font-display text-section-heading text-ink">Schema Annotations</h2>
          <p className="text-caption text-muted-slate mt-1">
            Add business context to your database schema
          </p>
        </div>
      </div>

      {/* Content */}
      {!selectedDatasourceId ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-slate text-body-large">Select a datasource first</p>
          <p className="text-caption text-muted-slate mt-2">
            Go to Datasources and select one to annotate its schema
          </p>
        </div>
      ) : (
        <SchemaTree />
      )}
    </div>
  );
}
