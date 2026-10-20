import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { tokenizeSql, TOKEN_CLASS } from "./sqlTokenize";

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-sm border-collapse border-spacing-0">
        {children}
      </table>
    </div>
  );
}

function MarkdownThead({ children }: { children?: React.ReactNode }) {
  return <thead className="border-b border-[var(--border)]">{children}</thead>;
}

function MarkdownTbody({ children }: { children?: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

function MarkdownTr({ children }: { children?: React.ReactNode }) {
  return <tr className="border-b border-[var(--border)]">{children}</tr>;
}

function MarkdownTh({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-[var(--muted-foreground)]">
      {children}
    </th>
  );
}

function MarkdownTd({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-sm whitespace-nowrap text-[var(--foreground)]">
      {children}
    </td>
  );
}

function MarkdownCode({ children, className }: { children?: React.ReactNode; className?: string }) {
  const isBlock = className?.startsWith("language-");
  if (isBlock) {
    const lang = className?.replace("language-", "").toLowerCase();
    const raw = typeof children === "string" ? children : String(children ?? "");
    // 对 ```sql 代码块应用与 SqlBlock 一致的语法高亮，避免 Markdown 代码块灰底低对比度
    if (lang === "sql" || lang === "mysql") {
      const tokens = tokenizeSql(raw);
      return (
        <pre className="my-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] text-xs text-[var(--foreground)] overflow-x-auto font-mono">
          <code>
            {tokens.map((t, idx) => (
              <span key={idx} className={TOKEN_CLASS[t.type]}>{t.value}</span>
            ))}
          </code>
        </pre>
      );
    }
    return (
      <pre className="my-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] text-xs text-[var(--foreground)] overflow-x-auto">
        <code>{children}</code>
      </pre>
    );
  }
  return (
    <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs text-[var(--foreground)]">
      {children}
    </code>
  );
}

const components: Components = {
  table: MarkdownTable as any,
  thead: MarkdownThead as any,
  tbody: MarkdownTbody as any,
  tr: MarkdownTr as any,
  th: MarkdownTh as any,
  td: MarkdownTd as any,
  code: MarkdownCode as any,
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-4 mb-2 text-[var(--foreground)]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 text-[var(--foreground)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1 text-[var(--foreground)]">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed my-1.5 text-[var(--foreground)]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="text-sm my-1.5 list-disc pl-5 space-y-0.5 text-[var(--foreground)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-sm my-1.5 list-decimal pl-5 space-y-0.5 text-[var(--foreground)]">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-[var(--border)] text-sm italic text-[var(--muted-foreground)]">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-3 border-[var(--border)]" />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a href={href} className="underline text-[var(--primary-text)]" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
};

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
