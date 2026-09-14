import { useEffect, useMemo, useRef, useState } from "react";
import Dialog from "./Dialog";
import { useAppStore, type AppView } from "../../stores/app";
import { toast } from "../../stores/toast";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  action: () => void;
}

const NAV_COMMANDS: { id: AppView; label: string; group: string; keywords: string }[] = [
  { id: "dashboard",    label: "数据概览",   group: "导航", keywords: "dashboard 概览 首页" },
  { id: "chat",         label: "智能对话",   group: "导航", keywords: "chat 对话 提问 查询" },
  { id: "analysis",     label: "自助分析",   group: "导航", keywords: "analysis 自助 sql 编辑" },
  { id: "datasources",  label: "数据源",     group: "导航", keywords: "datasource 数据源 连接" },
  { id: "schemas",      label: "Schema 标注", group: "导航", keywords: "schema 标注 注释" },
  { id: "metrics",      label: "指标管理",   group: "导航", keywords: "metric 指标 dimension 维度" },
  { id: "querySkills",  label: "查询技能",   group: "导航", keywords: "skill 技能 query" },
  { id: "dictionary",   label: "语义层目录", group: "导航", keywords: "dictionary 目录 语义" },
  { id: "queryHistory", label: "SQL 历史",   group: "导航", keywords: "history 历史 sql 记录" },
  { id: "insights",     label: "数据洞察",   group: "导航", keywords: "insight 洞察 统计" },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { setView, selectedDatasourceId } = useAppStore();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 每次打开重置
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = NAV_COMMANDS.map((n) => ({
      id: `nav-${n.id}`,
      label: n.label,
      group: n.group,
      keywords: n.keywords,
      hint: "跳转",
      action: () => {
        setView(n.id);
        onClose();
      },
    }));

    const ops: Command[] = [
      {
        id: "op-new-chat",
        label: "新建查询对话",
        group: "操作",
        keywords: "new chat 新建 对话",
        hint: "⌘N",
        action: () => {
          setView("chat");
          onClose();
          setTimeout(() => {
            const input = document.querySelector<HTMLTextAreaElement>("[data-chat-input]");
            input?.focus();
          }, 100);
        },
      },
      {
        id: "op-new-datasource",
        label: "添加数据源",
        group: "操作",
        keywords: "add datasource 添加 数据源",
        action: () => { setView("datasources"); onClose(); },
      },
      {
        id: "op-focus-search",
        label: "聚焦搜索（语义层目录）",
        group: "操作",
        keywords: "search 搜索 聚焦",
        action: () => {
          setView("dictionary");
          onClose();
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>("[data-dict-search]");
            input?.focus();
          }, 100);
        },
      },
      {
        id: "op-copy-datasource-id",
        label: selectedDatasourceId ? "复制当前数据源 ID" : "（未选择数据源）",
        group: "操作",
        keywords: "copy id 数据源",
        action: () => {
          if (!selectedDatasourceId) return;
          navigator.clipboard.writeText(selectedDatasourceId).then(
            () => { toast.success("已复制数据源 ID"); onClose(); },
            () => { toast.error("复制失败"); }
          );
        },
      },
    ];

    return [...nav, ...ops];
  }, [setView, onClose, selectedDatasourceId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((token) => hay.includes(token));
    });
  }, [commands, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  // 上下键 + Enter
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) cmd.action();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, filtered, activeIndex]);

  // 滚动到 active 项
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // 按 group 分组
  const grouped = useMemo(() => {
    const map = new Map<string, { cmd: Command; index: number }[]>();
    filtered.forEach((cmd, index) => {
      const arr = map.get(cmd.group) ?? [];
      arr.push({ cmd, index });
      map.set(cmd.group, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      closeOnEsc={true}
      closeOnBackdrop={true}
      initialFocusSelector="[data-cmd-input]"
    >
      <div className="-mx-6 -my-5">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--hairline-soft)]">
          <svg className="w-4 h-4 text-[var(--stone)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            data-cmd-input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="搜索页面或操作…"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--ink)] placeholder:text-[var(--stone)]"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--steel)]">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--steel)]">
              无匹配结果
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-[var(--stone)] font-medium">
                  {group}
                </div>
                {items.map(({ cmd, index }) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={index}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={cmd.action}
                      className={`w-full text-left px-5 py-2 flex items-center justify-between gap-3 text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--primary-soft)] text-[var(--primary-text)]"
                          : "text-[var(--ink)] hover:bg-[var(--canvas)]"
                      }`}
                    >
                      <span>{cmd.label}</span>
                      {cmd.hint && (
                        <span className={`text-[10px] font-mono ${isActive ? "text-[var(--primary)]" : "text-[var(--stone)]"}`}>
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
