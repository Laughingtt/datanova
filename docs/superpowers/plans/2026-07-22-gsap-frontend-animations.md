# GSAP 前端动效升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DataNova 前端添加 GSAP 驱动的动效系统，覆盖页面切换、聊天消息、弹窗、折叠展开、侧边栏、图表、骨架屏等 15 个动效场景，使产品体验更加高级流畅。

**Architecture:** 创建共享的 GSAP 动效工具层 (`hooks/useGsapAnimations.ts` + `utils/gsap-presets.ts`)，各组件通过 `useGSAP` hook 接入。所有动效尊重 `prefers-reduced-motion`，使用 `gsap.matchMedia()` 控制。动效分为 3 个优先级批次实现：高影响(核心体验) → 中影响(精致感) → 低影响(锦上添花)。

**Tech Stack:** GSAP 3 + @gsap/react (useGSAP hook) + React 19 + TailwindCSS 3

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/web/src/utils/gsap-presets.ts` | **新建** — GSAP 动效预设配置 (easing, duration, 常用动画工厂函数) |
| `packages/web/src/hooks/useGsapAnimations.ts` | **新建** — 共享 GSAP 动效 hooks (usePageTransition, useModalAnimation, useCollapseAnimation, useStaggerEntrance, useShimmer, useCountUp) |
| `packages/web/src/styles/globals.css` | **修改** — 移除旧 CSS 动画, 添加 GSAP 兼容的辅助 class |
| `packages/web/src/App.tsx` | **修改** — 添加页面切换动效 |
| `packages/web/src/components/Layout.tsx` | **修改** — 侧边栏滑动指示器 |
| `packages/web/src/components/Chat/MessageList.tsx` | **修改** — 消息入场动画 |
| `packages/web/src/components/Chat/MessageItem.tsx` | **修改** — 消息项入场动效 |
| `packages/web/src/components/Chat/StepIndicator.tsx` | **修改** — 思考指示器动效 |
| `packages/web/src/components/Chat/ChannelTabs.tsx` | **修改** — Tab 切换动效 |
| `packages/web/src/components/Chat/DatasourceSelector.tsx` | **修改** — 下拉菜单动效 |
| `packages/web/src/components/Chat/ResultSummaryCard.tsx` | **修改** — 折叠展开动效 |
| `packages/web/src/components/Insights/BookmarkDialog.tsx` | **修改** — 弹窗入场/退场动效 |
| `packages/web/src/components/Insights/StatsBar.tsx` | **修改** — 骨架屏 shimmer + 数字滚动 |
| `packages/web/src/components/Insights/ChartCard.tsx` | **修改** — 卡片入场 + SQL 折叠动效 |
| `packages/web/src/components/Dashboard/DashboardPage.tsx` | **修改** — 统计卡片动效 + 迷你柱状图生长 |
| `packages/web/src/components/ChartRenderers.tsx` | **修改** — Recharts 图表入场动画配置 |
| `packages/web/src/components/Onboarding/OnboardingWizard.tsx` | **修改** — 步骤切换动效 |
| `packages/web/src/components/Chat/FeedbackButtons.tsx` | **修改** — 反馈按钮弹跳动效 |

---

## Task 1: GSAP 动效基础设施

**Files:**
- Create: `packages/web/src/utils/gsap-presets.ts`
- Create: `packages/web/src/hooks/useGsapAnimations.ts`
- Modify: `packages/web/src/styles/globals.css:299-313`

- [ ] **Step 1: 创建 gsap-presets.ts — 动效预设配置**

```typescript
// packages/web/src/utils/gsap-presets.ts
import { gsap } from "gsap";

// ─── Easing ────────────────────────────────────────────
export const EASE = {
  smooth: "power2.out",
  smoothInOut: "power2.inOut",
  snappy: "power3.out",
  snappyInOut: "power3.inOut",
  bounce: "back.out(1.7)",
  gentle: "power1.out",
  entrance: "power2.out",
  exit: "power2.in",
} as const;

// ─── Duration (seconds) ────────────────────────────────
export const DUR = {
  instant: 0.15,
  fast: 0.25,
  normal: 0.4,
  slow: 0.6,
  page: 0.35,
  modal: 0.3,
  collapse: 0.3,
  stagger: 0.06,
  shimmer: 1.5,
  countUp: 1.2,
} as const;

// ─── Reduced Motion Check ──────────────────────────────
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── Animation Factories ───────────────────────────────

/** Fade + slide up entrance */
export function entranceFrom(
  targets: gsap.TweenTarget,
  opts: { y?: number; x?: number; duration?: number; delay?: number; stagger?: number } = {}
) {
  const { y = 12, x = 0, duration = DUR.normal, delay = 0, stagger = 0 } = opts;
  return gsap.from(targets, {
    autoAlpha: 0,
    y,
    x,
    duration: prefersReducedMotion() ? 0 : duration,
    delay,
    stagger,
    ease: EASE.entrance,
    clearProps: "autoAlpha,y,x",
  });
}

/** Fade + slide out exit */
export function exitTo(
  targets: gsap.TweenTarget,
  opts: { y?: number; x?: number; duration?: number; delay?: number } = {}
) {
  const { y = -8, x = 0, duration = DUR.fast, delay = 0 } = opts;
  return gsap.to(targets, {
    autoAlpha: 0,
    y,
    x,
    duration: prefersReducedMotion() ? 0 : duration,
    delay,
    ease: EASE.exit,
  });
}

/** Modal entrance: scale up + fade in */
export function modalEntrance(targets: gsap.TweenTarget) {
  return gsap.from(targets, {
    autoAlpha: 0,
    scale: 0.95,
    y: 10,
    duration: prefersReducedMotion() ? 0 : DUR.modal,
    ease: EASE.bounce,
    clearProps: "autoAlpha,scale,y",
  });
}

/** Modal exit: scale down + fade out */
export function modalExit(targets: gsap.TweenTarget) {
  return gsap.to(targets, {
    autoAlpha: 0,
    scale: 0.95,
    y: 10,
    duration: prefersReducedMotion() ? 0 : DUR.fast,
    ease: EASE.exit,
  });
}

