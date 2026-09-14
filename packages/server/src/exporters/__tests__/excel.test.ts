/**
 * Tests for the Excel exporter. We verify the workbook structure and
 * serialised bytes by parsing the xlsx back into a JSON shape via exceljs.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { toExcel } from '../excel.js';

async function parseBuffer(buffer: Buffer): Promise<{
  headers: string[];
  rows: unknown[][];
  sheetName: string;
}> {
  const wb = new ExcelJS.Workbook();
  // exceljs types expect Buffer<ArrayBuffer>; runtime accepts any Buffer.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('workbook has no worksheets');
  const headerRow = sheet.getRow(1);
  const headers = headerRow.values as unknown[];
  const cleanHeaders = headers.slice(1).map((h) => String(h));
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: unknown[] = [];
    for (let i = 1; i <= cleanHeaders.length; i++) {
      const cell = row.getCell(i);
      // exceljs returns richValue for hyperlinks, text otherwise
      cells.push(cell.value as unknown);
    }
    rows.push(cells);
  });
  return { headers: cleanHeaders, rows, sheetName: sheet.name };
}

describe('toExcel', () => {
  it('produces a workbook with one sheet, header row and data rows', async () => {
    const buf = await toExcel(
      'Orders',
      ['id', 'amount'],
      [
        [1, 99.5],
        [2, 200],
      ]
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);

    const parsed = await parseBuffer(buf);
    expect(parsed.sheetName).toBe('Orders');
    expect(parsed.headers).toEqual(['id', 'amount']);
    expect(parsed.rows).toEqual([[1, 99.5], [2, 200]]);
  });

  it('handles null cells as empty', async () => {
    const buf = await toExcel('S', ['a', 'b'], [[null, 'x']]);
    const parsed = await parseBuffer(buf);
    expect(parsed.rows).toEqual([[null, 'x']]);
  });

  it('preserves Chinese strings', async () => {
    const buf = await toExcel('城市', ['名称'], [['北京'], ['上海']]);
    const parsed = await parseBuffer(buf);
    expect(parsed.headers).toEqual(['名称']);
    expect(parsed.rows).toEqual([['北京'], ['上海']]);
  });

  it('auto-sizes columns based on header length', async () => {
    const buf = await toExcel('S', ['short', 'a-much-longer-column-name'], []);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    const widths = sheet.columns.map((c) => c.width || 0);
    // first column short, second wider
    expect(widths[0]).toBeLessThan(widths[1]!);
  });

  it('returns an empty workbook (only header) for empty rows', async () => {
    const buf = await toExcel('S', ['a'], []);
    const parsed = await parseBuffer(buf);
    expect(parsed.headers).toEqual(['a']);
    expect(parsed.rows).toEqual([]);
  });
});