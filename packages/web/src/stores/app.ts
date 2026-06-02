import { create } from "zustand";

export type AppView = "chat" | "datasources" | "schemas";

interface AppState {
  view: AppView;
  selectedDatasourceId: string | null;
  selectedConversationId: string | null;

  setView: (view: AppView) => void;
  setSelectedDatasourceId: (id: string | null) => void;
  setSelectedConversationId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "chat",
  selectedDatasourceId: null,
  selectedConversationId: null,

  setView: (view) => set({ view }),
  setSelectedDatasourceId: (id) => set({ selectedDatasourceId: id }),
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
}));
