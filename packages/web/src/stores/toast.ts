import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number; // 0 = 手动关闭
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: { id?: string; type: ToastType; title: string; description?: string; duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const genId = () => `t_${Date.now()}_${seq++}`;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ id, type, title, description, duration }) => {
    const tid = id ?? genId();
    const d = duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { id: tid, type, title, description, duration: d }] }));
    if (d > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== tid) }));
      }, d);
    }
    return tid;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// 便捷 API：直接调用，不依赖 React 上下文
export const toast = {
  success: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().push({ type: "success", title, description, duration }),
  error: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().push({ type: "error", title, description, duration: duration ?? 6000 }),
  warning: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().push({ type: "warning", title, description, duration }),
  info: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().push({ type: "info", title, description, duration }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};
