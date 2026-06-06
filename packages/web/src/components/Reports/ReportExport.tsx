interface ReportExportProps {
  rawContent: string;
  title?: string;
}

export default function ReportExport({ rawContent, title = "report" }: ReportExportProps) {
  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    downloadBlob(rawContent, `${title}.md`, "text/markdown;charset=utf-8");
  };

  const exportHtml = () => {
    // Simple markdown-to-HTML conversion for basic formatting
    const htmlContent = rawContent
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br />\n");

    const fullHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.6; }
    h1, h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
    code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    downloadBlob(fullHtml, `${title}.html`, "text/html;charset=utf-8");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportMarkdown}
        className="btn-ghost text-xs"
        title="Export as Markdown"
      >
        Export .md
      </button>
      <button
        onClick={exportHtml}
        className="btn-ghost text-xs"
        title="Export as HTML"
      >
        Export .html
      </button>
    </div>
  );
}
