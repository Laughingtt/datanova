// packages/web/src/hooks/useGsapAnimations.ts
import { useRef, useCallback, useEffect } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useGSAP } from "@gsap/react";
import {
  EASE,
  DUR,
  prefersReducedMotion,
  countUp,
} from "../utils/gsap-presets";

gsap.registerPlugin(useGSAP, Flip, DrawSVGPlugin, MotionPathPlugin, MorphSVGPlugin);

// ─── usePageTransition ─────────────────────────────────
/** 页面切换交叉淡入动效 */
export function usePageTransition(
  containerRef: React.RefObject<HTMLElement | null>
) {
  const prevChildren = useRef<React.ReactNode>(null);

  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        containerRef.current,
        { autoAlpha: 0, y: 6 },
        {
          autoAlpha: 1,
          y: 0,
          duration: DUR.page,
          ease: EASE.smooth,
          clearProps: "autoAlpha,y",
        }
      );
    },
    { scope: containerRef }
  );

  return prevChildren;
}

// ─── useModalAnimation ─────────────────────────────────
/** 弹窗入场/退场动效 */
export function useModalAnimation(
  overlayRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const open = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (!overlayRef.current || !contentRef.current) return;
    tlRef.current?.kill();
    gsap.set(overlayRef.current, { autoAlpha: 0 });
    gsap.set(contentRef.current, { autoAlpha: 0, scale: 0.95, y: 10 });
    const tl = gsap.timeline();
    tl.to(overlayRef.current, {
      autoAlpha: 1,
      duration: DUR.fast,
      ease: EASE.smooth,
    });
    tl.to(
      contentRef.current,
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: DUR.modal,
        ease: EASE.bounce,
        clearProps: "scale,y",
      },
      "<"
    );
    tlRef.current = tl;
  }, [overlayRef, contentRef]);

  const close = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    if (!overlayRef.current || !contentRef.current) {
      onClose();
      return;
    }
    tlRef.current?.kill();
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(contentRef.current, {
      autoAlpha: 0,
      scale: 0.95,
      y: 10,
      duration: DUR.fast,
      ease: EASE.exit,
    });
    tl.to(
      overlayRef.current,
      { autoAlpha: 0, duration: DUR.fast, ease: EASE.exit },
      "<"
    );
    tlRef.current = tl;
  }, [overlayRef, contentRef, onClose]);

  useEffect(() => {
    return () => {
      tlRef.current?.kill();
    };
  }, []);

  return { open, close };
}

