/**
 * Export routes — turn a column-oriented result set into a downloadable
 * file in the analyst's chosen format.
 *
 * Why POST and not GET?
 *   The payload (columns + rows) can easily exceed URL length limits.
 *   POST-with-JSON is the obvious choice and the browser handles the
 *   response as a file download when Content-Disposition: attachment is set.
 *
 * Why these specific formats?
 *   - csv:  spreadsheet, BI tools, mail attachments, the lingua franca
 *   - tsv:  same as csv but tolerates commas in data
 *   - json: pipelines, API consumers, programmatic analysis
 *   - xlsx: the format business stakeholders ask for by default
 *
 * All outputs use `Content-Disposition: attachment` so the browser triggers
 * a download instead of rendering inline.
 */
import { Hono } from 'hono';
import { toCsv, toTsv, toJson, suggestFilename } from '../exporters/text.js';
import { toExcel } from '../exporters/excel.js';

type ExportFormat = 'csv' | 'tsv' | 'json' | 'xlsx';

const VALID_FORMATS: readonly ExportFormat[] = ['csv', 'tsv', 'json', 'xlsx'];

const FORMAT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

interface ExportBody {
  columns: string[];
  rows: unknown[][];
  filename?: string;
}

export function createExportRoutes(): Hono {
  const app = new Hono();

  app.post('/api/exports/:format', async (c) => {
    const format = c.req.param('format') as ExportFormat;
    if (!VALID_FORMATS.includes(format)) {
      return c.json(
        { error: `Unsupported format: ${format}. Allowed: ${VALID_FORMATS.join(', ')}` },
        400
      );
    }

    let body: ExportBody;
    try {
      body = (await c.req.json()) as ExportBody;
    } catch (e) {
      return c.json({ error: `Invalid JSON body: ${(e as Error).message}` }, 400);
    }

    if (!Array.isArray(body.columns) || body.columns.length === 0) {
      return c.json({ error: '`columns` must be a non-empty array' }, 400);
    }
    if (!Array.isArray(body.rows)) {
      return c.json({ error: '`rows` must be an array' }, 400);
    }

    // Defensive: validate every row's length up front, with a clear error.
    for (let i = 0; i < body.rows.length; i++) {
      if (!Array.isArray(body.rows[i]) || body.rows[i]!.length !== body.columns.length) {
        return c.json(
          {
            error: `Row ${i} has ${(body.rows[i] as unknown[])?.length ?? 0} cells, expected ${body.columns.length}`,
          },
          400
        );
      }
    }

    const base = (body.filename || 'export').replace(/\.[^.]+$/, '');
    const filename = suggestFilename(base, format === 'xlsx' ? 'xlsx' : format);
    const headers: Record<string, string> = {
      'Content-Type': FORMAT_MIME[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    };

    if (format === 'csv') {
      return c.body(toCsv(body.columns, body.rows as unknown[][]), 200, headers);
    }
    if (format === 'tsv') {
      return c.body(toTsv(body.columns, body.rows as unknown[][]), 200, headers);
    }
    if (format === 'json') {
      return c.body(toJson(body.columns, body.rows as unknown[][]), 200, headers);
    }
    // xlsx
    const buf = await toExcel('Data', body.columns, body.rows as unknown[][]);
    // Construct Response directly: Buffer is a Uint8Array at runtime but
    // Hono's typed wrappers reject ArrayBufferLike-backed buffers in tsc.
    return new Response(new Uint8Array(buf), { status: 200, headers });
  });

  return app;
}