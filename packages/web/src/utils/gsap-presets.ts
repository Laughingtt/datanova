// packages/web/src/utils/gsap-presets.ts
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

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

/** Count up number animation */
export function countUp(
  target: Element,
  opts: { endValue: number; duration?: number; prefix?: string; suffix?: string; decimals?: number }
) {
  const { endValue, duration = DUR.countUp, prefix = "", suffix = "", decimals } = opts;
  // Auto-detect decimal places from endValue unless explicitly provided (e.g. 3.5 → 1, 12.345 → 3)
  const dp = decimals ?? (Number.isInteger(endValue) ? 0 : Math.min(2, (String(endValue).split(".")[1] || "").length));
  const obj = { value: 0 };
  return gsap.to(obj, {
    value: endValue,
    duration: prefersReducedMotion() ? 0 : duration,
    ease: EASE.smooth,
    onUpdate: () => {
      const display = dp === 0
        ? Math.round(obj.value).toLocaleString()
        : obj.value.toFixed(dp);
      target.textContent = prefix + display + suffix;
    },
  });
}