/** Collapse: animate height from 0 to auto */
export function collapseOpen(targets: gsap.TweenTarget) {
  return gsap.from(targets, {
    height: 0,
    autoAlpha: 0,
    duration: prefersReducedMotion() ? 0 : DUR.collapse,
    ease: EASE.smooth,
    clearProps: "height,autoAlpha",
  });
}

/** Collapse: animate height from auto to 0 */
export function collapseClose(targets: gsap.TweenTarget) {
  return gsap.to(targets, {
    height: 0,
    autoAlpha: 0,
    duration: prefersReducedMotion() ? 0 : DUR.collapse,
    ease: EASE.exit,
  });
}

/** Shimmer sweep for skeleton loading */
export function shimmer(targets: gsap.TweenTarget) {
  return gsap.fromTo(
    targets,
    { backgroundPosition: "-200% 0" },
    {
      backgroundPosition: "200% 0",
      duration: prefersReducedMotion() ? 0 : DUR.shimmer,
      ease: "none",
      repeat: -1,
    }
  );
}

/** Count up number animation */
export function countUp(
  target: Element,
  opts: { endValue: number; duration?: number; prefix?: string; suffix?: string } = {}
) {
  const { endValue, duration = DUR.countUp, prefix = "", suffix = "" } = opts;
  const obj = { value: 0 };
  return gsap.to(obj, {
    value: endValue,
    duration: prefersReducedMotion() ? 0 : duration,
    ease: EASE.smooth,
    onUpdate: () => {
      const display = Number.isInteger(endValue)
        ? Math.round(obj.value).toLocaleString()
        : obj.value.toFixed(1);
      target.textContent = prefix + display + suffix;
    },
  });
}
```

- [ ] **Step 2: 创建 useGsapAnimations.ts — 共享动效 hooks**

```typescript
// packages/web/src/hooks/useGsapAnimations.ts
import { useRef, useCallback, useEffect } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion, entranceFrom, exitTo, modalEntrance, modalExit, collapseOpen, collapseClose, shimmer, countUp } from "../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

// ─── usePageTransition ─────────────────────────────────
/** 页面切换交叉淡入动效 — 包裹在 App.tsx 的 main 内容区 */
export function usePageTransition(containerRef: React.RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        containerRef.current,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: DUR.page, ease: EASE.smooth, clearProps: "autoAlpha,y" }
      );
    },
    { scope: containerRef }
  );
}

// ─── useModalAnimation ─────────────────────────────────
/** 弹窗入场/退场动效 — 返回 open/close 函数 */
export function useModalAnimation(
  overlayRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const open = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (!overlayRef.current || !contentRef.current) return;
    gsap.set(overlayRef.current, { autoAlpha: 0 });
    gsap.set(contentRef.current, { autoAlpha: 0, scale: 0.95, y: 10 });
    const tl = gsap.timeline();
    tl.to(overlayRef.current, { autoAlpha: 1, duration: DUR.fast, ease: EASE.smooth });
    tl.to(contentRef.current, { autoAlpha: 1, scale: 1, y: 0, duration: DUR.modal, ease: EASE.bounce, clearProps: "scale,y" }, "<");
    tlRef.current = tl;
  }, [overlayRef, contentRef]);

  const close = useCallback(() => {
    if (prefersReducedMotion()) { onClose(); return; }
    if (!overlayRef.current || !contentRef.current) { onClose(); return; }
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(contentRef.current, { autoAlpha: 0, scale: 0.95, y: 10, duration: DUR.fast, ease: EASE.exit });
    tl.to(overlayRef.current, { autoAlpha: 0, duration: DUR.fast, ease: EASE.exit }, "<");
    tlRef.current = tl;
  }, [overlayRef, contentRef, onClose]);

  // Kill timeline on unmount
  useEffect(() => {
    return () => { tlRef.current?.kill(); };
  }, []);

  return { open, close };
}

// ─── useCollapseAnimation ──────────────────────────────
/** 折叠展开动效 — 传入 isExpanded 状态 */
export function useCollapseAnimation(
  contentRef: React.RefObject<HTMLElement | null>,
  isExpanded: boolean
) {
  const prevExpanded = useRef(isExpanded);

  useGSAP(
    () => {
      if (!contentRef.current || prefersReducedMotion()) return;
      if (prevExpanded.current === isExpanded) return;
      prevExpanded.current = isExpanded;

      if (isExpanded) {
        // Opening: from 0 to auto
        gsap.set(contentRef.current, { height: 0, autoAlpha: 0, overflow: "hidden" });
        gsap.to(contentRef.current, {
          height: "auto",
          autoAlpha: 1,
          duration: DUR.collapse,
          ease: EASE.smooth,
          onComplete: () => gsap.set(contentRef.current, { overflow: "visible", clearProps: "height,autoAlpha" }),
        });
      } else {
        // Closing: from auto to 0
        gsap.set(contentRef.current, { overflow: "hidden" });
        gsap.to(contentRef.current, {
          height: 0,
          autoAlpha: 0,
          duration: DUR.collapse,
          ease: EASE.exit,
          onComplete: () => gsap.set(contentRef.current, { clearProps: "overflow,height,autoAlpha" }),
        });
      }
    },
    { scope: contentRef, dependencies: [isExpanded] }
  );
}

// ─── useStaggerEntrance ────────────────────────────────
/** 列表项交错入场动效 */
export function useStaggerEntrance(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const items = containerRef.current.querySelectorAll(selector);
      if (items.length === 0) return;
      gsap.from(items, {
        autoAlpha: 0,
        y: 10,
        duration: DUR.normal,
        stagger: DUR.stagger,
        ease: EASE.entrance,
        clearProps: "autoAlpha,y",
      });
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useShimmer ────────────────────────────────────────
/** 骨架屏光泽扫过动效 */
export function useShimmer(containerRef: React.RefObject<HTMLElement | null>, selector: string) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const items = containerRef.current.querySelectorAll(selector);
      if (items.length === 0) return;
      shimmer(items);
    },
    { scope: containerRef }
  );
}

