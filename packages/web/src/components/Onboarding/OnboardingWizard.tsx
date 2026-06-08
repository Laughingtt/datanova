import { useState, useEffect } from "react";
import { useAppStore } from "../../stores/app";
import { datasourcesApi, type Datasource } from "../../api/client";
import WizardStep from "./WizardStep";

const TOTAL_STEPS = 4;

type WizardStepKey = "connect" | "discover" | "annotate" | "metrics";

const STEP_CONFIG: Record<WizardStepKey, { title: string; description: string }> = {
  connect: {
    title: "步骤 1：连接数据库",
    description: "首先，添加一个 MySQL 数据源，让 DataNova 发现您的数据。",
  },
  discover: {
    title: "步骤 2：发现 Schema",
    description: "DataNova 将扫描您的数据库，发现表、列和关系。",
  },
  annotate: {
    title: "步骤 3：添加业务上下文",
    description: "添加业务友好的描述，帮助 AI 更好地理解您的数据。",
  },
  metrics: {
    title: "步骤 4：定义业务指标",
    description: "创建可复用的指标和维度，使查询更加准确。",
  },
};

export default function OnboardingWizard() {
  const { selectedDatasourceId, setView, onboardingCompleted, setOnboardingCompleted } = useAppStore();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [showWizard, setShowWizard] = useState(true);

  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [selectedDsId, setSelectedDsId] = useState(selectedDatasourceId ?? "");
  const [discovered, setDiscovered] = useState(false);

  useEffect(() => {
    datasourcesApi.list().then(setDatasources).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDatasourceId) {
      setSelectedDsId(selectedDatasourceId);
    }
  }, [selectedDatasourceId]);

  const handleConnect = () => {
    if (!selectedDsId) return;
    const { setSelectedDatasource } = useAppStore.getState();
    const ds = datasources.find(d => d.id === selectedDsId);
    if (ds) setSelectedDatasource(ds.id, ds.name);
    setCompletedSteps(prev => new Set([...prev, 1]));
    setCurrentStep(2);
  };

  const handleGoToDiscover = () => {
    setCompletedSteps(prev => new Set([...prev, 2]));
    setCurrentStep(3);
    setView("schemas");
  };

  const handleGoToAnnotate = () => {
    setCompletedSteps(prev => new Set([...prev, 3]));
    setCurrentStep(4);
    setView("schemas");
  };

  const handleGoToMetrics = () => {
    setCompletedSteps(prev => new Set([...prev, 4]));
    setOnboardingCompleted(true);
    setView("metrics");
  };

  if (!showWizard) return null;

  return (
    <div className="p-6 bg-gradient-to-b from-[var(--cream-soft)] to-[var(--canvas)] border-b border-[var(--hairline)]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-heading-4 text-[var(--ink)]">🚀 设置向导</h3>
          <button
            onClick={() => { setShowWizard(false); setOnboardingCompleted(true); }}
            className="text-xs text-[var(--steel)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>

        {/* Step 1: Connect */}
        <WizardStep
          step={1} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 1}
          isCompleted={completedSteps.has(1)}
          nextLabel="Connect & Continue"
          nextDisabled={!selectedDsId && !selectedDatasourceId}
          onNext={handleConnect}
          {...STEP_CONFIG.connect}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Select an existing datasource or go to the Datasources page to add a new one.
            </p>
            {datasources.filter(ds => ds.enabled).length > 0 ? (
              <div className="space-y-2">
                {datasources.filter(ds => ds.enabled).map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => setSelectedDsId(ds.id)}
                    className={`w-full text-left px-4 py-3 rounded-md border transition-colors ${
                      selectedDsId === ds.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--hairline)] hover:border-[var(--steel)]"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--ink)]">{ds.name}</p>
                    <p className="text-xs text-[var(--steel)] font-mono">{ds.host}:{ds.port}/{ds.database}</p>
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => setView("datasources")} className="btn-primary text-sm">
                Go to Datasources → Add your first connection
              </button>
            )}
          </div>
        </WizardStep>

        {/* Step 2: Discover Schema */}
        <WizardStep
          step={2} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 2}
          isCompleted={completedSteps.has(2)}
          onNext={handleGoToDiscover}
          onSkip={() => { setCurrentStep(3); setCompletedSteps(prev => new Set([...prev, 2])); }}
          nextLabel="Open Schema Page →"
          {...STEP_CONFIG.discover}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-2">
              DataNova will scan your database to:
            </p>
            <ul className="text-sm text-[var(--slate)] space-y-1 list-disc list-inside mb-3">
              <li>找到所有表和列</li>
              <li>映射外键关系</li>
              <li>检测值域（枚举值、数值范围）</li>
            </ul>
            <p className="text-xs text-[var(--steel)]">
              Go to Schema Annotations → the schema is discovered automatically when you visit the page.
            </p>
          </div>
        </WizardStep>

        {/* Step 3: Annotate */}
        <WizardStep
          step={3} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 3}
          isCompleted={completedSteps.has(3)}
          onNext={handleGoToAnnotate}
          onSkip={() => { setCurrentStep(4); setCompletedSteps(prev => new Set([...prev, 3])); }}
          nextLabel="Open Schema Annotations →"
          {...STEP_CONFIG.annotate}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Add business descriptions to tables and columns. This helps AI generate better SQL queries.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-[var(--primary-text)] mt-0.5">🤖</span>
                <div>
                  <p className="text-[var(--ink)] font-medium">AI 自动标注</p>
                  <p className="text-xs text-[var(--steel)]">Let AI analyze your schema and generate annotations automatically</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="text-[var(--primary-text)] mt-0.5">✏️</span>
                <div>
                  <p className="text-[var(--ink)] font-medium">手动标注</p>
                  <p className="text-xs text-[var(--steel)]">Add descriptions yourself in the Schema Annotations page</p>
                </div>
              </div>
            </div>
          </div>
        </WizardStep>

        {/* Step 4: Metrics */}
        <WizardStep
          step={4} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 4}
          isCompleted={completedSteps.has(4)}
          onNext={handleGoToMetrics}
          onSkip={() => { setShowWizard(false); setOnboardingCompleted(true); }}
          nextLabel="Open Metrics →"
          {...STEP_CONFIG.metrics}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Define reusable metrics (like "Revenue", "Order Count") with pre-built SQL expressions.
            </p>
            <div className="p-3 rounded bg-[var(--primary-soft)] text-sm text-[var(--primary-text)]">
              <strong>💡 Tip:</strong> Use the "AI Recommend Metrics" button on the Metrics page
              to let AI suggest metrics based on your schema.
            </div>
          </div>
        </WizardStep>
      </div>
    </div>
  );
}
