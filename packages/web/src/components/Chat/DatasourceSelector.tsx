import { useState, useEffect, useRef } from "react";
import { datasourcesApi, type Datasource } from "../../api/client";
import { useAppStore } from "../../stores/app";

export default function DatasourceSelector() {
  const { selectedDatasourceId, setSelectedDatasource } = useAppStore();
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
   datasourcesApi.list().then(setDatasources).catch(() => {});
 }, []);
  // Auto-select if only one datasource and none selected
  useEffect(() => {
    if (datasources.length === 1 && !selectedDatasourceId) {
      setSelectedDatasource(datasources[0].id, datasources[0].name);
    }
  }, [datasources, selectedDatasourceId, setSelectedDatasource]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentDs = datasources.find((ds) => ds.id === selectedDatasourceId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--hairline)]
                   bg-[var(--canvas)] hover:bg-[var(--surface)] transition-colors
                   text-sm text-[var(--ink)]"
      >
        <span className="text-sm">🔌</span>
        <span className={`truncate max-w-[160px] ${currentDs ? "" : "text-[var(--stone)]"}`}>
          {currentDs ? currentDs.name : "选择数据源"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[var(--steel)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-[320px] max-h-[400px] overflow-y-auto
                        bg-[var(--canvas)] border border-[var(--hairline)]
                        rounded-lg shadow-4 z-50 custom-scrollbar">
          {datasources.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-[var(--steel)]">暂无数据源</p>
              <p className="text-xs text-[var(--stone)] mt-1">
                请前往数据源页面添加
              </p>
            </div>
          ) : (
            <>
              {/* "No datasource" option */}
              <button
                onClick={() => { setSelectedDatasource(null, null); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                  !selectedDatasourceId
                    ? "bg-[var(--primary-soft)] text-[var(--primary-text)]"
                    : "hover:bg-[var(--surface)] text-[var(--stone)]"
                }`}
              >
                <div>
                <div className="text-sm">未选择数据源</div>
                <div className="text-xs text-[var(--stone)] mt-0.5">AI 助手将列出可用数据源</div>
                </div>
                {!selectedDatasourceId && (
                  <svg className="w-4 h-4 text-[var(--primary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              <div className="border-t border-[var(--hairline)]" />

              {/* Datasource options */}
              {datasources.map((ds) => {
                const isSelected = selectedDatasourceId === ds.id;
                return (
                  <button
                    key={ds.id}
                    onClick={() => { setSelectedDatasource(ds.id, ds.name); setOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                      isSelected
                        ? "bg-[var(--primary-soft)] text-[var(--primary-text)]"
                        : "hover:bg-[var(--surface)] text-[var(--ink)]"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium truncate">{ds.name}</div>
                      <div className="text-xs text-[var(--steel)] font-mono mt-0.5">
                        {ds.host}:{ds.port}/{ds.database}
                      </div>
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 text-[var(--primary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
