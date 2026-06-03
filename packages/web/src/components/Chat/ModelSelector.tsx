import { useState, useEffect, useRef } from "react";
import { modelsApi, type ProviderModels } from "../../api/client";
import { useAppStore } from "../../stores/app";

export default function ModelSelector() {
  const { modelProvider, modelId, setModel } = useAppStore();
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch available models on mount
  useEffect(() => {
    modelsApi.list().then(setProviders).catch(() => {});
  }, []);

  // Auto-select first provider/model if none selected
  useEffect(() => {
    if (!modelProvider && providers.length > 0) {
      const first = providers[0];
      const firstModel = first.models[0];
      if (firstModel) {
        setModel(first.provider, firstModel.id);
      }
    }
  }, [providers, modelProvider, setModel]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentProvider = providers.find((p) => p.provider === modelProvider);
  const currentModel = currentProvider?.models.find((m) => m.id === modelId);

  const displayLabel = currentModel
    ? `${currentModel.name || currentModel.id}`
    : "Select model";

  const providerLabel = currentProvider?.provider ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-hairline bg-canvas-white hover:bg-soft-stone/50 transition-colors text-caption text-ink"
      >
        {/* Provider badge */}
        <span className="px-1.5 py-0.5 rounded-xs text-micro font-medium bg-pale-blue-wash text-action-blue">
          {providerLabel}
        </span>
        <span className="truncate max-w-[180px]">{displayLabel}</span>
        <svg
          className={`w-3.5 h-3.5 text-muted-slate transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[320px] max-h-[400px] overflow-y-auto bg-canvas-white border border-hairline rounded-md shadow-lg z-50">
          {providers.length === 0 ? (
            <div className="p-4 text-caption text-muted-slate text-center">
              No models available. Please configure an API key
              <br />
              (e.g. <code className="text-mono font-mono text-action-blue">ANTHROPIC_API_KEY</code>,{" "}
              <code className="text-mono font-mono text-action-blue">DEEPSEEK_API_KEY</code>)
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.provider}>
                {/* Provider header */}
                <div className="px-3 py-2 bg-soft-stone/40 border-b border-card-border">
                  <span className="text-micro font-semibold text-muted-slate uppercase tracking-wider">
                    {p.provider}
                  </span>
                </div>
                {/* Model list */}
                {p.models.map((m) => {
                  const isSelected = modelProvider === p.provider && modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(p.provider, m.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-pale-blue-wash text-action-blue"
                          : "hover:bg-soft-stone/50 text-ink"
                      }`}
                    >
                      <div>
                        <div className="text-caption font-medium truncate">
                          {m.name || m.id}
                        </div>
                        <div className="text-micro text-muted-slate font-mono mt-0.5">
                          {m.id}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-action-blue flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
