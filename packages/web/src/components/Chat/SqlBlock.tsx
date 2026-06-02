interface SqlBlockProps {
  sql: string;
}

export default function SqlBlock({ sql }: SqlBlockProps) {
  return (
    <div className="my-3 rounded-sm overflow-hidden">
      <div className="bg-dark-navy px-4 py-2 flex items-center justify-between">
        <span className="text-micro text-white/60 font-mono uppercase tracking-wider">SQL</span>
        <button
          onClick={() => navigator.clipboard.writeText(sql)}
          className="text-micro text-white/40 hover:text-white/80 transition-colors font-mono"
        >
          Copy
        </button>
      </div>
      <pre className="bg-dark-navy px-4 py-3 text-feature-heading leading-relaxed overflow-x-auto">
        <code className="text-[#4ec9b0] font-mono">{sql}</code>
      </pre>
    </div>
  );
}
