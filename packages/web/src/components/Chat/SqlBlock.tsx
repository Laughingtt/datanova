interface SqlBlockProps {
  sql: string;
}

export default function SqlBlock({ sql }: SqlBlockProps) {
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[var(--hairline)]">
      <div className="bg-[var(--surface)] px-4 py-2 flex items-center justify-between border-b border-[var(--hairline)]">
        <span className="text-xs text-[var(--steel)] font-mono uppercase tracking-wider">SQL</span>
        <button
          onClick={() => navigator.clipboard.writeText(sql)}
          className="text-xs text-[var(--stone)] hover:text-[var(--primary)] transition-colors font-mono"
        >
          Copy
        </button>
      </div>
      <pre className="bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed overflow-x-auto">
        <code className="text-[var(--primary-text)] font-mono">{sql}</code>
      </pre>
    </div>
  );
}