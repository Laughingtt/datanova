import { useAppStore, type AppView } from "../stores/app";

const navItems: { key: AppView; label: string; icon: string }[] = [
  { key: "dashboard", label: "数据概览", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { key: "chat", label: "智能对话", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { key: "datasources", label: "数据源", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
  { key: "schemas", label: "Schema 标注", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { key: "metrics", label: "指标管理", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { key: "querySkills", label: "查询技能", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { key: "analysis", label: "自助分析", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  { key: "dictionary", label: "语义层目录", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { key: "queryHistory", label: "SQL 历史", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  { key: "insights", label: "数据洞察", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { view, setView } = useAppStore();

  return (
    <div className="flex h-screen bg-[var(--canvas)]">
      <aside className="w-[240px] flex flex-col bg-[var(--sidebar-bg)] text-[var(--on-dark)] border-r border-white/5">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4L8 2L14 4L8 6L2 4Z" fill="white" fillOpacity="0.9"/>
                <path d="M2 4V10L8 12V6L2 4Z" fill="white" fillOpacity="0.6"/>
                <path d="M14 4V10L8 12V6L14 4Z" fill="white" fillOpacity="0.75"/>
              </svg>
            </div>
            <div>
              <h1 className="font-body text-base font-semibold tracking-tight text-[var(--on-dark)]">
                DataNova
              </h1>
              <p className="text-[10px] text-[var(--on-dark-muted)] tracking-wide">AI 数据查询助手</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`
                  w-full text-left px-3 py-2 flex items-center gap-3
                  text-[13px] font-medium rounded-lg
                  transition-all duration-200
                  ${isActive
                    ? "bg-white/10 text-[var(--on-dark)]"
                    : "text-[var(--on-dark-muted)] hover:bg-white/5 hover:text-[var(--on-dark)]"
                  }
                `}
              >
                <svg
                  className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-[var(--accent-300)]" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span>{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-400)]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-[var(--on-dark-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span className="text-xs">系统正常运行</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
