import { create } from "zustand";

export type AppView = "chat" | "datasources" | "schemas";

interface AppState {
  view: AppView;
  selectedDatasourceId: string | null;
  selectedConversationId: string | null;
  modelProvider: string | null;
  modelId: string | null;

  setView: (view: AppView) => void;
  setSelectedDatasourceId: (id: string | null) => void;
  setSelectedConversationId: (id: string | null) => void;
  setModel: (provider: string, modelId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "chat",
  selectedDatasourceId: null,
  selectedConversationId: null,
  modelProvider: null,
  modelId: null,

  setView: (view) => set({ view }),
  setSelectedDatasourceId: (id) => set({ selectedDatasourceId: id }),
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
  setModel: (provider, modelId) => set({ modelProvider: provider, modelId }),
}));
