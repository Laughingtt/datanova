import { useState, useEffect, useMemo } from "react";
import type { TableData } from "../../hooks/useAgentStream";
import {
  type ChartType,
  type ChartInference,
  inferChartType,
  truncateForChart,
} from "../../utils/chart-inference";
import {
  BarChartRenderer,
  LineChartRenderer,
  PieChartRenderer,
  AreaChartRenderer,
  ScatterChartRenderer,
  KpiCardRenderer,
} from "../ChartRenderers";

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "柱形图",
  line: "折线图",
  area: "面积图",
  pie: "饼图",
  scatter: "散点图",
  kpi_card: "数值卡片",
};

interface ChartViewProps {
  data: TableData;
}

export default function ChartView({ data }: ChartViewProps) {
  const inference = useMemo(() => inferChartType(data), [data]);
  const [chartType, setChartType] = useState<ChartType | null>(null);
  const truncated = data.rows.length > 100;

  const chartData = useMemo(() => {
    if (data.rows.length > 100) {
      return truncateForChart(data);
    }
    return data;
  }, [data]);

  useEffect(() => {
    if (inference) {
      setChartType(inference.recommended);
    }
  }, [inference]);

  if (!inference || !chartType) return null;

  const renderChart = () => {
    switch (chartType) {
      case "bar": return <BarChartRenderer data={chartData} config={inference} />;
      case "line": return <LineChartRenderer data={chartData} config={inference} />;
      case "area": return <AreaChartRenderer data={chartData} config={inference} />;
      case "pie": return <PieChartRenderer data={chartData} config={inference} />;
      case "scatter": return <ScatterChartRenderer data={chartData} config={inference} />;
      case "kpi_card": return <KpiCardRenderer data={chartData} config={inference} />;
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-3 py-2">
        <div className="tabs-track">
          {inference.available.map((ct) => (
            <button
              key={ct}
              onClick={() => setChartType(ct)}
              data-active={chartType === ct}
              className="tab-trigger h-7 px-2.5 text-xs"
            >
              {CHART_TYPE_LABELS[ct]}
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 py-3">
        {renderChart()}
        {truncated && (
          <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
            {"仅展示前 100 条数据"}
          </p>
        )}
      </div>
    </div>
  );
}
