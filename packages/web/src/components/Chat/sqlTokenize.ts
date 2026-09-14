// SQL 语法高亮 tokenizer，供 SqlBlock 与 MarkdownContent 中的 ```sql 代码块共用。
// 关键字（MySQL 方言）
const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS",
  "ON", "AS", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "IS", "NULL",
  "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "ALL", "DISTINCT",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP",
  "ALTER", "ADD", "COLUMN", "INDEX", "VIEW", "CASE", "WHEN", "THEN", "ELSE", "END",
  "ASC", "DESC", "WITH", "RECURSIVE", "PARTITION", "OVER", "ROWS", "RANGE",
  "UNBOUNDED", "PRECEDING", "FOLLOWING", "CURRENT", "ROW", "IF", "EXISTS",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "ROW_NUMBER", "RANK", "DENSE_RANK",
  "LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "NTILE", "COALESCE", "CAST", "CONVERT",
  "CONCAT", "SUBSTRING", "TRIM", "LOWER", "UPPER", "LENGTH", "REPLACE", "POSITION",
  "DATE", "TIME", "TIMESTAMP", "EXTRACT", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND",
  "INTERVAL", "NOW", "CURDATE", "CURTIME", "DATE_FORMAT", "STR_TO_DATE",
  "IFNULL", "NULLIF", "GREATEST", "LEAST",
  "SHOW", "DESCRIBE", "EXPLAIN", "USE", "DATABASE",
]);

export type TokenType = "string" | "comment" | "number" | "keyword" | "ident" | "punct" | "ws" | "other";
export type Token = { type: TokenType; value: string };

// 把单条 SQL 切成 token：字符串、行注释、块注释、数字、关键字、标识符、其他
export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";

    // 单行注释 -- ... 或 # ... 或 //
    if ((ch === "-" && next === "-") || ch === "#") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      tokens.push({ type: "comment", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    // 块注释 /* ... */
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(sql[j] === "*" && sql[j + 1] === "/")) j++;
      j = Math.min(j + 2, n);
      tokens.push({ type: "comment", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    // 单引号/双引号字符串（支持 \' 转义和 '' 转义）
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "\\" && j + 1 < n) { j += 2; continue; }
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) { j += 2; continue; }
          j++; break;
        }
        j++;
      }
      tokens.push({ type: "string", value: sql.slice(i, Math.min(j, n)) });
      i = Math.min(j, n);
      continue;
    }
    // 反引号标识符
    if (ch === "`") {
      let j = i + 1;
      while (j < n && sql[j] !== "`") j++;
      j = Math.min(j + 1, n);
      tokens.push({ type: "ident", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    // 数字（含小数）
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next))) {
      let j = i;
      while (j < n && /[0-9.]/.test(sql[j])) j++;
      tokens.push({ type: "number", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    // 标识符 / 关键字
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      // 大写形式匹配关键字（保留原文小写也认）
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: "keyword", value: word });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }
    // 空白
    if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(sql[j])) j++;
      tokens.push({ type: "ws", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    // 标点
    if ("(),.;,=<>!+-*/%".includes(ch)) {
      tokens.push({ type: "punct", value: ch });
      i++;
      continue;
    }
    tokens.push({ type: "other", value: ch });
    i++;
  }
  return tokens;
}

// 配色针对浅色背景（--surface / --canvas #ffffff）调校：
// - 关键字用主色调靛蓝 accent-700，醒目且与项目主色一致
// - 字符串用 emerald-700，数字用 amber-700，对比度足够清晰
// - 标识符用深墨色 ink，保证正文可读；标点用 steel 略弱化但不隐形
// - 注释用 slate 斜体，与正文区分但保持可读
export const TOKEN_CLASS: Record<TokenType, string> = {
  keyword: "text-[var(--accent-700)] font-semibold",
  string:  "text-emerald-700",
  number:  "text-amber-700",
  comment: "text-[var(--slate)] italic",
  ident:   "text-[var(--ink)]",
  punct:   "text-[var(--steel)]",
  ws:      "",
  other:   "text-[var(--ink)]",
};
