import { useAppStore, type AppView } from "../stores/app";

const navItems: { key: AppView; label: string; icon: string }[] = [
  { key: "chat", label: "对话", icon: "💬" },
  { key: "datasources", label: "数据源", icon: "🔌" },
  { key: "schemas", label: "Schema", icon: "🏷️" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { view, setView } = useAppStore();

  return (
    <div className="flex h-screen bg-[var(--canvas)]">
      {/* Sidebar */}
      <aside className="w-[220px] flex flex-col bg-[var(--sidebar-bg)] text-[var(--on-dark)]">
        {/* Logo / Brand */}
        <div className="px-5 py-5 border-b border-white/10">
          <h1 className="font-display text-xl tracking-tight text-[var(--on-dark)]">
            DataNova
          </h1>
          <p className="text-xs text-[var(--on-dark-muted)] mt-0.5">Text2SQL Assistant</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const isActive = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`
                  w-full text-left px-5 py-2.5 flex items-center gap-3
                  text-sm transition-colors duration-150
                  ${isActive
                    ? "bg-[var(--sidebar-active)] text-[var(--on-dark)] border-l-2 border-l-[var(--primary)]"
                    : "text-[var(--on-dark-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--on-dark)] border-l-2 border-l-transparent"
                  }
                `}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sunset stripe — brand signature */}
        <div className="sunset-stripe" />

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-xs text-[var(--on-dark-muted)]">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
