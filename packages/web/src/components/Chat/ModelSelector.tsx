import { useState, useEffect, useRef } from "react";
import { modelsApi, type ProviderModels } from "../../api/client";
import { useAppStore } from "../../stores/app";

export default function ModelSelector() {
  const { modelProvider, modelId, setModel } = useAppStore();
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modelsApi.list().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;
    // Fall back to the first available option when nothing is selected, or
    // when the current selection is no longer offered (e.g. the provider's
    // key was removed or an API key was reconfigured).
    const stillAvailable = providers.some(
      (p) => p.provider === modelProvider && p.models.some((m) => m.id === modelId)
    );
    if (!stillAvailable) {
      const first = providers[0];
      const firstModel = first.models[0];
      if (firstModel) setModel(first.provider, firstModel.id);
    }
  }, [providers, modelProvider, modelId, setModel]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentProvider = providers.find((p) => p.provider === modelProvider);
  const currentModel = currentProvider?.models.find((m) => m.id === modelId);
  const displayLabel = currentModel ? (currentModel.name || currentModel.id) : "Select model";
  const providerLabel = currentProvider?.provider ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-8 rounded-lg border border-[var(--border)]
                   bg-[var(--background)] px-2.5 hover:bg-[var(--muted)] transition-colors
                   text-sm text-[var(--foreground)]"
      >
        <span className="px-1.5 py-0.5 rounded text-xs font-medium
                         bg-[var(--accent)] text-[var(--primary-text)]">
          {providerLabel}
        </span>
        <span className="truncate max-w-[180px]">{displayLabel}</span>
        <svg
          className={`w-3.5 h-3.5 text-[var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-[320px] max-h-[400px] overflow-y-auto
                        rounded-lg border border-[var(--border)] bg-[var(--popover)]
                        shadow-[var(--shadow-3)] p-1 z-50 custom-scrollbar">
          {providers.length === 0 ? (
            <div className="p-4 text-sm text-[var(--muted-foreground)] text-center">
              No models available. Configure an API key
              <br />
              <code className="font-mono text-[var(--primary-text)]">ANTHROPIC_API_KEY</code>,{" "}
              <code className="font-mono text-[var(--primary-text)]">DEEPSEEK_API_KEY</code>
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.provider}>
                <div className="px-2.5 py-2 border-b border-[var(--border)]">
                  <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                    {p.provider}
                  </span>
                </div>
                {p.models.map((m) => {
                  const isSelected = modelProvider === p.provider && modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setModel(p.provider, m.id); setOpen(false); }}
                      className={`w-full text-left px-2.5 py-2 rounded-md flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "hover:bg-[var(--muted)] text-[var(--foreground)]"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium truncate">{m.name || m.id}</div>
                        <div className="text-xs text-[var(--muted-foreground)] font-mono mt-0.5">{m.id}</div>
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-[var(--primary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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