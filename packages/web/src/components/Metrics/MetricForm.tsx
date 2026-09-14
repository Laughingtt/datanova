import { useState, useEffect } from "react";
import type { SemanticMetric, SemanticDimension } from "../../api/client";
import { semanticApi } from "../../api/client";
import TableColumnPicker from "./TableColumnPicker";

interface MetricFormProps {
  datasourceId: string;
  metric?: SemanticMetric | null;
  dimensions: SemanticDimension[];
  onSave: () => void;
  onDelete: () => void;
}

export default function MetricForm({
  datasourceId,
  metric,
  dimensions,
  onSave,
  onDelete,
}: MetricFormProps) {
  const isEdit = !!metric;

  const [name, setName] = useState(metric?.name ?? "");
  const [displayName, setDisplayName] = useState(metric?.display_name ?? "");
  const [description, setDescription] = useState(metric?.description ?? "");
  const [sql, setSql] = useState(metric?.sql ?? "");
  const [metricType, setMetricType] = useState<"atomic" | "derived" | "compound">(
    metric?.metric_type ?? "atomic"
  );
  const [businessContext, setBusinessContext] = useState(metric?.business_context ?? "");
  const [calculationLogic, setCalculationLogic] = useState(metric?.calculation_logic ?? "");
  const [applicableScenarios, setApplicableScenarios] = useState(metric?.applicable_scenarios ?? "");
  const [dataQualityNotes, setDataQualityNotes] = useState(metric?.data_quality_notes ?? "");
  const [defaultSort, setDefaultSort] = useState(metric?.default_sort ?? "");
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(() => {
    if (!metric?.dimensions) return [];
    try {
      return JSON.parse(metric.dimensions);
    } catch {
      return metric.dimensions.split(",").filter(Boolean);
    }
  });
  const [defaultGranularity, setDefaultGranularity] = useState(metric?.default_granularity ?? "");
  const [unit, setUnit] = useState(metric?.unit ?? "");
  const [category, setCategory] = useState(metric?.category ?? "");
  const [aliases, setAliases] = useState(metric?.aliases ?? "");
  const [status, setStatus] = useState<"draft" | "published" | "deprecated">(
    metric?.status ?? "draft"
  );
  // Re-initialize form when metric prop changes
  useEffect(() => {
    setName(metric?.name ?? "");
    setDisplayName(metric?.display_name ?? "");
    setDescription(metric?.description ?? "");
    setSql(metric?.sql ?? "");
    setMetricType(metric?.metric_type ?? "atomic");
    setBusinessContext(metric?.business_context ?? "");
    setCalculationLogic(metric?.calculation_logic ?? "");
    setApplicableScenarios(metric?.applicable_scenarios ?? "");
    setDataQualityNotes(metric?.data_quality_notes ?? "");
    setDefaultSort(metric?.default_sort ?? "");
    try {
      setSelectedDimensions(metric?.dimensions ? JSON.parse(metric.dimensions) : []);
    } catch {
      setSelectedDimensions(metric?.dimensions ? metric.dimensions.split(",").filter(Boolean) : []);
    }
    setDefaultGranularity(metric?.default_granularity ?? "");
    setUnit(metric?.unit ?? "");
    setCategory(metric?.category ?? "");
    setAliases(metric?.aliases ?? "");
    setStatus(metric?.status ?? "draft");
    setError(null);
    setTestResult(null);
    setTestError(null);
  }, [metric]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const toggleDimension = (dimName: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimName)
        ? prev.filter((d) => d !== dimName)
        : [...prev, dimName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        display_name: displayName,
        description,
        sql,
        metric_type: metricType,
        business_context: businessContext,
        calculation_logic: calculationLogic,
        applicable_scenarios: applicableScenarios,
        data_quality_notes: dataQualityNotes,
        default_sort: defaultSort || null,
        dimensions: JSON.stringify(selectedDimensions),
        default_granularity: defaultGranularity || null,
        unit: unit || null,
        category: category || null,
        aliases,
        status,
      };

      if (isEdit && metric) {
        await semanticApi.updateMetric(datasourceId, metric.id, payload);
      } else {
        await semanticApi.createMetric(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!metric) return;
    if (!confirm("确定要删除此指标吗？")) return;
    setDeleting(true);
    try {
      await semanticApi.deleteMetric(datasourceId, metric.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    if (!metric) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await semanticApi.testMetric(datasourceId, metric.id);
      setTestResult(result);
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card-base">
      <h3 className="font-display text-heading-4 text-[var(--ink)] mb-5">
        {isEdit ? "编辑指标" : "新增指标"}
      </h3>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Row: name + display_name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-mono">标识名</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="revenue"
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="label-mono">显示名称</label>
            <input
              className="input-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="营收"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label-mono">描述</label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述这个指标衡量什么..."
          />
        </div>

        {/* Metric Type */}
        <div>
          <label className="label-mono">指标类型</label>
          <div className="flex gap-2">
            {[
              { value: 'atomic', label: '原子指标', desc: '单表聚合' },
              { value: 'derived', label: '衍生指标', desc: '比率/差值' },
              { value: 'compound', label: '复合指标', desc: '窗口函数/CTE' },
            ].map(t => (
              <button key={t.value} type="button"
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  metricType === t.value
                    ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]'
                    : 'border-[var(--hairline)] text-[var(--steel)]'
                }`}
                onClick={() => setMetricType(t.value as "atomic" | "derived" | "compound")}
              >
                {t.label}
                <span className="text-xs opacity-70 ml-1">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* SQL (full executable SQL) */}
        <div>
          <label className="label-mono">完整 SQL 语句</label>
          <TableColumnPicker
            datasourceId={datasourceId}
            value={sql}
            onChange={setSql}
            mode="aggregate"
            placeholder="SELECT SUM(amount) AS revenue FROM orders"
          />
        </div>

        {/* Business Context */}
        <div>
          <label className="label-mono">业务描述</label>
          <textarea
            className="input-field min-h-[60px] resize-y"
            value={businessContext}
            onChange={(e) => setBusinessContext(e.target.value)}
            placeholder="描述这个指标在业务上的含义..."
          />
        </div>

        {/* Calculation Logic */}
        <div>
          <label className="label-mono">计算逻辑</label>
          <textarea
            className={`input-field min-h-[60px] resize-y ${metricType !== 'atomic' ? 'border-[var(--warning)]' : ''}`}
            value={calculationLogic}
            onChange={(e) => setCalculationLogic(e.target.value)}
            placeholder={metricType === 'derived' ? '分子/分母的计算方式，注意同步修改' : metricType === 'compound' ? '窗口函数/CTE 的计算逻辑' : '如何计算此指标'}
          />
          {metricType !== 'atomic' && !calculationLogic && (
            <p className="text-xs text-[var(--warning)] mt-1">
              {metricType === 'derived' ? '衍生指标建议填写计算逻辑，避免修改时分子分母不同步' : '复合指标建议填写计算逻辑，说明窗口函数/CTE 的作用'}
            </p>
          )}
        </div>

        {/* Applicable Scenarios */}
        <div>
          <label className="label-mono">适用场景</label>
          <textarea
            className="input-field min-h-[60px] resize-y"
            value={applicableScenarios}
            onChange={(e) => setApplicableScenarios(e.target.value)}
            placeholder="月度经营分析、销售报表..."
          />
        </div>

        {/* Data Quality Notes */}
        <div>
          <label className="label-mono">数据质量提示</label>
          <textarea
            className="input-field min-h-[60px] resize-y"
            value={dataQualityNotes}
            onChange={(e) => setDataQualityNotes(e.target.value)}
            placeholder="数据质量注意事项..."
          />
        </div>

        {/* Dimensions multi-select */}
        <div>
          <label className="label-mono">维度</label>
          <div className="flex flex-wrap gap-2 p-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] min-h-[44px]">
            {dimensions.length === 0 ? (
              <span className="text-xs text-[var(--stone)]">暂无可用维度</span>
            ) : (
              dimensions.map((d) => {
                const isSelected = selectedDimensions.includes(d.name);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDimension(d.name)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[var(--primary)] text-[var(--on-dark)]"
                        : "bg-[var(--surface)] text-[var(--slate)] border border-[var(--hairline)]"
                    }`}
                  >
                    {d.display_name || d.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Row: granularity + unit + category + default_sort */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-mono">默认粒度</label>
            <select
              className="input-field"
              value={defaultGranularity}
              onChange={(e) => setDefaultGranularity(e.target.value)}
            >
              <option value="">无</option>
              <option value="day">天</option>
              <option value="week">周</option>
              <option value="month">月</option>
              <option value="quarter">季度</option>
              <option value="year">年</option>
            </select>
          </div>
          <div>
            <label className="label-mono">单位</label>
            <input
              className="input-field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="元, %, 个"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-mono">分类</label>
            <input
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="财务, 运营"
            />
          </div>
          <div>
            <label className="label-mono">默认排序</label>
            <input
              className="input-field"
              value={defaultSort}
              onChange={(e) => setDefaultSort(e.target.value)}
              placeholder="revenue DESC"
            />
          </div>
        </div>

        {/* Aliases */}
        <div>
          <label className="label-mono">别名（逗号分隔）</label>
          <input
            className="input-field"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="revenue, total_revenue, 营收"
          />
        </div>

        {/* Status */}
        <div>
          <label className="label-mono">状态</label>
          <div className="flex gap-3">
            {(["draft", "published", "deprecated"] as const).map((s) => {
              const badge = {
                draft: { dot: "bg-[var(--warning)]", label: "草稿" },
                published: { dot: "bg-[var(--success)]", label: "已发布" },
                deprecated: { dot: "bg-[var(--error)]", label: "已弃用" },
              }[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border transition-colors ${
                    status === s
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--hairline)] text-[var(--steel)]"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                  {badge.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-dark" disabled={saving}>
            {saving ? "保存中..." : isEdit ? "更新" : "创建"}
          </button>
          {isEdit && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? "测试中..." : "测试"}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "删除中..." : "删除"}
              </button>
            </>
          )}
        </div>
      </form>

      {/* Test result preview */}
      {(testResult || testError) && (
        <div className="mt-5 border-t border-[var(--hairline)] pt-4">
          <h4 className="label-mono mb-2">测试结果</h4>
          {testError && (
            <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
              {testError}
            </div>
          )}
          {testResult && (
            <div className="p-3 rounded-md bg-[var(--surface)] border border-[var(--hairline)]">
              {testResult.rows && (
                <p className="text-xs text-[var(--steel)] mb-2">
                  {testResult.rows.length} 行返回
                  {testResult.execution_time_ms && ` (${testResult.execution_time_ms}ms)`}
                </p>
              )}
              {testResult.rows && testResult.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--hairline)]">
                        {Object.keys(testResult.rows[0]).map((col: string) => (
                          <th key={col} className="text-left py-1.5 px-2 font-mono text-[var(--steel)]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.rows.slice(0, 5).map((row: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-b border-[var(--hairline-soft)]">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="py-1.5 px-2 text-[var(--ink)]">
                              {String(val ?? "NULL")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {testResult.rows.length > 5 && (
                    <p className="text-xs text-[var(--steel)] mt-1">
                      ... and {testResult.rows.length - 5} 更多行
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