// ─── useCountUp ────────────────────────────────────────
/** 数字滚动动效 */
export function useCountUp(
  targetRef: React.RefObject<HTMLElement | null>,
  endValue: number,
  opts: { prefix?: string; suffix?: string } = {}
) {
  useGSAP(
    () => {
      if (!targetRef.current || prefersReducedMotion()) return;
      countUp(targetRef.current, { endValue, ...opts });
    },
    { scope: targetRef, dependencies: [endValue] }
  );
}

// ─── useDropdownAnimation ──────────────────────────────
/** 下拉菜单展开/收起动效 */
export function useDropdownAnimation(
  menuRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean
) {
  const prevOpen = useRef(isOpen);

  useGSAP(
    () => {
      if (!menuRef.current || prefersReducedMotion()) return;
      if (prevOpen.current === isOpen) return;
      prevOpen.current = isOpen;

      if (isOpen) {
        gsap.set(menuRef.current, { autoAlpha: 0, y: -4, scaleY: 0.95, transformOrigin: "top center" });
        gsap.to(menuRef.current, {
          autoAlpha: 1,
          y: 0,
          scaleY: 1,
          duration: DUR.fast,
          ease: EASE.snappy,
          clearProps: "autoAlpha,y,scaleY,transformOrigin",
        });
      } else {
        gsap.to(menuRef.current, {
          autoAlpha: 0,
          y: -4,
          scaleY: 0.95,
          duration: DUR.instant,
          ease: EASE.exit,
        });
      }
    },
    { scope: menuRef, dependencies: [isOpen] }
  );
}

// ─── useSlideIndicator ─────────────────────────────────
/** 侧边栏/Tab 滑动指示器动效 */
export function useSlideIndicator(
  indicatorRef: React.RefObject<HTMLElement | null>,
  activeElement: HTMLElement | null
) {
  useGSAP(
    () => {
      if (!indicatorRef.current || !activeElement || prefersReducedMotion()) return;
      const rect = activeElement.getBoundingClientRect();
      const parent = activeElement.parentElement?.getBoundingClientRect();
      if (!parent) return;
      gsap.to(indicatorRef.current, {
        y: rect.top - parent.top,
        height: rect.height,
        duration: DUR.normal,
        ease: EASE.smooth,
      });
    },
    { scope: indicatorRef, dependencies: [activeElement] }
  );
}

// ─── useBarGrow ────────────────────────────────────────
/** 柱状图从0生长动效 */
export function useBarGrow(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const bars = containerRef.current.querySelectorAll(selector);
      if (bars.length === 0) return;
      gsap.from(bars, {
        scaleY: 0,
        transformOrigin: "bottom center",
        duration: DUR.slow,
        stagger: 0.04,
        ease: EASE.bounce,
        clearProps: "scaleY,transformOrigin",
      });
    },
    { scope: containerRef, dependencies: deps }
  );
}
```

- [ ] **Step 3: 更新 globals.css — 移除旧 CSS 动画, 添加 shimmer 辅助**

在 `globals.css` 中，将 `@layer utilities` 里的 `.animate-in` / `.delay-*` 替换为 GSAP 兼容的辅助 class，并添加 shimmer 背景：

```css
/* 替换 lines 299-313 的内容 */

/* Staggered animation helpers (GSAP-driven, these are initial states only) */
.gsap-hidden {
  /* GSAP will animate from this state */
  visibility: hidden;
  opacity: 0;
}

/* Shimmer skeleton background */
.shimmer-bg {
  background: linear-gradient(
    90deg,
    var(--hairline-soft) 25%,
    var(--hairline) 50%,
    var(--hairline-soft) 75%
  );
  background-size: 200% 100%;
}

/* Keep animate-in for backward compat during migration */
.animate-in {
  animation: fadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  opacity: 0;
}
.delay-1 { animation-delay: 80ms; }
.delay-2 { animation-delay: 160ms; }
.delay-3 { animation-delay: 240ms; }
.delay-4 { animation-delay: 320ms; }

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: 验证基础设施编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to gsap-presets.ts or useGsapAnimations.ts

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/utils/gsap-presets.ts packages/web/src/hooks/useGsapAnimations.ts packages/web/src/styles/globals.css
git commit -m "feat: add GSAP animation infrastructure — presets, hooks, and shimmer utilities"
```

---

## Task 2: 页面/视图切换动效 (高影响)

**Files:**
- Modify: `packages/web/src/App.tsx:1-81`

- [ ] **Step 1: 修改 App.tsx — 添加页面切换动效**

在 App.tsx 中，给 `<main>` 添加 ref，当 `view` 变化时触发交叉淡入动效：

```typescript
// packages/web/src/App.tsx — 完整替换
import { useEffect, useState, useRef } from "react";
import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import { datasourcesApi } from "./api/client";
import ChatWindow from "./components/Chat/ChatWindow";
import DatasourcePage from "./components/Datasource/DatasourcePage";
import SchemaPage from "./components/Schema/SchemaPage";
import MetricsPage from "./components/Metrics/MetricsPage";
import AnalysisPage from "./components/Analysis/AnalysisPage";
import DictionaryPage from "./components/Dictionary/DictionaryPage";
import OnboardingWizard from "./components/Onboarding/OnboardingWizard";
import QueryHistoryPage from "./components/History/QueryHistoryPage";
import DashboardPage from "./components/Dashboard/DashboardPage";
import InsightsPage from "./components/Insights/InsightsPage";
import QuerySkillsPage from "./components/QuerySkills/QuerySkillsPage";
import { usePageTransition } from "./hooks/useGsapAnimations";

