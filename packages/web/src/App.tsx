import { useEffect, useRef, useState } from "react";
import Layout from "./components/Layout";
import { useAppStore, type AppView } from "./stores/app";
import { datasourcesApi } from "./api/client";
import { usePageTransition } from "./hooks/useGsapAnimations";
import { useHotkeys } from "./hooks/useHotkeys";
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
import AgentTracesPage from "./components/AgentTraces/AgentTracesPage";
import EmptyState from "./components/common/EmptyState";
import ToastContainer from "./components/common/ToastContainer";
import ConnectionBanner from "./components/common/ConnectionBanner";
import CommandPalette from "./components/common/CommandPalette";

// 用于"未选择数据源"空状态：避免每处重复写 SVG
const DATASOURCE_ICON = (
  <svg className="w-8 h-8 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75" />
  </svg>
);

export default function App() {
  const { view, selectedDatasourceId, onboardingCompleted, setOnboardingCompleted, setView } = useAppStore();
  const [hasExistingDatasource, setHasExistingDatasource] = useState(false);
  const [datasourceChecked, setDatasourceChecked] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  usePageTransition(mainRef);

  // 全局快捷键
  useHotkeys([
    // Cmd/Ctrl + K 命令面板
    { key: "k", mod: true, handler: () => setCmdOpen((v) => !v) },
    // g 后接 d/c/a 快速跳转（Linear 风格两段式）
    { key: "g", handler: () => {
        const onKey = (e2: KeyboardEvent) => {
          window.removeEventListener("keydown", onKey, true);
          const map: Record<string, AppView> = {
            d: "dashboard", c: "chat", a: "analysis",
            s: "schemas", m: "metrics", h: "queryHistory",
          };
          const target = map[e2.key.toLowerCase()];
          if (target) { e2.preventDefault(); setView(target); }
        };
        window.addEventListener("keydown", onKey, { capture: true, once: true });
        // 800ms 内未按下一键则取消
        setTimeout(() => window.removeEventListener("keydown", onKey, true), 800);
      }, preventDefault: true,
    },
  ]);

  // 监听移动端汉堡按钮触发的命令面板打开事件
  useEffect(() => {
    const opener = () => setCmdOpen(true);
    window.addEventListener("datanova:cmd-open", opener);
    return () => window.removeEventListener("datanova:cmd-open", opener);
  }, []);

  // Check if datasource already exists on mount — skip onboarding if so
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

  // Show onboarding wizard only when: datasource is selected, onboarding not completed,
  // no existing datasource found yet, and the check has completed
  const showOnboarding = selectedDatasourceId && !onboardingCompleted && !hasExistingDatasource && datasourceChecked;

  return (
    <Layout>
      <ConnectionBanner />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-auto">
        {showOnboarding && (
          <OnboardingWizard />
        )}
        {view === "dashboard" && <DashboardPage />}
        {view === "chat" && <ChatWindow />}
        {view === "datasources" && <DatasourcePage />}
        {view === "schemas" && <SchemaPage />}
        {view === "metrics" && selectedDatasourceId && <MetricsPage />}
        {view === "metrics" && !selectedDatasourceId && (
          <EmptyState
            icon={DATASOURCE_ICON}
            title="请先选择一个数据源"
            description="前往数据源页面选择一个数据源以管理指标"
          />
        )}
        {view === "analysis" && <AnalysisPage />}
        {view === "dictionary" && <DictionaryPage />}
        {view === "queryHistory" && <QueryHistoryPage />}
        {view === "insights" && <InsightsPage />}
        {view === "agentTraces" && <AgentTracesPage />}
        {view === "querySkills" && selectedDatasourceId && <QuerySkillsPage />}
        {view === "querySkills" && !selectedDatasourceId && (
          <EmptyState
            icon={DATASOURCE_ICON}
            title="请先选择一个数据源"
            description="前往数据源页面选择一个数据源以管理查询技能"
          />
        )}
      </main>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ToastContainer />
    </Layout>
  );
}
