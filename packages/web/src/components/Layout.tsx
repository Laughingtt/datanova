import { useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../utils/gsap-presets";
import { useAppStore, type AppView } from "../stores/app";

gsap.registerPlugin(useGSAP);

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
      { key: "queryHistory", label: "SQL 历史", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
      { key: "insights", label: "数据洞察", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { key: "agentTraces", label: "Agent 追踪", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { view, setView } = useAppStore();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);

  useGSAP(
    () => {
      if (!indicatorRef.current || !activeEl || prefersReducedMotion()) return;
      gsap.to(indicatorRef.current, {
        y: activeEl.offsetTop,
        height: activeEl.offsetHeight,
        duration: DUR.normal,
        ease: EASE.snappy,
      });
    },
    { scope: navRef, dependencies: [activeEl] }
  );

  return (
    <div className="flex h-screen bg-[var(--canvas)]">
      <aside
        className="w-[240px] hidden md:flex flex-col bg-[var(--sidebar-bg)] text-[var(--on-dark)] border-r border-white/5"
        aria-label="侧边栏"
      >
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

        <nav ref={navRef} aria-label="主导航" className="flex-1 px-3 py-2 relative overflow-y-auto custom-scrollbar">
          <div
            ref={indicatorRef}
            className="absolute left-3 right-3 rounded-lg bg-white/10 pointer-events-none"
            style={{ top: 0, height: 0 }}
          />
          {navGroups.map((group, gi) => (
            <div key={group.section} className={gi > 0 ? "mt-4" : ""}>
              <div className="px-3 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-[var(--on-dark-muted)] font-medium">
                {group.section}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = view === item.key;
                  return (
                    <button
                      key={item.key}
                      ref={(el) => { if (isActive && el) setActiveEl(el); }}
                      onClick={() => setView(item.key)}
                      aria-current={isActive ? "page" : undefined}
                      className={`
                        w-full text-left px-3 py-2 flex items-center gap-3
                        text-[13px] font-medium rounded-lg
                        transition-all duration-200
                        ${isActive
                          ? "text-[var(--on-dark)]"
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
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                      <span>{item.label}</span>
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-400)]" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-[var(--on-dark-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span className="text-xs">系统正常运行</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* 移动端顶部导航（md 以下显示） */}
        <div className="md:hidden flex items-center justify-between px-4 py-2 bg-[var(--sidebar-bg)] text-[var(--on-dark)] border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[var(--primary)] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 4L8 2L14 4L8 6L2 4Z" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="text-sm font-semibold">DataNova</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("datanova:cmd-open"))}
            aria-label="打开命令面板"
            className="text-[var(--on-dark-muted)] hover:text-[var(--on-dark)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
