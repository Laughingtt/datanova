import { useState } from "react";
import { format as sqlFormat } from "sql-formatter";
import { useCopy } from "../../hooks/useCopy";
import { tokenizeSql, TOKEN_CLASS } from "./sqlTokenize";

interface SqlBlockProps {
  sql: string;
}

export default function SqlBlock({ sql: rawSql }: SqlBlockProps) {
  const [formatted, setFormatted] = useState(false);
  const { copied, copy } = useCopy({ inline: true, successText: "SQL 已复制" });

  const displaySql = formatted
    ? sqlFormat(rawSql, { language: "mysql", tabWidth: 2, keywordCase: "upper" })
    : rawSql;

  const handleCopy = () => copy(displaySql);

  const handleFormat = () => {
    setFormatted((prev) => !prev);
  };

  const tokens = tokenizeSql(displaySql);

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
            className={`text-xs transition-colors font-mono inline-flex items-center gap-1 ${
              copied ? "text-[var(--success)]" : "text-[var(--stone)] hover:text-[var(--primary)]"
            }`}
            aria-live="polite"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                已复制
              </>
            ) : (
              "复制"
            )}
          </button>
        </div>
      </div>
      <pre className="bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed overflow-x-auto">
        <code className="font-mono">
          {tokens.map((t, idx) => (
            <span key={idx} className={TOKEN_CLASS[t.type]}>{t.value}</span>
          ))}
        </code>
      </pre>
    </div>
  );
}
