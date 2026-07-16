import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import { datasourcesApi } from "./api/client";
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

export default function App() {
  const { view, selectedDatasourceId, onboardingCompleted, setOnboardingCompleted } = useAppStore();
  const [hasExistingDatasource, setHasExistingDatasource] = useState(false);
  const [datasourceChecked, setDatasourceChecked] = useState(false);

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
      {showOnboarding && (
        <OnboardingWizard />
      )}
      {view === "dashboard" && <DashboardPage />}
      {view === "chat" && <ChatWindow />}
      {view === "datasources" && <DatasourcePage />}
      {view === "schemas" && <SchemaPage />}
      {view === "metrics" && selectedDatasourceId && <MetricsPage />}
      {view === "metrics" && !selectedDatasourceId && (
        <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
          <div className="text-center">
            <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
            <p className="text-xs text-[var(--steel)] mt-2">
              前往数据源页面选择一个数据源以管理指标
            </p>
          </div>
        </div>
      )}
      {view === "analysis" && <AnalysisPage />}
      {view === "dictionary" && <DictionaryPage />}
      {view === "queryHistory" && <QueryHistoryPage />}
      {view === "insights" && <InsightsPage />}
      {view === "querySkills" && selectedDatasourceId && <QuerySkillsPage />}
      {view === "querySkills" && !selectedDatasourceId && (
        <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
          <div className="text-center">
            <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
            <p className="text-xs text-[var(--steel)] mt-2">
              前往数据源页面选择一个数据源以管理查询技能
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
