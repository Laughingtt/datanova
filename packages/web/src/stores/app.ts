import { create } from "zustand";

export type AppView = "chat" | "datasources" | "schemas" | "metrics" | "scheduled" | "dictionary";

interface AppState {
  // Navigation
  view: AppView;
  setView: (view: AppView) => void;

  // Selected datasource (for chat and schema views)
  selectedDatasourceId: string | null;
  selectedDatasourceName: string | null;
  setSelectedDatasource: (id: string | null, name: string | null) => void;

  // Selected conversation
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Selected metric (for metrics page)
  selectedMetricId: string | null;
  setSelectedMetricId: (id: string | null) => void;

  // Model selection
  modelProvider: string | null;
  modelId: string | null;
  setModel: (provider: string, modelId: string) => void;

  // Onboarding state
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  view: "chat",
  setView: (view) => set({ view }),

  // Selected datasource
  selectedDatasourceId: null,
  selectedDatasourceName: null,
  setSelectedDatasource: (id, name) => set({
    selectedDatasourceId: id,
    selectedDatasourceName: name,
  }),

  // Selected conversation
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  // Selected metric
  selectedMetricId: null,
  setSelectedMetricId: (id) => set({ selectedMetricId: id }),

  // Model selection
  modelProvider: null,
  modelId: null,
  setModel: (provider, modelId) => set({ modelProvider: provider, modelId }),

  // Onboarding state
  onboardingCompleted: false,
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
}));
