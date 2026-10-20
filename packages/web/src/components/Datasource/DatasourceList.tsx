import { useState, useRef } from "react";
import type { Datasource } from "../../api/client";
import { useFlipList, useEmptyStateEntrance } from "../../hooks/useGsapAnimations";

interface DatasourceListProps {
  datasources: Datasource[];
  onEdit: (ds: Datasource) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ success: boolean; message?: string }>;
}

export default function DatasourceList({ datasources, onEdit, onDelete, onTest }: DatasourceListProps) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message?: string }>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  useFlipList(listRef, ".ds-item", [datasources]);
  useEmptyStateEntrance(emptyRef, ".empty-icon", [datasources.length]);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await onTest(id);
      setTestResult((prev) => ({ ...prev, [id]: result }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { success: false, message: "连接失败" } }));
    }
    setTestingId(null);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  if (datasources.length === 0) {
    return (
      <div ref={emptyRef} className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-[var(--muted)]">
          <svg className="empty-icon h-5 w-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        </span>
        <p className="text-sm font-medium text-[var(--foreground)]">暂无数据源配置</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">点击"添加数据源"开始配置</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="grid gap-4">
      {datasources.map((ds) => {
        const result = testResult[ds.id];
        return (
          <div key={ds.id} className="ds-item group flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-xs)] transition-shadow duration-150 hover:shadow-[var(--shadow-2)]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${ds.enabled ? "bg-[var(--success)]" : "bg-[var(--stone)]"}`} />
                <h3 className="truncate text-sm font-medium text-[var(--foreground)]">{ds.name}</h3>
                <span className="badge-soft bg-[var(--muted)] font-mono text-[10px] text-[var(--muted-foreground)]">
                  MySQL
                </span>
              </div>
              <p className="text-xs text-[var(--steel)] mt-1 font-mono pl-[22px]">
                {ds.host}:{ds.port}/{ds.database}
              </p>
              {result && (
                <p className={`text-xs mt-1 pl-[22px] flex items-center gap-1 ${result.success ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                  {result.success ? (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>连接成功</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>{result.message ?? "连接失败"}</>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button onClick={() => handleTest(ds.id)} disabled={testingId === ds.id} className="btn-ghost text-xs gap-1">
                {testingId === ds.id ? (
                  <><div className="w-3 h-3 border border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />测试中</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>测试</>
                )}
              </button>
              <button onClick={() => onEdit(ds)} className="btn-ghost text-xs gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                编辑
              </button>
              {deleteConfirmId === ds.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--error)]">确定删除？</span>
                  <button onClick={handleDeleteConfirm} className="btn-danger text-xs gap-1">确定</button>
                  <button onClick={handleDeleteCancel} className="btn-ghost text-xs gap-1">取消</button>
                </div>
              ) : (
                <button onClick={() => handleDeleteClick(ds.id)} className="btn-danger text-xs gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  删除
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
