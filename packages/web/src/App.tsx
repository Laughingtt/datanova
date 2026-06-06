import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import ChatWindow from "./components/Chat/ChatWindow";
import DatasourcePage from "./components/Datasource/DatasourcePage";
import SchemaPage from "./components/Schema/SchemaPage";
import MetricsPage from "./components/Metrics/MetricsPage";
import ScheduledPage from "./components/Scheduled/ScheduledPage";
import DictionaryPage from "./components/Dictionary/DictionaryPage";

export default function App() {
  const { view, selectedDatasourceId } = useAppStore();

  return (
    <Layout>
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
      {view === "scheduled" && <ScheduledPage />}
      {view === "dictionary" && <DictionaryPage />}
    </Layout>
  );
}
