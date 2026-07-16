import { useState } from "react";
import { format as sqlFormat } from "sql-formatter";

interface SqlBlockProps {
  sql: string;
}

export default function SqlBlock({ sql: rawSql }: SqlBlockProps) {
  const [formatted, setFormatted] = useState(false);

  const displaySql = formatted
    ? sqlFormat(rawSql, { language: "mysql", tabWidth: 2, keywordCase: "upper" })
    : rawSql;

  const handleCopy = () => {
    navigator.clipboard.writeText(displaySql);
  };

  const handleFormat = () => {
    setFormatted((prev) => !prev);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[var(--hairline)]">
      <div className="bg-[var(--surface)] px-4 py-2 flex items-center justify-between border-b border-[var(--hairline)]">
        <span className="text-xs text-[var(--steel)] font-mono uppercase tracking-wider">SQL</span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleFormat}
            className="text-xs text-[var(--stone)] hover:text-[var(--primary)] transition-colors font-mono"
          >
            {formatted ? "压缩" : "格式化"}
          </button>
          <button
            onClick={handleCopy}
            className="text-xs text-[var(--stone)] hover:text-[var(--primary)] transition-colors font-mono"
          >
            复制
          </button>
        </div>
      </div>
      <pre className="bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed overflow-x-auto">
        <code className="text-[var(--primary-text)] font-mono">{displaySql}</code>
      </pre>
    </div>
  );
}