// ─── useCollapseAnimation ──────────────────────────────
/** 折叠展开动效 */
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
        gsap.set(contentRef.current, {
          height: 0,
          autoAlpha: 0,
          overflow: "hidden",
        });
        gsap.to(contentRef.current, {
          height: "auto",
          autoAlpha: 1,
          duration: DUR.collapse,
          ease: EASE.smooth,
          onComplete: () =>
            gsap.set(contentRef.current, {
              overflow: "visible", clearProps: "height,autoAlpha" }),
        });
      } else {
        gsap.set(contentRef.current, { overflow: "hidden" });
        gsap.to(contentRef.current, {
          height: 0,
          autoAlpha: 0,
          duration: DUR.collapse,
          ease: EASE.exit,
          onComplete: () =>
            gsap.set(contentRef.current, {
              clearProps: "overflow,height,autoAlpha",
            }),
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

// ─── useCountUp ────────────────────────────────────────
/** 数字滚动动效 */
export function useCountUp(
  targetRef: React.RefObject<HTMLElement | null>,
  endValue: number,
  opts: { prefix?: string; suffix?: string; decimals?: number } = {}
) {
  const { prefix, suffix, decimals } = opts;
  useGSAP(
    () => {
      if (!targetRef.current || prefersReducedMotion()) return;
      countUp(targetRef.current, { endValue, ...opts });
    },
    { scope: targetRef, dependencies: [endValue, prefix, suffix, decimals] }
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
        gsap.set(menuRef.current, {
          autoAlpha: 0,
          y: -4,
          scaleY: 0.95,
          transformOrigin: "top center",
        });
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

// ─── useFlipList ───────────────────────────────────────
/**
 * 列表项 FLIP 补位动效。
 * 在 deps 变化（删除/重排/增减）后，剩余项平滑过渡到新位置。
 * selector 指向列表内每个直接子项（需稳定 key）。
 */
export function useFlipList(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = []
) {
  const stateRef = useRef<Flip.FlipState | null>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;
      if (prefersReducedMotion()) return;
      const items = containerRef.current.querySelectorAll(selector);
      if (items.length === 0) {
        stateRef.current = null;
        return;
      }

      // 有上一帧状态 → 播放 FLIP；无则记录当前状态供下一次比较。
      // 删除项的 DOM 已在本次渲染前卸载，故无需 onLeave；
      // Flip.from 让剩余项从旧位置平滑滑入新位置。
      if (stateRef.current) {
        Flip.from(stateRef.current, {
          targets: items,
          duration: DUR.slow,
          ease: EASE.smoothInOut,
          absolute: true,
          nested: true,
          scale: true,
        });
      }
      stateRef.current = Flip.getState(items);
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useDrawSvgConnectors ─────────────────────────────
/**
 * DrawSVG 逐段"画出"SVG 连接线（决策链时间线、流程图连接线等）。
 * 目标元素必须为带 stroke/stroke-width 的 SVG <path>/<line>/<polyline>。
 */
export function useDrawSvgConnectors(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const paths = containerRef.current.querySelectorAll(selector);
      if (paths.length === 0) return;
      gsap.fromTo(
        paths,
        { drawSVG: 0 },
        {
          drawSVG: "0% 100%",
          duration: DUR.slow,
          stagger: DUR.stagger,
          ease: EASE.smoothInOut,
        }
      );
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useMotionPathDot ─────────────────────────────────
/**
 * 让一个发光小点沿 SVG <path> 轨迹滑动入场（折线/曲线图表）。
 * dotSelector 指向被移动的元素，pathSelector 指向路径。
 */
export function useMotionPathDot(
  containerRef: React.RefObject<HTMLElement | null>,
  dotSelector: string,
  pathSelector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const dot = containerRef.current.querySelector(dotSelector);
      const pathEl = containerRef.current.querySelector(pathSelector);
      if (!dot || !pathEl) return;
      if (!(pathEl instanceof SVGPathElement)) return;
      gsap.fromTo(
        dot,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: DUR.slow,
          ease: EASE.smooth,
          motionPath: { path: pathEl, align: pathEl, alignOrigin: [0.5, 0.5] },
        }
      );
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useIconMorph ─────────────────────────────────────
/**
 * MorphSVG 图标形态切换：在 trigger 变化时把 pathA 形变到 pathB。
 * fromPath/toPath 可为选择器、元素或 path data 字符串。
 */
export function useIconMorph(
  targetRef: React.RefObject<SVGPathElement | null>,
  toPath: string,
  trigger: unknown
) {
  useGSAP(
    () => {
      if (!targetRef.current || prefersReducedMotion()) return;
      gsap.to(targetRef.current, {
        morphSVG: toPath,
        duration: DUR.normal,
        ease: EASE.smoothInOut,
      });
    },
    { scope: targetRef, dependencies: [trigger] }
  );
}

// ─── useButtonPress ───────────────────────────────────
/**
 * 按钮按压弹性反馈：pointerdown 缩到 0.95，pointerup 弹回 1（back.out）。
 * 用 contextSafe 包裹，确保卸载后 no-op。
 */
export function useButtonPress(
  targetRef: React.RefObject<HTMLElement | null>
) {
  const { contextSafe } = useGSAP({ scope: targetRef });

  const onPress = contextSafe(() => {
    if (!targetRef.current || prefersReducedMotion()) return;
    gsap.to(targetRef.current, {
      scale: 0.95,
      duration: DUR.instant,
      ease: EASE.snappy,
    });
  });

  const onRelease = contextSafe(() => {
    if (!targetRef.current || prefersReducedMotion()) return;
    gsap.to(targetRef.current, {
      scale: 1,
      duration: DUR.fast,
      ease: EASE.bounce,
    });
  });

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.addEventListener("pointerdown", onPress);
    el.addEventListener("pointerup", onRelease);
    el.addEventListener("pointerleave", onRelease);
    return () => {
      el.removeEventListener("pointerdown", onPress);
      el.removeEventListener("pointerup", onRelease);
      el.removeEventListener("pointerleave", onRelease);
    };
  }, [onPress, onRelease, targetRef]);
}

// ─── useToastStagger ──────────────────────────────────
/**
 * Toast 容器内多条通知交错滑入。toasts.length 作为依赖触发重排。
 */
export function useToastStagger(
  containerRef: React.RefObject<HTMLElement | null>,
  itemSelector: string,
  count: number
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const items = containerRef.current.querySelectorAll(itemSelector);
      if (items.length === 0) return;
      gsap.fromTo(
        items,
        { autoAlpha: 0, x: 40 },
        {
          autoAlpha: 1,
          x: 0,
          duration: DUR.normal,
          stagger: DUR.stagger,
          ease: EASE.snappy,
          clearProps: "autoAlpha,x",
        }
      );
    },
    { scope: containerRef, dependencies: [count] }
  );
}

// ─── useTableRowEntrance ──────────────────────────────
/**
 * 表格行首屏交错入场（hover 过渡交由 CSS）。
 */
export function useTableRowEntrance(
  containerRef: React.RefObject<HTMLElement | null>,
  rowSelector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const rows = containerRef.current.querySelectorAll(rowSelector);
      if (rows.length === 0) return;
      gsap.from(rows, {
        autoAlpha: 0,
        y: 8,
        duration: DUR.fast,
        stagger: 0.03,
        ease: EASE.entrance,
        clearProps: "autoAlpha,y",
      });
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useEmptyStateEntrance ────────────────────────────
/**
 * 空状态 SVG 入场：弹性放大 + DrawSVG 勾勒描边。
 */
export function useEmptyStateEntrance(
  containerRef: React.RefObject<HTMLElement | null>,
  svgSelector: string,
  deps: unknown[] = []
) {
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const svgWrap = containerRef.current.querySelector(svgSelector);
      if (!svgWrap) return;
      gsap.fromTo(
        svgWrap,
        { scale: 0.8, autoAlpha: 0 },
        {
          scale: 1,
          autoAlpha: 1,
          duration: DUR.slow,
          ease: EASE.bounce,
          clearProps: "scale,autoAlpha",
        }
      );
      // 若内部有可勾勒的 path，顺带 DrawSVG
      const paths = svgWrap.querySelectorAll("path");
      if (paths.length > 0) {
        gsap.fromTo(
          paths,
          { drawSVG: 0 },
          {
            drawSVG: "0% 100%",
            duration: DUR.slow,
            stagger: 0.04,
            ease: EASE.smoothInOut,
          }
        );
      }
    },
    { scope: containerRef, dependencies: deps }
  );
}

// ─── useCursorPulse ───────────────────────────────────
/**
 * 聊天流式光标呼吸脉冲：opacity 0.3↔1 循环。
 */
export function useCursorPulse(
  targetRef: React.RefObject<HTMLElement | null>,
  active: boolean
) {
  useGSAP(
    () => {
      if (!targetRef.current || prefersReducedMotion()) return;
      if (!active) {
        gsap.killTweensOf(targetRef.current, "opacity");
        gsap.set(targetRef.current, { opacity: 1 });
        return;
      }
      gsap.to(targetRef.current, {
        opacity: 0.3,
        duration: DUR.shimmer,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    },
    { scope: targetRef, dependencies: [active] }
  );
}
