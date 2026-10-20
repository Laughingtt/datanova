import { useEffect, useState } from "react";
import { useAppStore, type AppView } from "../stores/app";

type NavItem = { key: AppView; label: string; icon: string };
const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "工作台",
    items: [
      { key: "dashboard", label: "数据概览", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
      { key: "chat", label: "智能对话", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
      { key: "analysis", label: "自助分析", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
    ],
  },
  {
    section: "数据治理",
    items: [
      { key: "datasources", label: "数据源", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
      { key: "schemas", label: "Schema 标注", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
      { key: "metrics", label: "指标管理", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { key: "querySkills", label: "查询技能", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
      { key: "dictionary", label: "语义层目录", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
    ],
  },
  {
    section: "监控",
    items: [
      { key: "queryHistory", label: "SQL 历史", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      { key: "insights", label: "数据洞察", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { key: "agentTraces", label: "Agent 追踪", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
    ],
  },
];

const SIDEBAR_KEY = "datanova_sidebar_collapsed";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { view, setView } = useAppStore();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // New API 快捷键：Ctrl/Cmd + B 折叠侧边栏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openCommandPalette = () =>
    window.dispatchEvent(new CustomEvent("datanova:cmd-open"));

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* 顶部应用栏 — New API AppHeader */}
      <header className="relative z-40 flex h-12 w-full shrink-0 items-center gap-1.5 px-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-pressed={collapsed}
          className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--ring)_40%,transparent)]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* 移动端菜单 */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="打开命令面板"
          className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* 品牌 — New API SystemBrand inline */}
        <button
          type="button"
          onClick={() => setView("dashboard")}
          aria-label="返回数据概览"
          className="inline-flex h-8 min-w-0 items-center gap-2 rounded-lg px-1.5 text-sm font-semibold transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ring)_40%,transparent)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--primary)]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4L8 2L14 4L8 6L2 4Z" fill="white" fillOpacity="0.95" />
              <path d="M2 4V10L8 12V6L2 4Z" fill="white" fillOpacity="0.62" />
              <path d="M14 4V10L8 12V6L14 4Z" fill="white" fillOpacity="0.78" />
            </svg>
          </span>
          <span className="max-w-[10rem] truncate">DataNova</span>
        </button>

        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            系统正常
          </span>
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--ring)_30%,transparent)]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <span className="hidden sm:inline">搜索</span>
            <kbd className="hidden sm:inline-flex rounded border border-[var(--border)] bg-[var(--muted)] px-1 font-mono text-[10px] text-[var(--muted-foreground)]">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1">
        {/* 侧边栏 — New API 浅色导航 */}
        <aside
          aria-label="侧边栏"
          className={`hidden md:flex shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width] duration-200 ${
            collapsed ? "w-[3.25rem]" : "w-[13rem]"
          }`}
        >
          <nav aria-label="主导航" className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
            {navGroups.map((group, gi) => (
              <div key={group.section} className={gi > 0 ? "mt-4" : ""}>
                {!collapsed && (
                  <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[color-mix(in_srgb,var(--muted-foreground)_70%,transparent)]">
                    {group.section}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = view === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setView(item.key)}
                        aria-current={isActive ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ring)_40%,transparent)] ${
                          collapsed ? "justify-center" : ""
                        } ${
                          isActive
                            ? "bg-[var(--sidebar-accent)] font-medium text-[var(--sidebar-accent-foreground)]"
                            : "text-[var(--sidebar-foreground)] hover:bg-[var(--muted)]"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {!collapsed && (
            <div className="border-t border-[var(--sidebar-border)] p-2">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--muted-foreground)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                <span>系统正常运行</span>
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-[var(--background)]">{children}</main>
      </div>
    </div>
  );
}
