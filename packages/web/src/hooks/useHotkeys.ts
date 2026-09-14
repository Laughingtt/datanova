import { useEffect } from "react";

export interface KeyBinding {
  /** 小写的 key，如 "k", "Enter", "Escape", "/" */
  key: string;
  /** 是否需要 Cmd (mac) / Ctrl (其他)，undefined 表示不要求 */
  mod?: boolean;
  /** 是否需要 Shift，undefined 表示不要求 */
  shift?: boolean;
  /** 是否需要 Alt，undefined 表示不要求 */
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  /** 是否阻止默认与冒泡，默认 true */
  preventDefault?: boolean;
  /** 当焦点在 input/textarea/contenteditable 时不触发，默认 true */
  ignoreFormFields?: boolean;
}

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isFormField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (FORM_TAGS.has(el.tagName)) return true;
  return el.isContentEditable;
}

/**
 * 注册全局快捷键。在组件中调用：
 *
 * useHotkeys([
 *   { key: "k", mod: true, handler: () => setCmdOpen(true) },
 *   { key: "/", handler: () => focusInput() },
 * ]);
 */
export function useHotkeys(bindings: KeyBinding[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMacMod = e.metaKey || e.ctrlKey;
      for (const b of bindings) {
        if (b.mod != null && b.mod !== isMacMod) continue;
        if (b.shift != null && b.shift !== e.shiftKey) continue;
        if (b.alt != null && b.alt !== e.altKey) continue;
        if (e.key.toLowerCase() !== b.key.toLowerCase()) continue;
        if (b.ignoreFormFields !== false && isFormField(e.target)) {
          // 表单中只放行 mod 快捷键（如 Cmd+K），单字符快捷键让位给输入
          if (!b.mod) continue;
        }
        if (b.preventDefault !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        b.handler(e);
        return;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [bindings]);
}
