import { useAppStore, type AppView } from "../stores/app";

const navItems: { key: AppView; label: string; icon: string }[] = [
  { key: "dashboard", label: "数据概览", icon: "📈" },
  { key: "chat", label: "对话", icon: "💬" },
  { key: "datasources", label: "数据源", icon: "🔌" },
  { key: "schemas", label: "Schema 标注", icon: "🏷️" },
  { key: "metrics", label: "指标管理", icon: "📊" },
  { key: "querySkills", label: "查询技能", icon: "🎯" },
  { key: "analysis", label: "自助分析", icon: "🔍" },
  { key: "dictionary", label: "数据字典", icon: "📖" },
  { key: "queryHistory", label: "SQL 历史", icon: "📋" },
];

export default function Sidebar() {
  const { view, setView } = useAppStore();

  return (
    <aside className="w-[280px] min-h-screen bg-near-black text-white flex flex-col">
      {/* Logo / Title */}
      <div className="px-6 py-6 border-b border-white/10">
        <h1 className="font-display text-2xl tracking-tight text-white">
          DataNova
        </h1>
        <p className="text-micro text-muted-slate mt-1">AI 数据查询助手</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={`
              w-full text-left px-6 py-3 flex items-center gap-3
              text-body-base transition-colors duration-150
              ${
                view === item.key
                  ? "bg-white/10 text-white border-l-2 border-coral"
                  : "text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
              }
            `}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-micro text-muted-slate">v0.1.0</p>
      </div>
    </aside>
  );
}
