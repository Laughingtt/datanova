import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import ChatWindow from "./components/Chat/ChatWindow";
import DatasourcePage from "./components/Datasource/DatasourcePage";
import SchemaPage from "./components/Schema/SchemaPage";

export default function App() {
  const { view } = useAppStore();

  return (
    <Layout>
      {view === "chat" && <ChatWindow />}
      {view === "datasources" && <DatasourcePage />}
      {view === "schemas" && <SchemaPage />}
    </Layout>
  );
}
