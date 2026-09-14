/**
 * Text exporters — CSV, TSV, JSON.
 *
 * The agent returns data in *column-oriented* form (a list of column names
 * and a list of row arrays). These helpers transform that into the formats
 * analysts actually share in their day-to-day work.
 *
 * Why hand-rolled CSV?
 *   - `csv-stringify` etc. are heavy and bring transitive deps we don't
 *     need. CSV is simple enough to be a 30-line function.
 *   - We want predictable behaviour for Chinese keys/values and embedded
 *     newlines.
 *   - It's pure & synchronous → easy to test.
 */

/**
 * Convert a column-oriented dataset to CSV.
 *
 * Format: RFC 4180 with UTF-8 (no BOM by default — clients can prepend if
 * Excel-on-Windows needs it).
 *
 * Quoting rules:
 *   - Wrap in double quotes if value contains: comma, double quote,
 *     carriage return, line feed.
 *   - Escape embedded double quotes by doubling them (`"` → `""`).
 *
 * Null / undefined become the empty string. Objects are JSON-stringified.
 *
 * @throws if any row's length does not match `columns.length`.
 */
export function toCsv(columns: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return toDelimited(columns, rows, ',', '"');
}

/**
 * Tab-separated values. Useful when the data legitimately contains commas.
 * Same quoting rules as CSV except only `\t`, `\n`, `\r` and `"` force quoting.
 */
export function toTsv(columns: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return toDelimited(columns, rows, '\t', '"');
}

/**
 * Shared delimited-text writer. Used by toCsv/toTsv.
 */
function toDelimited(
  columns: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  delimiter: string,
  quote: string
): string {
  const lines: string[] = [columns.map((c) => escapeCell(c, delimiter, quote)).join(delimiter)];
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(
        `Row has ${row.length} cells, expected ${columns.length} (columns: ${JSON.stringify(columns)})`
      );
    }
    lines.push(row.map((cell) => escapeCell(cellToString(cell), delimiter, quote)).join(delimiter));
  }
  return lines.join('\n');
}

/** Convert any cell to its string representation for export. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Escape one cell value for delimited output. */
function escapeCell(raw: string, delimiter: string, quote: string): string {
  const needsQuoting =
    raw.includes(delimiter) || raw.includes(quote) || raw.includes('\n') || raw.includes('\r');
  if (!needsQuoting) return raw;
  return `${quote}${raw.replaceAll(quote, quote + quote)}${quote}`;
}

/**
 * Convert column-oriented data to an array of plain objects (one per row).
 * Useful for JSON export and for any consumer that prefers row-oriented data.
 */
export function jsonRowsToObjects<T extends string>(
  columns: readonly T[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): Record<T, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]!] = row[i];
    }
    return obj as Record<T, unknown>;
  });
}

/**
 * Produce a JSON array of row objects, pretty-printed.
 *
 * Why pretty-printed by default?
 *   - Easier to diff in PRs / version control when analysts commit exports.
 *   - Analysts often open exports in a text editor for quick inspection.
 *   - Size cost is negligible for the typical ≤ 1000-row export.
 *
 * Pass `{ compact: true }` for machine-to-machine usage.
 */
export function toJson(
  columns: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  opts: { compact?: boolean } = {}
): string {
  const data = jsonRowsToObjects(columns, rows);
  return JSON.stringify(data, null, opts.compact ? 0 : 2);
}

/**
 * Build a sensible default export filename: `<base>-YYYYMMDD-HHMMSS.<ext>`.
 *
 * The base is sanitised — non-word characters become `-`. Empty base falls
 * back to `export`.
 */
export function suggestFilename(base: string, ext: string): string {
  const safeBase = (base || 'export').replace(/[^\w一-鿿-]+/g, '-').replace(/^-+|-+$/g, '');
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${safeBase}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.${ext}`;
}