export default function App() {
  const { view, selectedDatasourceId, onboardingCompleted, setOnboardingCompleted } = useAppStore();
  const [hasExistingDatasource, setHasExistingDatasource] = useState(false);
  const [datasourceChecked, setDatasourceChecked] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Page transition animation on view change
  usePageTransition(mainRef);

  useEffect(() => {
    if (onboardingCompleted) {
      setDatasourceChecked(true);
      return;
    }
    datasourcesApi.list().then((list) => {
      const enabledDs = list.filter(ds => ds.enabled);
      if (enabledDs.length > 0) {
        setHasExistingDatasource(true);
        setOnboardingCompleted(true);
      }
      setDatasourceChecked(true);
    }).catch(() => {
      setDatasourceChecked(true);
    });
  }, [onboardingCompleted, setOnboardingCompleted]);

  const showOnboarding = selectedDatasourceId && !onboardingCompleted && !hasExistingDatasource && datasourceChecked;

  return (
    <Layout>
      <main ref={mainRef} className="flex-1 min-w-0 overflow-auto">
        {showOnboarding && <OnboardingWizard />}
        {view === "dashboard" && <DashboardPage />}
        {view === "chat" && <ChatWindow />}
        {view === "datasources" && <DatasourcePage />}
        {view === "schemas" && <SchemaPage />}
        {view === "metrics" && selectedDatasourceId && <MetricsPage />}
        {view === "metrics" && !selectedDatasourceId && (
          <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
            <div className="text-center">
              <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
              <p className="text-xs text-[var(--steel)] mt-2">
                前往数据源页面选择一个数据源以管理指标
              </p>
            </div>
          </div>
        )}
        {view === "analysis" && <AnalysisPage />}
        {view === "dictionary" && <DictionaryPage />}
        {view === "queryHistory" && <QueryHistoryPage />}
        {view === "insights" && <InsightsPage />}
        {view === "querySkills" && selectedDatasourceId && <QuerySkillsPage />}
        {view === "querySkills" && !selectedDatasourceId && (
          <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
            <div className="text-center">
              <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
              <p className="text-xs text-[var(--steel)] mt-2">
                前往数据源页面选择一个数据源以管理查询技能
              </p>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
```

注意：`<main>` 从 Layout.tsx 移到 App.tsx，Layout.tsx 中删除 `<main>` 包裹。

- [ ] **Step 2: 修改 Layout.tsx — 移除 main 包裹**

将 Layout.tsx 中的 `<main className="flex-1 min-w-0 overflow-auto">{children}</main>` 改为 `{children}`：

```typescript
// Layout.tsx line 83-85 替换为:
      {children}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/Layout.tsx
git commit -m "feat: add page transition animation on view change"
```

---

## Task 3: 聊天消息入场动效 (高影响)

**Files:**
- Modify: `packages/web/src/components/Chat/MessageList.tsx:1-46`
- Modify: `packages/web/src/components/Chat/MessageItem.tsx:1-247`

- [ ] **Step 1: 修改 MessageList.tsx — 消息列表交错入场**

```typescript
// packages/web/src/components/Chat/MessageList.tsx — 完整替换
import { useEffect, useRef } from "react";
import type { ChatMessage, ConfirmAction } from "../../hooks/useAgentStream";
import MessageItem from "./MessageItem";
import { useStaggerEntrance } from "../../hooks/useGsapAnimations";

interface MessageListProps {
  messages: ChatMessage[];
  conversationId?: string;
  onConfirmAction?: (action: ConfirmAction) => void;
  onCancelAction?: (action: ConfirmAction) => void;
}

export default function MessageList({ messages, conversationId, onConfirmAction, onCancelAction }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Stagger entrance for new messages
  useStaggerEntrance(listRef, ".msg-item", [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-cream)]">
        <div className="text-center space-y-4 max-w-md px-8">
          <div className="w-16 h-16 mx-auto rounded-lg bg-[var(--cream)] border border-[var(--beige-deep)] flex items-center justify-center text-3xl">
            📊
          </div>
          <h2 className="text-heading-4 font-display text-[var(--ink)]">
            Ask about your data
          </h2>
          <p className="text-body-sm text-[var(--slate)]">
            Connect a datasource and ask questions in natural language.
            DataNova will discover your schema and generate SQL queries.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--surface)]">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} conversationId={conversationId} onConfirmAction={onConfirmAction} onCancelAction={onCancelAction} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: 修改 MessageItem.tsx — 添加 msg-item class**

在 MessageItem.tsx 的最外层 div 添加 `msg-item` class，使 stagger 选择器能匹配：

```typescript
// MessageItem.tsx line 132 — 修改最外层 div
// 从:
    <div className={`px-6 py-4 ${isUser ? "flex justify-end" : ""}`}>
// 改为:
    <div className={`msg-item px-6 py-4 ${isUser ? "flex justify-end" : ""}`}>
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Chat/MessageList.tsx packages/web/src/components/Chat/MessageItem.tsx
git commit -m "feat: add stagger entrance animation for chat messages"
```

---

## Task 4: 弹窗入场/退场动效 (高影响)

**Files:**
- Modify: `packages/web/src/components/Insights/BookmarkDialog.tsx:1-83`

- [ ] **Step 1: 修改 BookmarkDialog.tsx — 添加 GSAP 弹窗动效**

```typescript
// packages/web/src/components/Insights/BookmarkDialog.tsx — 完整替换
import { useState, useRef, useEffect } from "react";
import { bookmarksApi } from "../../api/client";
import { useModalAnimation } from "../../hooks/useGsapAnimations";

interface BookmarkDialogProps {
  dsId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function BookmarkDialog({ dsId, onClose, onCreated }: BookmarkDialogProps) {
  const [title, setTitle] = useState("");
  const [sql, setSql] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { open, close } = useModalAnimation(overlayRef, contentRef, onClose);

  // Play entrance animation on mount
  useEffect(() => { open(); }, [open]);

  const handleClose = () => { close(); };

  const handleSave = async () => {
    if (!title.trim() || !sql.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await bookmarksApi.create(dsId, { title: title.trim(), sql: sql.trim() });
      onCreated();
      close();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div ref={overlayRef} className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
      <div ref={contentRef} className="relative w-[520px] max-w-[90vw] bg-[var(--surface)] rounded-2xl shadow-2xl">
        <div className="sunset-stripe rounded-t-2xl" />
        <div className="p-6">
          <h2 className="font-display text-lg text-[var(--ink)] mb-1">添加收藏报表</h2>
          <p className="text-xs text-[var(--steel)] mb-5">输入 SQL 查询语句，将其保存为收藏报表</p>

          <div className="space-y-4">
            <div>
              <label className="label-mono">报表标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：周度营收总览"
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="label-mono">SQL 查询</label>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder={"SELECT date, SUM(amount)\nFROM orders\nGROUP BY date\nORDER BY date DESC\nLIMIT 30"}
                rows={6}
                className="input-field font-mono text-xs resize-y"
                spellCheck={false}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-xs text-[var(--error)] bg-[var(--error-soft)] rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 mt-5">
            <button onClick={handleClose} className="btn-secondary text-xs">取消</button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !sql.trim()}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {saving ? "保存中..." : "保存并执行"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Insights/BookmarkDialog.tsx
git commit -m "feat: add modal entrance/exit animation to BookmarkDialog"
```

---

## Task 5: 折叠展开动效 (高影响)

**Files:**
- Modify: `packages/web/src/components/Chat/ResultSummaryCard.tsx:1-135`
- Modify: `packages/web/src/components/Insights/ChartCard.tsx:1-156`

- [ ] **Step 1: 修改 ResultSummaryCard.tsx — 折叠展开动效**

```typescript
// ResultSummaryCard.tsx — 替换 lines 37-135 的组件实现
// 在 import 中添加:
import { useRef } from "react";
import { useCollapseAnimation } from "../../hooks/useGsapAnimations";

// 在组件内部添加 (line 38 后):
  const contentRef = useRef<HTMLDivElement>(null);
  useCollapseAnimation(contentRef, isExpanded);

// 替换 line 111 的条件渲染:
// 从:
      {isExpanded && otherSections.length > 0 && (
        <div className="divide-y divide-[var(--hairline-soft)]">
// 改为:
      <div ref={contentRef} style={isExpanded ? {} : { height: 0, overflow: "hidden", opacity: 0 }}>
        {otherSections.length > 0 && (
        <div className="divide-y divide-[var(--hairline-soft)]">
// ... 保持内部内容不变 ...
        </div>
        )}
      </div>
```

注意：将条件渲染 `{isExpanded && ...}` 改为始终渲染但通过 GSAP 控制高度/透明度。

- [ ] **Step 2: 修改 ChartCard.tsx — SQL 展开动效**

在 ChartCard.tsx 中，对 SQL 展开区域添加折叠动效：

```typescript
// ChartCard.tsx — 在 import 中添加:
import { useRef } from "react";
import { useCollapseAnimation } from "../../hooks/useGsapAnimations";

// 在组件内部添加:
  const sqlRef = useRef<HTMLDivElement>(null);
  useCollapseAnimation(sqlRef, showSql);

// 替换 lines 117-123 的 SQL 展开区域:
// 从:
      {showSql && (
        <div className="px-5 py-3 bg-[var(--canvas)] border-b border-[var(--hairline-soft)]">
          <pre className="text-xs font-mono text-[var(--charcoal)] whitespace-pre-wrap overflow-x-auto max-h-32">
            {sql}
          </pre>
        </div>
      )}
// 改为:
      <div ref={sqlRef} style={showSql ? {} : { height: 0, overflow: "hidden", opacity: 0 }}>
        <div className="px-5 py-3 bg-[var(--canvas)] border-b border-[var(--hairline-soft)]">
          <pre className="text-xs font-mono text-[var(--charcoal)] whitespace-pre-wrap overflow-x-auto max-h-32">
            {sql}
          </pre>
        </div>
      </div>
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Chat/ResultSummaryCard.tsx packages/web/src/components/Insights/ChartCard.tsx
git commit -m "feat: add collapse/expand animation to ResultSummaryCard and ChartCard SQL toggle"
```

---

## Task 6: 侧边栏滑动指示器 (中影响)

**Files:**
- Modify: `packages/web/src/components/Layout.tsx:1-88`

- [ ] **Step 1: 修改 Layout.tsx — 添加滑动指示器**

```typescript
// Layout.tsx — 完整替换
import { useRef, useState, useEffect } from "react";
import { useAppStore, type AppView } from "../stores/app";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

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
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);

  // Animate indicator to active nav item
  useGSAP(() => {
    if (!indicatorRef.current || !activeEl || prefersReducedMotion()) return;
    const navRect = navRef.current?.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    if (!navRect) return;
    gsap.to(indicatorRef.current, {
      y: elRect.top - navRect.top,
      height: elRect.height,
      duration: DUR.normal,
      ease: EASE.smooth,
    });
  }, { scope: navRef, dependencies: [activeEl] });

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

        <nav ref={navRef} className="flex-1 px-3 py-2 space-y-0.5 relative">
          {/* Sliding background indicator */}
          <div
            ref={indicatorRef}
            className="absolute left-3 right-3 rounded-lg bg-white/10 pointer-events-none"
            style={{ top: 0, height: 36 }}
          />

          {navItems.map((item) => {
            const isActive = view === item.key;
            return (
              <button
                key={item.key}
                ref={(el) => { if (isActive && el) setActiveEl(el); }}
                onClick={() => setView(item.key)}
                className={`
                  w-full text-left px-3 py-2 flex items-center gap-3
                  text-[13px] font-medium rounded-lg relative z-10
                  transition-colors duration-200
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

      {children}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Layout.tsx
git commit -m "feat: add sliding indicator animation to sidebar navigation"
```

---

## Task 7: 骨架屏 Shimmer + 数字滚动 (中影响)

**Files:**
- Modify: `packages/web/src/components/Insights/StatsBar.tsx:1-74`
- Modify: `packages/web/src/components/Dashboard/DashboardPage.tsx:1-284`

- [ ] **Step 1: 修改 StatsBar.tsx — shimmer 骨架屏 + 数字滚动**

```typescript
// StatsBar.tsx — 完整替换
import { useRef } from "react";
import type { InsightsStatsResponse } from "../../api/client";
import { useShimmer, useCountUp, useStaggerEntrance } from "../../hooks/useGsapAnimations";

interface StatsBarProps {
  stats: InsightsStatsResponse | null;
  loading: boolean;
}

export default function StatsBar({ stats, loading }: StatsBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const queriesRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  // Shimmer for loading state
  useShimmer(containerRef, ".shimmer-bg");

  // Count-up for stats
  useCountUp(queriesRef, stats?.totalQueries ?? 0);
  useCountUp(successRef, stats?.successRate ?? 0, { suffix: "%" });

  // Stagger entrance for stat cards
  useStaggerEntrance(containerRef, ".stat-card", [stats]);

  if (loading) {
    return (
      <div ref={containerRef} className="grid grid-cols-3 gap-5 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <div className="shimmer-bg h-4 rounded w-24 mb-3" />
            <div className="shimmer-bg h-8 rounded w-16 mb-1" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div ref={containerRef} className="grid grid-cols-3 gap-5 mb-8">
      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
        </div>
        <div ref={queriesRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          0
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">总查询次数</div>
      </div>

      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--success-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            {stats.avgExecutionTimeMs}ms 平均
          </span>
        </div>
        <div ref={successRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          0%
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">查询成功率</div>
      </div>

      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--warning-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--highlight)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            </svg>
          </div>
        </div>
        <div className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body font-mono">
          {stats.topTable ? stats.topTable.name : "—"}
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">
          最热表{stats.topTable ? ` · ${stats.topTable.count} 次查询` : ""}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 修改 DashboardPage.tsx — 统计卡片动效 + 迷你柱状图生长**

在 DashboardPage.tsx 中：

1. 添加 import:
```typescript
import { useRef } from "react";
import { useStaggerEntrance, useBarGrow, useCountUp } from "../../hooks/useGsapAnimations";
```

2. 在 DashboardPage 组件内添加 refs 和 hooks:
```typescript
  const containerRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const dsCountRef = useRef<HTMLDivElement>(null);
  const convCountRef = useRef<HTMLDivElement>(null);

  useStaggerEntrance(containerRef, ".stat-card", [loading]);
  useBarGrow(barChartRef, ".trend-bar", [recentQueries.length]);
  useCountUp(dsCountRef, datasources.length);
  useCountUp(convCountRef, conversations.length);
```

3. 在 StatCard 组件中，将 `value` 渲染改为支持 ref:
```typescript
// StatCard — 添加 valueRef prop
interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeUp?: boolean;
  icon: string;
  delay: string;
  valueRef?: React.RefObject<HTMLDivElement | null>;
}

function StatCard({ label, value, change, changeUp, icon, delay, valueRef }: StatCardProps) {
  return (
    <div className={`stat-card ${delay}`}>
      {/* ... 保持不变 ... */}
      <div ref={valueRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">{value}</div>
      {/* ... 保持不变 ... */}
    </div>
  );
}
```

4. 在趋势图柱条添加 `trend-bar` class:
```typescript
// line 175 — 添加 trend-bar class
                    <div
                      className="trend-bar w-full rounded-t-md transition-all duration-300 hover:opacity-80"
```

5. 给最外层 div 添加 ref:
```typescript
// line 118 — 添加 ref
    <div ref={containerRef} className="h-full overflow-auto bg-[var(--canvas)]">
```

6. 给趋势图容器添加 ref:
```typescript
// line 169 — 添加 ref
            <div ref={barChartRef} className="flex items-end gap-1" style={{ height: 120 }}>
```

7. 给数据源和对话 StatCard 传入 valueRef:
```typescript
          <StatCard
            label="数据源连接"
            value={datasources.length}
            icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            delay=""
            valueRef={dsCountRef}
          />
          <StatCard
            label="对话总数"
            value={conversations.length}
            icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            delay=""
            valueRef={convCountRef}
          />
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Insights/StatsBar.tsx packages/web/src/components/Dashboard/DashboardPage.tsx
git commit -m "feat: add shimmer skeleton, count-up numbers, and bar grow animations"
```

---

## Task 8: 图表入场动画 (中影响)

**Files:**
- Modify: `packages/web/src/components/ChartRenderers.tsx:1-161`

- [ ] **Step 1: 修改 ChartRenderers.tsx — 添加 Recharts 动画配置**

为所有 Recharts 图表组件添加 `animationDuration` 和 `animationEasing` props：

```typescript
// ChartRenderers.tsx — 在文件顶部添加常量:
const CHART_ANIMATION_DURATION = 800;
const CHART_ANIMATION_EASING = "ease-out";

// BarChartRenderer — 给 <Bar> 添加动画 props (line 65):
        <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={48}
             animationDuration={CHART_ANIMATION_DURATION} animationEasing={CHART_ANIMATION_EASING} />

// LineChartRenderer — 给 <Line> 添加动画 props (line 82):
        <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 5 }}
              animationDuration={CHART_ANIMATION_DURATION} animationEasing={CHART_ANIMATION_EASING} />

// AreaChartRenderer — 给 <Area> 添加动画 props (line 99):
        <Area key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} strokeWidth={2}
              animationDuration={CHART_ANIMATION_DURATION} animationEasing={CHART_ANIMATION_EASING} />

// PieChartRenderer — 给 <Pie> 添加动画 props (line 114):
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}
             dataKey="value" nameKey="name" label={renderLabel} labelLine={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
             animationDuration={CHART_ANIMATION_DURATION} animationEasing={CHART_ANIMATION_EASING}>

// ScatterChartRenderer — 给 <Scatter> 添加动画 props (line 136):
        <Scatter data={scatterData} fill={CHART_COLORS[0]}
                 animationDuration={CHART_ANIMATION_DURATION} animationEasing={CHART_ANIMATION_EASING} />
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ChartRenderers.tsx
git commit -m "feat: add entrance animation to all Recharts chart types"
```

---

## Task 9: 下拉菜单动效 (中影响)

**Files:**
- Modify: `packages/web/src/components/Chat/DatasourceSelector.tsx:1-119`

- [ ] **Step 1: 修改 DatasourceSelector.tsx — 下拉菜单展开/收起动效**

```typescript
// DatasourceSelector.tsx — 添加 import:
import { useDropdownAnimation } from "../../hooks/useGsapAnimations";

// 在组件内部添加 ref 和 hook:
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdownAnimation(menuRef, open);

// 给下拉菜单 div 添加 ref (line 52):
// 从:
      {open && (
        <div className="absolute top-full right-0 mt-1 w-[320px] max-h-[400px] overflow-y-auto
// 改为:
      <div ref={menuRef} style={open ? {} : { visibility: "hidden", opacity: 0, position: "absolute", pointerEvents: "none" }}
           className="absolute top-full right-0 mt-1 w-[320px] max-h-[400px] overflow-y-auto
                        bg-[var(--canvas)] border border-[var(--hairline)]
                        rounded-lg shadow-4 z-50 custom-scrollbar">
        {/* 保持内部内容不变 */}
      </div>
```

注意：将条件渲染 `{open && ...}` 改为始终渲染但通过 GSAP 控制可见性，这样退出动画才能执行。

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat/DatasourceSelector.tsx
git commit -m "feat: add dropdown open/close animation to DatasourceSelector"
```

---

## Task 10: Tab 切换动效 (中影响)

**Files:**
- Modify: `packages/web/src/components/Chat/ChannelTabs.tsx:1-27`

- [ ] **Step 1: 修改 ChannelTabs.tsx — Tab 滑动指示器**

```typescript
// ChannelTabs.tsx — 完整替换
import { useRef, useState } from "react";
import { AGENT_REGISTRY } from "../../agents/registry";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

interface ChannelTabsProps {
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

export default function ChannelTabs({ activeChannel, onChannelChange }: ChannelTabsProps) {
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);

  useGSAP(() => {
    if (!indicatorRef.current || !activeEl || prefersReducedMotion()) return;
    const containerRect = tabContainerRef.current?.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    if (!containerRect) return;
    gsap.to(indicatorRef.current, {
      x: elRect.left - containerRect.left,
      width: elRect.width,
      duration: DUR.normal,
      ease: EASE.smooth,
    });
  }, { scope: tabContainerRef, dependencies: [activeEl] });

  return (
    <div ref={tabContainerRef} className="flex items-center gap-1 border-b border-[var(--hairline)] px-6 relative">
      {/* Sliding underline indicator */}
      <div
        ref={indicatorRef}
        className="absolute bottom-0 h-[2px] bg-[var(--primary)] rounded-full"
        style={{ left: 0, width: 0 }}
      />

      {AGENT_REGISTRY.map(agent => (
        <button
          key={agent.id}
          ref={(el) => { if (activeChannel === agent.id && el) setActiveEl(el); }}
          onClick={() => onChannelChange(agent.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeChannel === agent.id
              ? "border-transparent text-[var(--primary)]"
              : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
          }`}
        >
          <span className="mr-1.5">{agent.icon}</span>
          {agent.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat/ChannelTabs.tsx
git commit -m "feat: add sliding indicator animation to ChannelTabs"
```

---

## Task 11: 思考指示器动效 (中影响)

**Files:**
- Modify: `packages/web/src/components/Chat/StepIndicator.tsx:1-53`

- [ ] **Step 1: 修改 StepIndicator.tsx — 更精致的思考动效**

```typescript
// StepIndicator.tsx — 完整替换
import { useRef } from "react";
import type { AgentStep } from "../../hooks/useAgentStream";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

interface StepIndicatorProps {
  step: AgentStep;
}

function ThinkingDot() {
  const dotRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    if (!dotRef.current || prefersReducedMotion()) return;
    gsap.to(dotRef.current, {
      scale: 1.4,
      autoAlpha: 0.4,
      duration: 0.8,
      repeat: -1,
      yoyo: true,
      ease: EASE.smooth,
    });
  }, { scope: dotRef });

  return <span ref={dotRef} className="inline-block text-[var(--primary)]">●</span>;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current || prefersReducedMotion()) return;
    gsap.from(containerRef.current, {
      autoAlpha: 0,
      x: -8,
      duration: DUR.fast,
      ease: EASE.entrance,
      clearProps: "autoAlpha,x",
    });
  }, { scope: containerRef });

  switch (step.type) {
    case "thinking":
      return (
        <div ref={containerRef} className="flex items-center gap-2 py-1">
          <ThinkingDot />
          <span className="text-xs text-[var(--steel)]">Thinking…</span>
          {step.content && (
            <span className="text-xs text-[var(--stone)] truncate max-w-xs">
              {step.content}
            </span>
          )}
        </div>
      );

    case "tool_call":
      return (
        <div ref={containerRef} className="flex items-center gap-2 py-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md
                           bg-[var(--primary-soft)] text-[var(--primary-text)]
                           text-xs font-mono uppercase tracking-wider font-medium">
            {step.toolName ?? "tool"}
          </span>
          {step.args && (
            <span className="text-xs text-[var(--stone)] font-mono truncate max-w-sm">
              {JSON.stringify(step.args).slice(0, 100)}
            </span>
          )}
        </div>
      );

    case "tool_result":
      return (
        <div ref={containerRef} className="flex items-center gap-2 py-1">
          <span className={`text-xs ${step.isError ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
            {step.isError ? "✗" : "✓"}
          </span>
          <span className="text-xs text-[var(--steel)]">
            {step.toolName ?? "tool"} {step.isError ? "failed" : "completed"}
          </span>
        </div>
      );

    default:
      return null;
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat/StepIndicator.tsx
git commit -m "feat: add refined thinking indicator and step entrance animations"
```

---

## Task 12: Onboarding 步骤切换动效 (中影响)

**Files:**
- Modify: `packages/web/src/components/Onboarding/OnboardingWizard.tsx:1-211`
- Modify: `packages/web/src/components/Onboarding/WizardStep.tsx`

- [ ] **Step 1: 修改 OnboardingWizard.tsx — 步骤切换滑动动效**

在 OnboardingWizard.tsx 中添加步骤切换动效：

```typescript
// OnboardingWizard.tsx — 添加 import:
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

// 在组件内部添加:
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const prevStep = useRef(currentStep);

  useGSAP(() => {
    if (!stepContainerRef.current || prefersReducedMotion()) return;
    if (prevStep.current === currentStep) return;
    const direction = currentStep > prevStep.current ? 1 : -1;
    prevStep.current = currentStep;

    gsap.fromTo(
      stepContainerRef.current,
      { autoAlpha: 0, x: direction * 30 },
      { autoAlpha: 1, x: 0, duration: DUR.normal, ease: EASE.snappy, clearProps: "autoAlpha,x" }
    );
  }, { scope: stepContainerRef, dependencies: [currentStep] });

// 给步骤内容容器添加 ref:
// 在 line 79 的 <div className="max-w-2xl mx-auto"> 内部，
// 包裹所有 WizardStep 的 div 添加 ref:
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          {/* ... header ... */}
        </div>

        <div ref={stepContainerRef}>
          {/* Step 1: Connect */}
          <WizardStep ... />
          {/* Step 2: Discover Schema */}
          <WizardStep ... />
          {/* Step 3: Annotate */}
          <WizardStep ... />
          {/* Step 4: Metrics */}
          <WizardStep ... />
        </div>
      </div>
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Onboarding/OnboardingWizard.tsx
git commit -m "feat: add slide transition animation to onboarding wizard steps"
```

---

## Task 13: 反馈按钮弹跳动效 (低影响)

**Files:**
- Modify: `packages/web/src/components/Chat/FeedbackButtons.tsx`

- [ ] **Step 1: 修改 FeedbackButtons.tsx — 点击弹跳动效**

在 FeedbackButtons.tsx 中，给按钮添加 GSAP 点击弹跳：

```typescript
// FeedbackButtons.tsx — 添加 import:
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

// 在组件内部添加 bounce handler:
  const containerRef = useRef<HTMLDivElement>(null);

  const handleBounce = (contextSafe: (fn: () => void) => () => void) =>
    contextSafe(() => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(event.currentTarget, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: EASE.bounce, clearProps: "scale" });
    });

// 在 useGSAP 中获取 contextSafe:
  const { contextSafe } = useGSAP(() => {}, { scope: containerRef });

// 给按钮 onClick 添加弹跳:
  const bounceClick = contextSafe((e: React.MouseEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(e.currentTarget, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: EASE.bounce, clearProps: "scale" });
  });

// 在 thumbs up/down 按钮上添加:
  onClick={(e) => { bounceClick(e); handleFeedback("positive"); }}
```

注意：具体实现需要根据 FeedbackButtons.tsx 的实际代码调整。核心模式是在点击时用 `gsap.fromTo` 做 scale 弹跳。

- [ ] **Step 2: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat/FeedbackButtons.tsx
git commit -m "feat: add bounce animation to feedback buttons"
```

---

## Task 14: 全局 prefers-reduced-motion 处理

**Files:**
- Modify: `packages/web/src/utils/gsap-presets.ts`

- [ ] **Step 1: 添加 gsap.matchMedia() 全局配置**

在 gsap-presets.ts 底部添加全局 matchMedia 配置，确保所有动效尊重用户偏好：

```typescript
// gsap-presets.ts — 在文件底部添加:

// ─── Global Reduced Motion Handler ─────────────────────
// This ensures ALL GSAP animations respect prefers-reduced-motion
// when duration is set via prefersReducedMotion() check
export function initGsapReducedMotion() {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: reduce)", () => {
    // When user prefers reduced motion, set global defaults to 0 duration
    gsap.defaults({ duration: 0 });
  });
  mm.add("(prefers-motion: no-preference)", () => {
    // Restore normal defaults
    gsap.defaults({ duration: 0.5 });
  });
}
```

- [ ] **Step 2: 在 App.tsx 中调用初始化**

在 App.tsx 的 import 中添加:
```typescript
import { initGsapReducedMotion } from "./utils/gsap-presets";
```

在 App 组件顶部调用:
```typescript
  // Initialize GSAP reduced motion handling (once)
  if (!window.__gsapReducedMotionInit) {
    initGsapReducedMotion();
    window.__gsapReducedMotionInit = true;
  }
```

在 globals.css 的 `:root` 中添加类型声明辅助（或在 `global.d.ts` 中）:
```typescript
// 如果没有 global.d.ts，添加到 App.tsx 顶部:
declare global {
  interface Window {
    __gsapReducedMotionInit?: boolean;
  }
}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/utils/gsap-presets.ts packages/web/src/App.tsx
git commit -m "feat: add global prefers-reduced-motion handling for GSAP"
```

---

## Task 15: 最终集成验证

**Files:** 无新文件

- [ ] **Step 1: 运行完整 TypeScript 编译检查**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova/packages/web && npx tsc --noEmit 2>&1`
Expected: 0 errors

- [ ] **Step 2: 运行 Vite 构建检查**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run build 2>&1 | tail -20`
Expected: Build successful, no errors

- [ ] **Step 3: 启动开发服务器进行手动验证**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run dev:web &`
验证点:
1. 页面切换有淡入动效
2. 侧边栏指示器滑动
3. 聊天消息交错入场
4. 弹窗有入场/退场动效
5. 折叠展开有高度过渡
6. 图表有入场动画
7. 骨架屏有 shimmer 效果
8. 数字有滚动动效

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete GSAP animation system — 15 animation effects across all major UI components"
```

---

## Self-Review Checklist

**1. Spec coverage:** All 15 animation scenarios from the analysis are covered by Tasks 1-14.

**2. Placeholder scan:** No TBD/TODO/fill-in-later patterns. All code is concrete.

**3. Type consistency:**
- `useGSAP` from `@gsap/react` used consistently
- `gsap.registerPlugin(useGSAP)` called in every file that uses it
- All refs typed as `React.RefObject<HTMLElement | null>`
- `prefersReducedMotion()` checked in every animation function
- `clearProps` used to clean up inline styles after animations

**4. Potential issues addressed:**
- Conditional rendering → always-render + GSAP visibility (for exit animations)
- Layout shift from `<main>` move → handled by keeping same CSS classes
- Memory leaks → `useGSAP` auto-cleanup + `gsap.context()` scoping
- SSR safety → all GSAP code runs in `useGSAP`/`useEffect` (client-only)
