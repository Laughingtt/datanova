// 统一的数据展示格式化工具：全项目共用，避免散落的 toLocaleString / Math.round
// 全部为纯函数，无副作用，可直接用于渲染与导出场景

/** 数字千分位：1234.5 -> "1,234.5" */
export function formatNumber(v: number | null | undefined, fractionDigits?: number): string {
  if (v == null || Number.isNaN(v)) return "—";
  return fractionDigits != null
    ? v.toLocaleString("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
    : v.toLocaleString("en-US");
}

/** 百分比：0.942 -> "94.2%"；保留 1 位小数 */
export function formatPercent(v: number | null | undefined, fractionDigits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(fractionDigits)}%`;
}

/** 执行耗时：[ms] 自适应 ms/s */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

/** 相对时间："3 分钟前"、"刚刚"、"2 天前" */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 5) return "刚刚";
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month} 个月前`;
  return `${Math.round(month / 12)} 年前`;
}

/** 绝对时间（短）：07/23 14:30 */
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}
