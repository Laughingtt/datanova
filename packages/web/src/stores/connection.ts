import { create } from "zustand";

export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

interface ConnectionStore {
  status: ConnectionStatus;
  lastError: string | null;
  lastChangedAt: number;
  /** 重连尝试次数 */
  attempts: number;
  /** 由 useWebSocket 注册的重连函数，供 UI 调用 */
  reconnectFn: (() => void) | null;
  setStatus: (status: ConnectionStatus) => void;
  setError: (err: string | null) => void;
  setAttempts: (n: number) => void;
  registerReconnect: (fn: (() => void) | null) => void;
  reconnect: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  status: "connecting",
  lastError: null,
  lastChangedAt: Date.now(),
  attempts: 0,
  reconnectFn: null,
  setStatus: (status) => set({ status, lastChangedAt: Date.now() }),
  setError: (lastError) => set({ lastError }),
  setAttempts: (attempts) => set({ attempts }),
  registerReconnect: (fn) => set({ reconnectFn: fn }),
  reconnect: () => {
    const fn = get().reconnectFn;
    if (fn) fn();
  },
}));
