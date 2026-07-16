import type { TableData } from "../hooks/useAgentStream";

/**
 * Extract tables from Markdown content (GFM table syntax).
 * Returns an array of TableData objects, one per markdown table found.
 */
export function extractMarkdownTables(markdown: string): TableData[] {
  const tables: TableData[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].includes("|") || lines[i].trim().startsWith("```")) {
      i++;
      continue;
    }

    const headerLine = lines[i].trim();
    if (i + 1 >= lines.length) { i++; continue; }
    const sepLine = lines[i + 1].trim();
    if (!/^\|?[\s\-:]+(\|[\s\-:]+)+\|?$/.test(sepLine)) { i++; continue; }

    const columns = parsePipeLine(headerLine);
    if (columns.length === 0) { i++; continue; }

    i += 2;

    const rows: Record<string, unknown>[] = [];
    while (i < lines.length && lines[i].includes("|") && !lines[i].trim().startsWith("```")) {
      const values = parsePipeLine(lines[i].trim());
      if (values.length === 0) break;
      const row: Record<string, unknown> = {};
      for (let j = 0; j < columns.length; j++) {
        const raw = j < values.length ? values[j].trim() : "";
        // Strip commas, percent, emoji for numeric parsing
        const cleaned = raw
          .replace(/,/g, "")
          .replace(/%/g, "")
          .replace(/[\u4e07\u4ebf]/g, "")
          .replace(/[\ufe0f\u2b07\u2b06\u2b50]/g, "");
        const num = Number(cleaned);
        row[columns[j]] = isNaN(num) || cleaned === "" ? raw : num;
      }
      rows.push(row);
      i++;
    }

    if (rows.length > 0) {
      tables.push({ columns, rows });
    }
  }

  return tables;
}

function parsePipeLine(line: string): string[] {
  let trimmed = line;
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((s) => s.trim());
}
