import { useCallback, useRef, useState } from "react";
import { toast } from "../stores/toast";

/**
 * 复制到剪贴板并给出反馈。
 * - 成功：可选内联状态 + toast
 * - 失败：toast.error 提示
 */
export function useCopy({ feedback = true, inline = false, successText = "已复制" } = {}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // 兜底：execCommand
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        if (inline) {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        }
        if (feedback) toast.success(successText);
        return true;
      } catch {
        if (feedback) toast.error("复制失败", "请检查浏览器剪贴板权限");
        return false;
      }
    },
    [feedback, inline, successText]
  );

  return { copied, copy };
}
