import {
  BarChart as RechartsBar,
  Bar,
  LineChart as RechartsLine,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  AreaChart as RechartsArea,
  Area,
  ScatterChart as RechartsScatter,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import type { TableData } from "../hooks/useAgentStream";
import {
  type ChartInference,
  CHART_COLORS,
  mergePieData,
} from "../utils/chart-inference";

const GRID_COLOR = "#e2e8f0";
const AXIS_COLOR = "#64748b";
const TOOLTIP_BG = "#ffffff";
const TOOLTIP_BORDER = "#e2e8f0";
const MAX_BAR_LABEL_LEN = 6;

const tooltipStyle: React.CSSProperties = {
  backgroundColor: TOOLTIP_BG,
  border: "1px solid " + TOOLTIP_BORDER,
  borderRadius: 6,
  fontSize: 12,
  padding: "6px 10px",
  boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
};

export function BarChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const isLongLabel = data.rows.some((r) => String(r[config.xColumn] ?? "").length > MAX_BAR_LABEL_LEN);
  const layout = isLongLabel ? "vertical" as const : "horizontal" as const;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBar data={data.rows} layout={layout} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        {layout === "horizontal" ? (
          <>
            <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
            <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
            <YAxis dataKey={config.xColumn} type="category" tick={{ fill: AXIS_COLOR, fontSize: 11 }} width={80} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={48} />
        ))}
      </RechartsBar>
    </ResponsiveContainer>
  );
}

export function LineChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsLine data={data.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Line key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 5 }} />
        ))}
      </RechartsLine>
    </ResponsiveContainer>
  );
}

export function AreaChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsArea data={data.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Area key={col} type="monotone" dataKey={col} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
        ))}
      </RechartsArea>
    </ResponsiveContainer>
  );
}

export function PieChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const valueCol = config.yColumns[0];
  const catCol = config.categoryColumn ?? config.xColumn;
  const pieData = mergePieData(data.rows, catCol, valueCol);
  const renderLabel = ({ name, percent }: { name?: string; percent?: number }) => (name ?? "") + " " + ((percent ?? 0) * 100).toFixed(0) + "%";
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsPie margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="name" label={renderLabel} labelLine={{ stroke: AXIS_COLOR, strokeWidth: 1 }}>
          {pieData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </RechartsPie>
    </ResponsiveContainer>
  );
}

export function ScatterChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const scatterData = data.rows.map((r) => ({ x: Number(r[config.xColumn]) || 0, y: Number(r[config.yColumns[0]]) || 0, ...r }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsScatter margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="x" name={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis dataKey="y" name={config.yColumns[0]} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <ZAxis range={[30, 30]} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown, name: unknown) => [Number(value).toFixed(2), String(name)]} labelFormatter={() => ""} />
        <Scatter data={scatterData} fill={CHART_COLORS[0]} />
      </RechartsScatter>
    </ResponsiveContainer>
  );
}

export function KpiCardRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const row = data.rows[0];
  return (
    <div className="flex flex-wrap gap-4 py-2">
      {config.yColumns.map((col, i) => {
        const val = row[col];
        const numVal = Number(val);
        const display = isNaN(numVal) ? String(val ?? "-") : numVal.toLocaleString();
        return (
          <div key={col} className="px-5 py-3 rounded-lg border min-w-[120px]" style={{ backgroundColor: "var(--surface)", borderColor: "var(--hairline)" }}>
            <div className="text-2xl font-mono font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
              {display}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--steel)" }}>{col}</div>
          </div>
        );
      })}
    </div>
  );
}
