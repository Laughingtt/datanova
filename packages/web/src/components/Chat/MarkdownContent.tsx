import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-sm border-collapse" style={{ borderSpacing: 0 }}>
        {children}
      </table>
    </div>
  );
}

function MarkdownThead({ children }: { children?: React.ReactNode }) {
  return <thead style={{ borderBottom: "2px solid var(--hairline)" }}>{children}</thead>;
}

function MarkdownTbody({ children }: { children?: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

function MarkdownTr({ children }: { children?: React.ReactNode }) {
  return <tr style={{ borderBottom: "1px solid var(--hairline)" }}>{children}</tr>;
}

function MarkdownTh({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "var(--steel)" }}>
      {children}
    </th>
  );
}

function MarkdownTd({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-sm whitespace-nowrap" style={{ color: "var(--ink)" }}>
      {children}
    </td>
  );
}

function MarkdownCode({ children, className }: { children?: React.ReactNode; className?: string }) {
  const isBlock = className?.startsWith("language-");
  if (isBlock) {
    return (
      <pre className="my-2 p-3 rounded-lg text-xs overflow-x-auto" style={{ backgroundColor: "var(--canvas)", border: "1px solid var(--hairline)" }}>
        <code>{children}</code>
      </pre>
    );
  }
  return (
    <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--canvas)", color: "var(--primary)" }}>
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
    <h1 className="text-lg font-bold mt-4 mb-2" style={{ color: "var(--ink)" }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5" style={{ color: "var(--ink)" }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1" style={{ color: "var(--ink)" }}>{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed my-1.5" style={{ color: "var(--ink)" }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="text-sm my-1.5 list-disc pl-5 space-y-0.5" style={{ color: "var(--ink)" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-sm my-1.5 list-decimal pl-5 space-y-0.5" style={{ color: "var(--ink)" }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 text-sm italic" style={{ borderColor: "var(--primary)", color: "var(--steel)" }}>
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-3" style={{ borderColor: "var(--hairline)" }} />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: "var(--ink)" }}>{children}</strong>
  ),
  a: ({ href, children }) => (
    <a href={href} className="underline" style={{ color: "var(--primary)" }} target="_blank" rel="noopener noreferrer">{children}</a>
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
